import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission } from "@/server/auth/rbac";
import type { RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getPayrollAccountingSettings, type PayrollAccountingSettings } from "./accounting-settings";
import { getPaymentProfileCoverage } from "./payment-profiles";
import { getPayrollPaymentSecurityReadiness, type PayrollPaymentSecuritySettings } from "./payment-security";
import { getPayrollDashboard } from "./service";
import type { PayrollItemView, PayrollRunView } from "./types";

export type PayrollExportType = "bank_transfer" | "accounting_journal";

export type PayrollExportView = {
  id: string;
  payrollRunId: string;
  periodLabel: string;
  exportType: PayrollExportType;
  format: string;
  status: "generated" | "downloaded";
  fileName: string;
  recordCount: number;
  contentHash: string;
  generatedAt: Date;
  downloadedAt?: Date | null;
  previewRows: Array<{
    label: string;
    description: string;
    amountLabel: string;
  }>;
  warnings: string[];
};

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee: { id: string; displayName: string } | null;
};

type DbPayrollExportSession = SessionLike & {
  tenantId: string;
  companyId: string;
};

type PayrollExportState = {
  exports: PayrollExportView[];
};

const globalForPayrollExports = globalThis as unknown as {
  hrOnePayrollExportDemoState?: PayrollExportState;
};

export async function getPayrollExportWorkspace(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  const payroll = await getPayrollDashboard(session);
  const employeeIds = payroll.run ? payrollEmployeeIds(payroll.run) : [];
  const paymentCoverage = await getPaymentProfileCoverage(session, employeeIds);
  const paymentSecurity = await getPayrollPaymentSecurityReadiness(session);
  const accountingSettings = await getPayrollAccountingSettings(session);
  const exports = canUseDatabase(session)
    ? await listDbPayrollExports(session).catch(() => listDemoPayrollExports())
    : listDemoPayrollExports();

  return {
    payrollRun: payroll.run,
    exports,
    paymentProfileCoverage: {
      totalEmployees: employeeIds.length,
      configuredEmployees: paymentCoverage.configuredEmployeeIds.size,
      missingEmployees: paymentCoverage.missingEmployeeIds.size,
    },
    paymentSecurity,
    accountingSettings,
    canGenerate: Boolean(
      payroll.run && (payroll.run.status === "locked" || payroll.run.status === "released") && payroll.run.items.length > 0,
    ),
  };
}

export async function generatePayrollExport(session: SessionLike, exportType: PayrollExportType) {
  assertPermission(session.role, "payroll:manage");
  const payroll = await getPayrollDashboard(session);
  const run = payroll.run;
  if (!run) {
    throw new Error("Create and calculate payroll before generating exports.");
  }
  if (run.status !== "locked" && run.status !== "released") {
    throw new Error("Payroll exports require a locked or released payroll run.");
  }
  if (run.items.length === 0) {
    throw new Error("Payroll must have calculated items before export.");
  }
  const paymentCoverage = await getPaymentProfileCoverage(session, payrollEmployeeIds(run));
  const paymentSecurity = await getPayrollPaymentSecurityReadiness(session);
  const accountingSettings = await getPayrollAccountingSettings(session);

  if (canUseDatabase(session)) {
    try {
      return await createDbPayrollExport(session, run, exportType, paymentCoverage.configuredEmployeeIds, accountingSettings, paymentSecurity.settings);
    } catch {
      return createDemoPayrollExport(session, run, exportType, paymentCoverage.configuredEmployeeIds, accountingSettings, paymentSecurity.settings);
    }
  }
  return createDemoPayrollExport(session, run, exportType, paymentCoverage.configuredEmployeeIds, accountingSettings, paymentSecurity.settings);
}

export function resetPayrollExportDemoState() {
  globalForPayrollExports.hrOnePayrollExportDemoState = {
    exports: [],
  };
}

function getDemoState() {
  if (!globalForPayrollExports.hrOnePayrollExportDemoState) {
    resetPayrollExportDemoState();
  }
  return globalForPayrollExports.hrOnePayrollExportDemoState!;
}

function listDemoPayrollExports() {
  return getDemoState().exports;
}

async function listDbPayrollExports(session: DbPayrollExportSession) {
  const records = await getDb().payrollExport.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
    },
    orderBy: { generatedAt: "desc" },
    take: 12,
    include: { payrollRun: true },
  });
  return records.map((record) => {
    const preview = readPreview(record.previewJson);
    return {
      id: record.id,
      payrollRunId: record.payrollRunId,
      periodLabel: formatPeriod(record.payrollRun.periodStart),
      exportType: normalizeExportType(record.exportType),
      format: record.format,
      status: record.status === "downloaded" ? "downloaded" : "generated",
      fileName: record.fileName,
      recordCount: record.recordCount,
      contentHash: record.contentHash,
      generatedAt: record.generatedAt,
      downloadedAt: record.downloadedAt,
      previewRows: preview.previewRows,
      warnings: preview.warnings,
    } satisfies PayrollExportView;
  });
}

async function createDbPayrollExport(
  session: DbPayrollExportSession,
  run: PayrollRunView,
  exportType: PayrollExportType,
  paymentConfiguredEmployeeIds: Set<string>,
  accountingSettings: PayrollAccountingSettings,
  paymentSecuritySettings: PayrollPaymentSecuritySettings,
) {
  const draft = buildPayrollExportDraft(run, exportType, paymentConfiguredEmployeeIds, accountingSettings, paymentSecuritySettings);
  const record = await getDb().$transaction(async (tx) => {
    const created = await tx.payrollExport.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        payrollRunId: run.id,
        exportType,
        format: draft.format,
        fileName: draft.fileName,
        recordCount: draft.recordCount,
        totalAmountHash: draft.totalAmountHash,
        contentHash: draft.contentHash,
        previewJson: {
          previewRows: draft.previewRows,
          warnings: draft.warnings,
        } satisfies Prisma.InputJsonValue,
        generatedByUserId: session.user?.id,
      },
      include: { payrollRun: true },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "payroll_export",
      entityId: created.id,
      after: {
        payrollRunId: run.id,
        exportType,
        format: draft.format,
        recordCount: draft.recordCount,
        contentHash: draft.contentHash,
      },
      metadata: {
        payrollRunId: run.id,
        exportType,
        format: draft.format,
        recordCount: draft.recordCount,
        contentHash: draft.contentHash,
        sensitiveValuesRedacted: true,
        destinationFieldsIncluded: false,
      },
    });
    return created;
  });

  return {
    id: record.id,
    payrollRunId: record.payrollRunId,
    periodLabel: formatPeriod(record.payrollRun.periodStart),
    exportType,
    format: record.format,
    status: "generated" as const,
    fileName: record.fileName,
    recordCount: record.recordCount,
    contentHash: record.contentHash,
    generatedAt: record.generatedAt,
    downloadedAt: record.downloadedAt,
    previewRows: draft.previewRows,
    warnings: draft.warnings,
  } satisfies PayrollExportView;
}

function createDemoPayrollExport(
  session: SessionLike,
  run: PayrollRunView,
  exportType: PayrollExportType,
  paymentConfiguredEmployeeIds: Set<string>,
  accountingSettings: PayrollAccountingSettings,
  paymentSecuritySettings: PayrollPaymentSecuritySettings,
) {
  const draft = buildPayrollExportDraft(run, exportType, paymentConfiguredEmployeeIds, accountingSettings, paymentSecuritySettings);
  const view: PayrollExportView = {
    id: crypto.randomUUID(),
    payrollRunId: run.id,
    periodLabel: formatPeriod(run.periodStart),
    exportType,
    format: draft.format,
    status: "generated",
    fileName: draft.fileName,
    recordCount: draft.recordCount,
    contentHash: draft.contentHash,
    generatedAt: new Date(),
    previewRows: draft.previewRows,
    warnings: draft.warnings,
  };
  getDemoState().exports.unshift(view);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "payroll_export",
    entityId: view.id,
    after: {
      payrollRunId: run.id,
      exportType,
      format: draft.format,
      recordCount: draft.recordCount,
      contentHash: draft.contentHash,
    },
    metadata: {
      payrollRunId: run.id,
      exportType,
      format: draft.format,
      recordCount: draft.recordCount,
      contentHash: draft.contentHash,
      sensitiveValuesRedacted: true,
      destinationFieldsIncluded: false,
    },
  });
  return view;
}

function buildPayrollExportDraft(
  run: PayrollRunView,
  exportType: PayrollExportType,
  paymentConfiguredEmployeeIds: Set<string>,
  accountingSettings: PayrollAccountingSettings,
  paymentSecuritySettings: PayrollPaymentSecuritySettings,
) {
  if (exportType === "bank_transfer") {
    const records = buildBankTransferRecords(run, paymentConfiguredEmployeeIds);
    const bankRows = buildBankTransferRows(records, paymentSecuritySettings);
    const missingCount = records.filter((record) => record.paymentDestinationStatus === "missing").length;
    const paymentSecurityReady = isPaymentSecurityReady(paymentSecuritySettings);
    return buildDraft({
      run,
      exportType,
      format: paymentSecurityReady
        ? `${paymentSecuritySettings.bankFileFormat}-${paymentSecuritySettings.bankFormatVersion}`
        : "tw-bank-transfer-placeholder-v1",
      fileName: `hr-one-bank-transfer-${formatPeriod(run.periodStart)}.csv`,
      records: bankRows,
      previewRows: records.slice(0, 5).map((record) => ({
        label: record.employeeName,
        description:
          record.paymentDestinationStatus === "configured"
            ? `Payment destination configured; columns ${paymentSecuritySettings.bankFileColumnOrder.join(", ")}.`
            : "Payment destination missing; configure employee payment profile before bank upload.",
        amountLabel: "Amount stored only in secure payroll calculation",
      })),
      warnings: missingCount > 0
        ? [`${missingCount} employee payment destination(s) are missing. This is not ready for bank upload.`]
        : paymentSecurityReady
          ? [`Payment token vault and ${paymentSecuritySettings.bankFileFormat} ${paymentSecuritySettings.bankFormatVersion} verification are configured with ${paymentSecuritySettings.bankFileColumnOrder.length} mapped column(s).`]
          : ["Payment destinations are configured, but production bank upload still requires KMS/token vault integration and verified customer bank format mapping."],
    });
  }

  const records = buildAccountingRecords(run, accountingSettings);
  return buildDraft({
    run,
    exportType,
    format: "accounting-journal-summary-v1",
    fileName: `hr-one-accounting-journal-${formatPeriod(run.periodStart)}.csv`,
    records,
    previewRows: records.map((record) => ({
      label: `${record.accountCode} · ${record.accountName}`,
      description: `${record.side.toUpperCase()} · ${record.memo}`,
      amountLabel: "Amount stored only in secure payroll calculation",
    })),
    warnings: ["Review configured accounting mappings before posting this summary to the accounting system."],
  });
}

function isPaymentSecurityReady(settings: PayrollPaymentSecuritySettings) {
  return Boolean(
    settings.tokenVaultProvider !== "not_configured" &&
      settings.tokenVaultRef &&
      settings.kmsKeyRef &&
      settings.bankFileFormat !== "tw_bank_csv_placeholder" &&
      settings.bankFileColumnOrder.includes("account_token_ref") &&
      settings.bankFileColumnOrder.includes("amount") &&
      settings.bankFormatVerified &&
      settings.verificationStatus === "verified" &&
      settings.lastVerifiedAt,
  );
}

function buildDraft(input: {
  run: PayrollRunView;
  exportType: PayrollExportType;
  format: string;
  fileName: string;
  records: Array<Record<string, unknown>>;
  previewRows: PayrollExportView["previewRows"];
  warnings: string[];
}) {
  const contentHash = stableHash({
    exportType: input.exportType,
    format: input.format,
    payrollRunId: input.run.id,
    records: input.records,
  });
  const totalAmountHash = stableHash({
    payrollRunId: input.run.id,
    exportType: input.exportType,
    total: input.records.reduce((total, record) => total + readRecordAmount(record), 0),
  });
  return {
    format: input.format,
    fileName: input.fileName,
    recordCount: input.records.length,
    contentHash,
    totalAmountHash,
    previewRows: input.previewRows,
    warnings: input.warnings,
  };
}

function buildBankTransferRecords(run: PayrollRunView, paymentConfiguredEmployeeIds: Set<string>) {
  const itemsByEmployee = groupItemsByEmployee(run.items);
  return [...itemsByEmployee.entries()].map(([employeeId, items]) => {
    const employeeName = items[0]?.employeeName ?? employeeId;
    const netPay = items
      .filter((item) => item.kind !== "employer_contribution")
      .reduce((total, item) => total + signedPayrollItemAmount(item), 0);
    return {
      employeeId,
      employeeName,
      netPay,
      currency: "TWD",
      paymentDestinationStatus: paymentConfiguredEmployeeIds.has(employeeId) ? "configured" : "missing",
    };
  });
}

function buildBankTransferRows(
  records: ReturnType<typeof buildBankTransferRecords>,
  settings: PayrollPaymentSecuritySettings,
) {
  return records.map((record) => {
    const row: Record<string, string | number> = {};
    for (const column of settings.bankFileColumnOrder) {
      row[column] = bankColumnValue(column, record);
    }
    row.paymentDestinationStatus = record.paymentDestinationStatus;
    return row;
  });
}

function bankColumnValue(
  column: PayrollPaymentSecuritySettings["bankFileColumnOrder"][number],
  record: ReturnType<typeof buildBankTransferRecords>[number],
) {
  if (column === "employee_no") return record.employeeId;
  if (column === "employee_name") return record.employeeName;
  if (column === "bank_code") return record.paymentDestinationStatus === "configured" ? "vault_bank_code" : "missing";
  if (column === "branch_code") return record.paymentDestinationStatus === "configured" ? "vault_branch_code" : "missing";
  if (column === "account_token_ref") return record.paymentDestinationStatus === "configured" ? "vault_account_token_ref" : "missing";
  if (column === "amount") return record.netPay;
  if (column === "currency") return record.currency;
  return `HR One payroll ${record.employeeId}`;
}

function payrollEmployeeIds(run: PayrollRunView) {
  return [...new Set(run.items.filter((item) => item.kind !== "employer_contribution").map((item) => item.employeeId))];
}

function buildAccountingRecords(run: PayrollRunView, settings: PayrollAccountingSettings) {
  const gross = sumItems(run.items, ["earning", "allowance", "overtime"]);
  const deductions = sumItems(run.items, ["deduction"]);
  const employerContributions = sumItems(run.items, ["employer_contribution"]);
  const netPay = gross - deductions;
  return [
    {
      accountCode: settings.grossPayrollDebitAccountCode,
      accountName: settings.grossPayrollDebitAccountName,
      side: "debit",
      amount: gross,
      memo: "Gross payroll earnings",
    },
    {
      accountCode: settings.employerContributionDebitAccountCode,
      accountName: settings.employerContributionDebitAccountName,
      side: "debit",
      amount: employerContributions,
      memo: "Employer statutory contributions",
    },
    {
      accountCode: settings.deductionCreditAccountCode,
      accountName: settings.deductionCreditAccountName,
      side: "credit",
      amount: deductions,
      memo: "Employee deductions and withholding",
    },
    {
      accountCode: settings.netPayableCreditAccountCode,
      accountName: settings.netPayableCreditAccountName,
      side: "credit",
      amount: netPay,
      memo: "Net salary payable",
    },
  ].filter((record) => record.amount > 0);
}

function groupItemsByEmployee(items: PayrollItemView[]) {
  const groups = new Map<string, PayrollItemView[]>();
  for (const item of items) {
    groups.set(item.employeeId, [...(groups.get(item.employeeId) ?? []), item]);
  }
  return groups;
}

function signedPayrollItemAmount(item: PayrollItemView) {
  if (item.kind === "deduction") return -item.amount;
  return item.amount;
}

function sumItems(items: PayrollItemView[], kinds: PayrollItemView["kind"][]) {
  return items
    .filter((item) => kinds.includes(item.kind))
    .reduce((total, item) => total + item.amount, 0);
}

function readRecordAmount(record: Record<string, unknown>) {
  return typeof record.amount === "number"
    ? record.amount
    : typeof record.netPay === "number"
      ? record.netPay
      : 0;
}

function readPreview(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { previewRows: [], warnings: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    previewRows: Array.isArray(record.previewRows)
      ? record.previewRows.flatMap((row) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return [];
          const rowRecord = row as Record<string, unknown>;
          return {
            label: String(rowRecord.label ?? ""),
            description: String(rowRecord.description ?? ""),
            amountLabel: String(rowRecord.amountLabel ?? ""),
          };
        })
      : [],
    warnings: Array.isArray(record.warnings) ? record.warnings.map(String) : [],
  };
}

function normalizeExportType(value: string): PayrollExportType {
  return value === "accounting_journal" ? "accounting_journal" : "bank_transfer";
}

function formatPeriod(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function canUseDatabase(session: SessionLike): session is DbPayrollExportSession {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
