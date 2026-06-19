import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { getDb } from "@/server/db/client";
import { saveSalaryProfile } from "@/server/payroll/salary-profiles";
import { savePaymentProfile } from "@/server/payroll/payment-profiles";
import { updatePayrollComplianceProfile } from "@/server/payroll/compliance";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type PayrollProfileImportRow = {
  rowNumber: number;
  employeeNo: string;
  employeeId: string | null;
  employeeName: string | null;
  baseSalary: number | null;
  hourlyWage: number | null;
  taxResidency: "resident" | "non_resident";
  dependentCount: number;
  bankCode: string;
  accountName: string;
  accountNumberLast4: string | null;
  effectiveFrom: Date | null;
  status: "valid" | "invalid";
  errors: string[];
};

export type PayrollProfileImportPreview = {
  id: string;
  rawCsv: string;
  createdAt: Date;
  rows: PayrollProfileImportRow[];
  validCount: number;
  invalidCount: number;
};

export type PayrollProfileImportWorkspace = {
  preview: PayrollProfileImportPreview | null;
  employees: Array<{ id: string; employeeNo: string; displayName: string }>;
};

type PayrollProfileImportDemoState = {
  previews: PayrollProfileImportPreview[];
};

const requiredHeaders = [
  "employeeNo",
  "baseSalary",
  "taxResidency",
  "dependentCount",
  "bankCode",
  "accountName",
  "accountNumber",
  "effectiveFrom",
] as const;

const globalForPayrollProfileImports = globalThis as unknown as {
  hrOnePayrollProfileImportDemoState?: PayrollProfileImportDemoState;
};

export async function getPayrollProfileImportWorkspace(
  session: SessionLike,
): Promise<PayrollProfileImportWorkspace> {
  assertPermission(session.role, "payroll:manage");
  return {
    preview: latestPreviewForUi(),
    employees: await listEmployees(session),
  };
}

export async function previewPayrollProfileImport(session: SessionLike, rawCsv: string) {
  assertPermission(session.role, "payroll:manage");
  const employees = await listEmployees(session);
  const preview = buildPreview(rawCsv, employees);
  getDemoState().previews.unshift(preview);
  return preview;
}

export function previewPayrollProfileImportRows(
  rawCsv: string,
  employees: PayrollProfileImportWorkspace["employees"],
) {
  return buildPreview(rawCsv, employees);
}

export async function confirmPayrollProfileImport(session: SessionLike, previewId: string) {
  assertPermission(session.role, "payroll:manage");
  const preview = getDemoState().previews.find((item) => item.id === previewId);
  if (!preview) throw new Error("Payroll profile import preview expired. Preview the CSV again.");
  if (preview.invalidCount > 0) throw new Error("Fix invalid rows before importing payroll profiles.");
  if (preview.validCount === 0) throw new Error("No valid payroll profile rows to import.");

  const rows = parseRowsForImport(preview.rawCsv, preview.rows);
  for (const row of rows) {
    await saveSalaryProfile(sessionForPayroll(session), {
      employeeId: row.employeeId,
      baseSalary: row.baseSalary,
      hourlyWage: row.hourlyWage,
      allowanceCode: row.allowanceCode,
      allowanceName: row.allowanceName,
      allowanceAmount: row.allowanceAmount,
      deductionCode: row.deductionCode,
      deductionName: row.deductionName,
      deductionAmount: row.deductionAmount,
      effectiveFrom: row.effectiveFrom,
    });
    await updatePayrollComplianceProfile(sessionForPayroll(session), {
      employeeId: row.employeeId,
      taxResidency: row.taxResidency,
      dependentCount: row.dependentCount,
      laborInsuranceMonthlyWage: row.laborInsuranceMonthlyWage,
      healthInsuranceMonthlyWage: row.healthInsuranceMonthlyWage,
      laborPensionMonthlyWage: row.laborPensionMonthlyWage,
      incomeTaxWithholdingMethod: row.taxResidency === "non_resident" ? "non_resident_flat" : "annualized_progressive",
      nonResidentWithholdingRate: row.nonResidentWithholdingRate,
    });
    await savePaymentProfile(session, {
      employeeId: row.employeeId,
      bankCode: row.bankCode,
      bankBranchCode: row.bankBranchCode,
      accountName: row.accountName,
      accountNumber: row.accountNumber,
      effectiveFrom: row.effectiveFrom,
    });
  }

  await writePayrollProfileImportAudit(session, preview.id, rows);

  return {
    importedCount: rows.length,
    salaryProfilesCreated: rows.length,
    payrollComplianceProfilesUpdated: rows.length,
    paymentProfilesCreated: rows.length,
  };
}

async function writePayrollProfileImportAudit(
  session: SessionLike,
  previewId: string,
  rows: Array<{ employeeId: string; taxResidency: "resident" | "non_resident"; effectiveFrom: Date }>,
) {
  const metadata = {
    source: "payroll_profile_csv_import",
    previewId,
    importedCount: rows.length,
    employeeIds: rows.map((row) => row.employeeId),
    nonResidentCount: rows.filter((row) => row.taxResidency === "non_resident").length,
    effectiveDates: Array.from(new Set(rows.map((row) => row.effectiveFrom.toISOString().slice(0, 10)))),
    sensitiveValuesRedacted: true,
  };
  const after = {
    importedCount: rows.length,
    salaryProfilesCreated: rows.length,
    payrollComplianceProfilesUpdated: rows.length,
    paymentProfilesCreated: rows.length,
  };

  if (canUseDatabase(session)) {
    try {
      await writeAuditLog(getDb(), {
        tenantId: session.tenantId,
        companyId: session.companyId,
        actorUserId: session.user?.id,
        actorEmployeeId: session.employee?.id,
        action: "create",
        entityType: "payroll_profile_import",
        entityId: previewId,
        after,
        metadata,
      });
      return;
    } catch {
      // Fall back to demo audit logging so the UI still shows evidence in local demo mode.
    }
  }

  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "payroll_profile_import",
    entityId: previewId,
    after,
    metadata,
  });
}

export function resetPayrollProfileImportDemoState() {
  globalForPayrollProfileImports.hrOnePayrollProfileImportDemoState = {
    previews: [],
  };
}

async function listEmployees(session: SessionLike) {
  if (canUseDatabase(session)) {
    const employees = await getDb().employee.findMany({
      where: { tenantId: session.tenantId!, companyId: session.companyId!, employmentStatus: "active" },
      orderBy: { employeeNo: "asc" },
    });
    return employees.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
    }));
  }
  return demoEmployees();
}

function buildPreview(
  rawCsv: string,
  employees: PayrollProfileImportWorkspace["employees"],
): PayrollProfileImportPreview {
  const trimmed = rawCsv.trim();
  if (!trimmed) throw new Error("CSV content is required.");
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) throw new Error(`Missing required CSV header: ${header}`);
  }
  const employeeByNo = new Map(employees.map((employee) => [employee.employeeNo.toLowerCase(), employee]));
  const seenEmployeeNos = new Set<string>();
  const rows = lines.slice(1).map((line, index) => {
    const record = recordFromLine(headers, line);
    const employeeNo = record.employeeNo ?? "";
    const employee = employeeByNo.get(employeeNo.toLowerCase()) ?? null;
    const baseSalary = parseMoney(record.baseSalary);
    const hourlyWage = parseOptionalMoney(record.hourlyWage);
    const taxResidency = record.taxResidency === "non_resident" ? "non_resident" : "resident";
    const dependentCount = parseInteger(record.dependentCount);
    const accountNumber = digits(record.accountNumber ?? "");
    const effectiveFrom = parseDateOnly(record.effectiveFrom ?? "");
    const errors: string[] = [];
    if (!employeeNo) errors.push("Employee number is required.");
    if (employeeNo && seenEmployeeNos.has(employeeNo.toLowerCase())) errors.push("Duplicate employee number in CSV.");
    if (!employee) errors.push("Employee number was not found.");
    if (baseSalary === null) errors.push("Base salary must be zero or greater.");
    if (hourlyWage === undefined) errors.push("Hourly wage must be blank or zero or greater.");
    if (dependentCount === null || dependentCount < 0) errors.push("Dependent count must be zero or greater.");
    if (!/^\d{3,7}$/.test(record.bankCode ?? "")) errors.push("Bank code must be 3 to 7 digits.");
    if (record.bankBranchCode && !/^\d{3,7}$/.test(record.bankBranchCode)) {
      errors.push("Branch code must be 3 to 7 digits.");
    }
    if ((record.accountName ?? "").trim().length < 2) errors.push("Account name is required.");
    if (!/^\d{6,20}$/.test(accountNumber)) errors.push("Account number must be 6 to 20 digits.");
    if (!effectiveFrom) errors.push("Effective date must be YYYY-MM-DD.");
    if (taxResidency === "non_resident" && parsePercent(record.nonResidentWithholdingRatePercent) === undefined) {
      errors.push("Non-resident withholding rate percent is required for non-residents.");
    }
    seenEmployeeNos.add(employeeNo.toLowerCase());
    return {
      rowNumber: index + 2,
      employeeNo,
      employeeId: employee?.id ?? null,
      employeeName: employee?.displayName ?? null,
      baseSalary,
      hourlyWage: hourlyWage ?? null,
      taxResidency,
      dependentCount: dependentCount ?? 0,
      bankCode: record.bankCode ?? "",
      accountName: record.accountName ?? "",
      accountNumberLast4: accountNumber ? accountNumber.slice(-4) : null,
      effectiveFrom,
      status: errors.length === 0 ? "valid" : "invalid",
      errors,
    } satisfies PayrollProfileImportRow;
  });
  return {
    id: crypto.randomUUID(),
    rawCsv,
    createdAt: new Date(),
    rows,
    validCount: rows.filter((row) => row.status === "valid").length,
    invalidCount: rows.filter((row) => row.status === "invalid").length,
  };
}

function parseRowsForImport(rawCsv: string, previewRows: PayrollProfileImportRow[]) {
  const lines = rawCsv.trim().split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  return lines.slice(1).map((line, index) => {
    const previewRow = previewRows[index];
    if (!previewRow?.employeeId || !previewRow.effectiveFrom || previewRow.baseSalary === null) {
      throw new Error(`Row ${index + 2} is not valid for import.`);
    }
    const record = recordFromLine(headers, line);
    const taxResidency = previewRow.taxResidency;
    return {
      employeeId: previewRow.employeeId,
      baseSalary: previewRow.baseSalary,
      hourlyWage: previewRow.hourlyWage,
      allowanceCode: optionalText(record.allowanceCode),
      allowanceName: optionalText(record.allowanceName),
      allowanceAmount: parseOptionalMoney(record.allowanceAmount) ?? null,
      deductionCode: optionalText(record.deductionCode),
      deductionName: optionalText(record.deductionName),
      deductionAmount: parseOptionalMoney(record.deductionAmount) ?? null,
      taxResidency,
      dependentCount: previewRow.dependentCount,
      laborInsuranceMonthlyWage: parseOptionalMoney(record.laborInsuranceMonthlyWage) ?? null,
      healthInsuranceMonthlyWage: parseOptionalMoney(record.healthInsuranceMonthlyWage) ?? null,
      laborPensionMonthlyWage: parseOptionalMoney(record.laborPensionMonthlyWage) ?? null,
      nonResidentWithholdingRate: taxResidency === "non_resident"
        ? parsePercent(record.nonResidentWithholdingRatePercent) ?? 0.18
        : null,
      bankCode: record.bankCode ?? "",
      bankBranchCode: optionalText(record.bankBranchCode),
      accountName: record.accountName ?? "",
      accountNumber: record.accountNumber ?? "",
      effectiveFrom: previewRow.effectiveFrom,
    };
  });
}

function recordFromLine(headers: string[], line: string) {
  const values = splitCsvLine(line);
  return Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]?.trim() ?? ""]));
}

function latestPreview() {
  return getDemoState().previews[0] ?? null;
}

function latestPreviewForUi() {
  const preview = latestPreview();
  if (!preview) return null;
  return {
    ...preview,
    rawCsv: "",
    rows: preview.rows.map((row) => ({
      ...row,
      baseSalary: null,
      hourlyWage: null,
      accountName: "",
    })),
  } satisfies PayrollProfileImportPreview;
}

function getDemoState() {
  if (!globalForPayrollProfileImports.hrOnePayrollProfileImportDemoState) resetPayrollProfileImportDemoState();
  return globalForPayrollProfileImports.hrOnePayrollProfileImportDemoState!;
}

function demoEmployees() {
  return getFallbackCompanyOverview().company.employees.map((employee) => ({
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
  }));
}

function sessionForPayroll(session: SessionLike): SessionLike & { tenantId: string | null; companyId: string | null } {
  return {
    ...session,
    tenantId: session.tenantId ?? null,
    companyId: session.companyId ?? null,
  };
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseMoney(value: string | undefined) {
  if (value === undefined || !value.trim()) return null;
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalMoney(value: string | undefined) {
  if (value === undefined || !value.trim()) return null;
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseInteger(value: string | undefined) {
  if (value === undefined || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parsePercent(value: string | undefined) {
  if (value === undefined || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed / 100 : undefined;
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalText(value: string | undefined) {
  const text = value?.trim();
  return text || null;
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
