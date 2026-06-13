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

export type PayrollRecordkeepingSettings = {
  wageRosterRetentionDays: number;
  employeePayslipEnabled: boolean;
  wageCalculationDetailsEnabled: boolean;
  laborInspectionExportEnabled: boolean;
};

export type PayrollRecordkeepingSettingsInput = Partial<PayrollRecordkeepingSettings>;

export type PayrollRecordkeepingReadinessReport = {
  ready: boolean;
  missing: string[];
  detail: string;
};

type PayrollRecordkeepingDemoState = {
  settings: PayrollRecordkeepingSettings;
};

export const minimumWageRosterRetentionDays = 365 * 5;

export const defaultPayrollRecordkeepingSettings: PayrollRecordkeepingSettings = {
  wageRosterRetentionDays: minimumWageRosterRetentionDays,
  employeePayslipEnabled: true,
  wageCalculationDetailsEnabled: true,
  laborInspectionExportEnabled: true,
};

const globalForPayrollRecordkeeping = globalThis as unknown as {
  hrOnePayrollRecordkeepingDemoState?: PayrollRecordkeepingDemoState;
};

export async function getPayrollRecordkeepingSettings(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  return readPayrollRecordkeepingSettings(session);
}

export async function getPayrollRecordkeepingReadiness(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  const settings = await readPayrollRecordkeepingSettings(session);
  return evaluatePayrollRecordkeepingReadiness(settings);
}

export async function updatePayrollRecordkeepingSettings(
  session: SessionLike,
  input: PayrollRecordkeepingSettingsInput,
) {
  assertPermission(session.role, "payroll:manage");
  const before = await readPayrollRecordkeepingSettings(session);
  const normalized = normalizeSettings(input, before);

  if (canUseDatabase(session)) {
    try {
      return updateDbSettings(session, before, normalized);
    } catch {
      return updateDemoSettings(session, before, normalized);
    }
  }
  return updateDemoSettings(session, before, normalized);
}

export function evaluatePayrollRecordkeepingReadiness(
  settings: PayrollRecordkeepingSettings | null | undefined,
): PayrollRecordkeepingReadinessReport {
  const missing = [
    !settings ? "payroll recordkeeping settings" : null,
    settings && settings.wageRosterRetentionDays < minimumWageRosterRetentionDays ? "5-year wage roster retention" : null,
    settings && !settings.employeePayslipEnabled ? "employee wage statement access" : null,
    settings && !settings.wageCalculationDetailsEnabled ? "wage calculation details" : null,
    settings && !settings.laborInspectionExportEnabled ? "labor inspection export readiness" : null,
  ].filter((item): item is string => Boolean(item));
  return {
    ready: missing.length === 0,
    missing,
    detail: settings
      ? `${settings.wageRosterRetentionDays} retention day(s); payslip ${settings.employeePayslipEnabled ? "enabled" : "disabled"}; calculation details ${settings.wageCalculationDetailsEnabled ? "enabled" : "disabled"}; labor inspection export ${settings.laborInspectionExportEnabled ? "enabled" : "disabled"}.`
      : "No payroll recordkeeping settings configured.",
  };
}

export function resetPayrollRecordkeepingDemoState() {
  globalForPayrollRecordkeeping.hrOnePayrollRecordkeepingDemoState = {
    settings: { ...defaultPayrollRecordkeepingSettings },
  };
}

async function readPayrollRecordkeepingSettings(session: SessionLike) {
  if (canUseDatabase(session)) {
    try {
      const record = await getDb().companyPayrollRecordkeepingSetting.findUnique({
        where: { companyId: session.companyId },
      });
      return record ? readRecord(record) : defaultPayrollRecordkeepingSettings;
    } catch {
      return getDemoState().settings;
    }
  }
  return getDemoState().settings;
}

async function updateDbSettings(
  session: SessionLike & { tenantId: string; companyId: string },
  before: PayrollRecordkeepingSettings,
  normalized: PayrollRecordkeepingSettings,
) {
  const updated = await getDb().$transaction(async (tx) => {
    const record = await tx.companyPayrollRecordkeepingSetting.upsert({
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
      entityType: "payroll_recordkeeping_settings",
      entityId: record.id,
      before,
      after: normalized,
      metadata: auditMetadata(before, normalized),
    });
    return record;
  });
  return readRecord(updated);
}

function updateDemoSettings(
  session: SessionLike,
  before: PayrollRecordkeepingSettings,
  normalized: PayrollRecordkeepingSettings,
) {
  getDemoState().settings = normalized;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "payroll_recordkeeping_settings",
    entityId: "demo-payroll-recordkeeping-settings",
    before,
    after: normalized,
    metadata: auditMetadata(before, normalized),
  });
  return normalized;
}

function normalizeSettings(
  input: PayrollRecordkeepingSettingsInput,
  before: PayrollRecordkeepingSettings,
): PayrollRecordkeepingSettings {
  return {
    wageRosterRetentionDays: positiveInteger(input.wageRosterRetentionDays, before.wageRosterRetentionDays),
    employeePayslipEnabled: input.employeePayslipEnabled ?? before.employeePayslipEnabled,
    wageCalculationDetailsEnabled: input.wageCalculationDetailsEnabled ?? before.wageCalculationDetailsEnabled,
    laborInspectionExportEnabled: input.laborInspectionExportEnabled ?? before.laborInspectionExportEnabled,
  };
}

function auditMetadata(before: PayrollRecordkeepingSettings, after: PayrollRecordkeepingSettings) {
  return {
    changedFields: (Object.keys(after) as Array<keyof PayrollRecordkeepingSettings>).filter(
      (key) => before[key] !== after[key],
    ),
    retentionDays: after.wageRosterRetentionDays,
    employeePayslipEnabled: after.employeePayslipEnabled,
    wageCalculationDetailsEnabled: after.wageCalculationDetailsEnabled,
    laborInspectionExportEnabled: after.laborInspectionExportEnabled,
    containsPayrollAmounts: false,
  };
}

function readRecord(record: PayrollRecordkeepingSettings): PayrollRecordkeepingSettings {
  return {
    wageRosterRetentionDays: record.wageRosterRetentionDays,
    employeePayslipEnabled: record.employeePayslipEnabled,
    wageCalculationDetailsEnabled: record.wageCalculationDetailsEnabled,
    laborInspectionExportEnabled: record.laborInspectionExportEnabled,
  };
}

function getDemoState() {
  if (!globalForPayrollRecordkeeping.hrOnePayrollRecordkeepingDemoState) {
    resetPayrollRecordkeepingDemoState();
  }
  return globalForPayrollRecordkeeping.hrOnePayrollRecordkeepingDemoState!;
}

function positiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number") return fallback;
  const parsed = Math.round(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
