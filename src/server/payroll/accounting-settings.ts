import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type PayrollAccountingSettings = {
  grossPayrollDebitAccountCode: string;
  grossPayrollDebitAccountName: string;
  employerContributionDebitAccountCode: string;
  employerContributionDebitAccountName: string;
  deductionCreditAccountCode: string;
  deductionCreditAccountName: string;
  netPayableCreditAccountCode: string;
  netPayableCreditAccountName: string;
};

export type PayrollAccountingSettingsInput = Partial<PayrollAccountingSettings>;

type PayrollAccountingSettingsDemoState = {
  settings: PayrollAccountingSettings;
};

export const defaultPayrollAccountingSettings: PayrollAccountingSettings = {
  grossPayrollDebitAccountCode: "6110",
  grossPayrollDebitAccountName: "Payroll expense",
  employerContributionDebitAccountCode: "6120",
  employerContributionDebitAccountName: "Employer statutory expense",
  deductionCreditAccountCode: "2210",
  deductionCreditAccountName: "Payroll deductions payable",
  netPayableCreditAccountCode: "2220",
  netPayableCreditAccountName: "Salary payable",
};

const globalForPayrollAccountingSettings = globalThis as unknown as {
  hrOnePayrollAccountingSettingsDemoState?: PayrollAccountingSettingsDemoState;
};

export async function getPayrollAccountingSettings(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    const record = await getDb().companyPayrollAccountingSetting.findUnique({
      where: { companyId: session.companyId },
    });
    return record ? readRecord(record) : defaultPayrollAccountingSettings;
  }
  return getDemoState().settings;
}

export async function updatePayrollAccountingSettings(
  session: SessionLike,
  input: PayrollAccountingSettingsInput,
) {
  assertPermission(session.role, "payroll:manage");
  const before = await getPayrollAccountingSettings(session);
  const normalized = normalizeSettings(input, before);

  if (canUseDatabase(session)) {
    return updateDbSettings(session, before, normalized);
  }
  return updateDemoSettings(session, before, normalized);
}

export function resetPayrollAccountingSettingsDemoState() {
  globalForPayrollAccountingSettings.hrOnePayrollAccountingSettingsDemoState = {
    settings: { ...defaultPayrollAccountingSettings },
  };
}

function getDemoState() {
  if (!globalForPayrollAccountingSettings.hrOnePayrollAccountingSettingsDemoState) {
    resetPayrollAccountingSettingsDemoState();
  }
  return globalForPayrollAccountingSettings.hrOnePayrollAccountingSettingsDemoState!;
}

async function updateDbSettings(
  session: SessionLike & { tenantId: string; companyId: string },
  before: PayrollAccountingSettings,
  normalized: PayrollAccountingSettings,
) {
  const updated = await getDb().$transaction(async (tx) => {
    const record = await tx.companyPayrollAccountingSetting.upsert({
      where: { companyId: session.companyId },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        ...normalized,
        updatedByUserId: session.user?.id,
      },
      update: {
        ...normalized,
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "payroll_accounting_settings",
      entityId: record.id,
      before,
      after: normalized,
      metadata: {
        changedFields: changedFields(before, normalized),
        exportMappingChanged: true,
        amountValuesIncluded: false,
      },
    });
    return record;
  });
  return readRecord(updated);
}

function updateDemoSettings(
  session: SessionLike,
  before: PayrollAccountingSettings,
  normalized: PayrollAccountingSettings,
) {
  getDemoState().settings = normalized;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "payroll_accounting_settings",
    entityId: "demo-payroll-accounting-settings",
    before,
    after: normalized,
    metadata: {
      changedFields: changedFields(before, normalized),
      exportMappingChanged: true,
      amountValuesIncluded: false,
    },
  });
  return normalized;
}

function normalizeSettings(
  input: PayrollAccountingSettingsInput,
  before: PayrollAccountingSettings,
): PayrollAccountingSettings {
  return {
    grossPayrollDebitAccountCode: cleanCode(input.grossPayrollDebitAccountCode, before.grossPayrollDebitAccountCode),
    grossPayrollDebitAccountName: cleanName(input.grossPayrollDebitAccountName, before.grossPayrollDebitAccountName),
    employerContributionDebitAccountCode: cleanCode(
      input.employerContributionDebitAccountCode,
      before.employerContributionDebitAccountCode,
    ),
    employerContributionDebitAccountName: cleanName(
      input.employerContributionDebitAccountName,
      before.employerContributionDebitAccountName,
    ),
    deductionCreditAccountCode: cleanCode(input.deductionCreditAccountCode, before.deductionCreditAccountCode),
    deductionCreditAccountName: cleanName(input.deductionCreditAccountName, before.deductionCreditAccountName),
    netPayableCreditAccountCode: cleanCode(input.netPayableCreditAccountCode, before.netPayableCreditAccountCode),
    netPayableCreditAccountName: cleanName(input.netPayableCreditAccountName, before.netPayableCreditAccountName),
  };
}

function readRecord(record: PayrollAccountingSettings): PayrollAccountingSettings {
  return {
    grossPayrollDebitAccountCode: record.grossPayrollDebitAccountCode,
    grossPayrollDebitAccountName: record.grossPayrollDebitAccountName,
    employerContributionDebitAccountCode: record.employerContributionDebitAccountCode,
    employerContributionDebitAccountName: record.employerContributionDebitAccountName,
    deductionCreditAccountCode: record.deductionCreditAccountCode,
    deductionCreditAccountName: record.deductionCreditAccountName,
    netPayableCreditAccountCode: record.netPayableCreditAccountCode,
    netPayableCreditAccountName: record.netPayableCreditAccountName,
  };
}

function cleanCode(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/[^\dA-Za-z_.-]/g, "").slice(0, 32);
  return cleaned || fallback;
}

function cleanName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 80);
  return cleaned || fallback;
}

function changedFields(before: PayrollAccountingSettings, after: PayrollAccountingSettings) {
  return (Object.keys(after) as Array<keyof PayrollAccountingSettings>).filter((key) => before[key] !== after[key]);
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
