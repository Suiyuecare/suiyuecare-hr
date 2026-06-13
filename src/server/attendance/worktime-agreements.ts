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

export type WorktimeAgreementApprovalType = "labor_management_conference" | "labor_union" | "other";
export type WorktimeAgreementVerificationStatus = "unverified" | "verified" | "failed";

export type WorktimeAgreementSettings = {
  approvalType: WorktimeAgreementApprovalType;
  approvalOnFile: boolean;
  evidenceRef: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  monthlyOvertimeLimitMinutes: number;
  threeMonthOvertimeLimitMinutes: number;
  localAuthorityReportRequired: boolean;
  localAuthorityReportFiled: boolean;
  verificationStatus: WorktimeAgreementVerificationStatus;
  verificationNote: string | null;
};

export type WorktimeAgreementSettingsRecord = Omit<
  WorktimeAgreementSettings,
  "approvalType" | "verificationStatus"
> & {
  approvalType: string;
  verificationStatus: string;
};

export type WorktimeAgreementSettingsInput = Partial<{
  approvalType: string;
  approvalOnFile: boolean;
  evidenceRef: string | null;
  effectiveFrom: Date | string | null;
  effectiveTo: Date | string | null;
  monthlyOvertimeLimitMinutes: number;
  threeMonthOvertimeLimitMinutes: number;
  localAuthorityReportRequired: boolean;
  localAuthorityReportFiled: boolean;
  verificationStatus: string;
  verificationNote: string | null;
}>;

export type WorktimeAgreementReadinessReport = {
  ready: boolean;
  missing: string[];
  detail: string;
  settings: WorktimeAgreementSettings;
};

type WorktimeAgreementDemoState = {
  settings: WorktimeAgreementSettings;
};

export const defaultWorktimeAgreementSettings: WorktimeAgreementSettings = {
  approvalType: "labor_management_conference",
  approvalOnFile: false,
  evidenceRef: null,
  effectiveFrom: null,
  effectiveTo: null,
  monthlyOvertimeLimitMinutes: 46 * 60,
  threeMonthOvertimeLimitMinutes: 138 * 60,
  localAuthorityReportRequired: false,
  localAuthorityReportFiled: false,
  verificationStatus: "unverified",
  verificationNote: null,
};

const globalForWorktimeAgreement = globalThis as unknown as {
  hrOneWorktimeAgreementDemoState?: WorktimeAgreementDemoState;
};

export async function getWorktimeAgreementSettings(session: SessionLike) {
  assertPermission(session.role, "employee:read");
  return readWorktimeAgreementSettings(session);
}

export async function getWorktimeAgreementReadiness(session: SessionLike, now = new Date()) {
  assertPermission(session.role, "employee:read");
  const settings = await readWorktimeAgreementSettings(session);
  return evaluateWorktimeAgreementReadiness(settings, now);
}

export async function updateWorktimeAgreementSettings(
  session: SessionLike,
  input: WorktimeAgreementSettingsInput,
) {
  assertPermission(session.role, "employee:write");
  const before = await readWorktimeAgreementSettings(session);
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

export function evaluateWorktimeAgreementReadiness(
  settings: WorktimeAgreementSettingsRecord | null | undefined,
  now = new Date(),
): WorktimeAgreementReadinessReport {
  const normalized = settings ? readRecord(settings) : defaultWorktimeAgreementSettings;
  const missing = [
    !settings ? "worktime agreement settings" : null,
    !normalized.approvalOnFile ? "labor union or labor-management conference approval evidence" : null,
    !normalized.evidenceRef?.trim() ? "evidence reference" : null,
    !normalized.effectiveFrom ? "effective start date" : null,
    !normalized.effectiveTo ? "effective end date" : null,
    normalized.effectiveFrom && normalized.effectiveFrom > now ? "effective period has not started" : null,
    normalized.effectiveTo && endOfDate(normalized.effectiveTo) < now ? "effective period expired" : null,
    normalized.verificationStatus !== "verified" ? "HR verification" : null,
    normalized.localAuthorityReportRequired && !normalized.localAuthorityReportFiled
      ? "local authority filing"
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    ready: missing.length === 0,
    missing,
    settings: normalized,
    detail: [
      approvalTypeLabel(normalized.approvalType),
      normalized.approvalOnFile ? "approval evidence on file" : "approval evidence missing",
      normalized.verificationStatus,
      `monthly ${minutesToHours(normalized.monthlyOvertimeLimitMinutes)}h`,
      `3-month ${minutesToHours(normalized.threeMonthOvertimeLimitMinutes)}h`,
    ].join("; "),
  };
}

export function resetWorktimeAgreementDemoState() {
  globalForWorktimeAgreement.hrOneWorktimeAgreementDemoState = {
    settings: { ...defaultWorktimeAgreementSettings },
  };
}

async function readWorktimeAgreementSettings(session: SessionLike) {
  if (canUseDatabase(session)) {
    try {
      const record = await getDb().companyWorktimeAgreementSetting.findUnique({
        where: { companyId: session.companyId },
      });
      return record ? readRecord(record) : defaultWorktimeAgreementSettings;
    } catch {
      return getDemoState().settings;
    }
  }
  return getDemoState().settings;
}

async function updateDbSettings(
  session: SessionLike & { tenantId: string; companyId: string },
  before: WorktimeAgreementSettings,
  normalized: WorktimeAgreementSettings,
) {
  const updated = await getDb().$transaction(async (tx) => {
    const record = await tx.companyWorktimeAgreementSetting.upsert({
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
      entityType: "worktime_agreement_settings",
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
  before: WorktimeAgreementSettings,
  normalized: WorktimeAgreementSettings,
) {
  getDemoState().settings = normalized;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "worktime_agreement_settings",
    entityId: "demo-worktime-agreement-settings",
    before,
    after: normalized,
    metadata: auditMetadata(before, normalized),
  });
  return normalized;
}

function normalizeSettings(
  input: WorktimeAgreementSettingsInput,
  before: WorktimeAgreementSettings,
): WorktimeAgreementSettings {
  return {
    approvalType: normalizeApprovalType(input.approvalType, before.approvalType),
    approvalOnFile: input.approvalOnFile ?? before.approvalOnFile,
    evidenceRef: normalizeOptionalString(input.evidenceRef, before.evidenceRef),
    effectiveFrom: normalizeOptionalDate(input.effectiveFrom, before.effectiveFrom),
    effectiveTo: normalizeOptionalDate(input.effectiveTo, before.effectiveTo),
    monthlyOvertimeLimitMinutes: positiveInteger(
      input.monthlyOvertimeLimitMinutes,
      before.monthlyOvertimeLimitMinutes,
    ),
    threeMonthOvertimeLimitMinutes: positiveInteger(
      input.threeMonthOvertimeLimitMinutes,
      before.threeMonthOvertimeLimitMinutes,
    ),
    localAuthorityReportRequired:
      input.localAuthorityReportRequired ?? before.localAuthorityReportRequired,
    localAuthorityReportFiled:
      input.localAuthorityReportFiled ?? before.localAuthorityReportFiled,
    verificationStatus: normalizeVerificationStatus(input.verificationStatus, before.verificationStatus),
    verificationNote: normalizeOptionalString(input.verificationNote, before.verificationNote),
  };
}

function auditMetadata(before: WorktimeAgreementSettings, after: WorktimeAgreementSettings) {
  return {
    changedFields: (Object.keys(after) as Array<keyof WorktimeAgreementSettings>).filter(
      (key) => serializeForCompare(before[key]) !== serializeForCompare(after[key]),
    ),
    approvalType: after.approvalType,
    approvalOnFile: after.approvalOnFile,
    verificationStatus: after.verificationStatus,
    localAuthorityReportRequired: after.localAuthorityReportRequired,
    localAuthorityReportFiled: after.localAuthorityReportFiled,
    effectiveFrom: after.effectiveFrom?.toISOString() ?? null,
    effectiveTo: after.effectiveTo?.toISOString() ?? null,
    evidenceRefStoredAsReferenceOnly: Boolean(after.evidenceRef),
  };
}

function readRecord(record: WorktimeAgreementSettingsRecord): WorktimeAgreementSettings {
  return {
    approvalType: normalizeApprovalType(record.approvalType, "labor_management_conference"),
    approvalOnFile: record.approvalOnFile,
    evidenceRef: record.evidenceRef,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    monthlyOvertimeLimitMinutes: record.monthlyOvertimeLimitMinutes,
    threeMonthOvertimeLimitMinutes: record.threeMonthOvertimeLimitMinutes,
    localAuthorityReportRequired: record.localAuthorityReportRequired,
    localAuthorityReportFiled: record.localAuthorityReportFiled,
    verificationStatus: normalizeVerificationStatus(record.verificationStatus, "unverified"),
    verificationNote: record.verificationNote,
  };
}

function getDemoState() {
  if (!globalForWorktimeAgreement.hrOneWorktimeAgreementDemoState) {
    resetWorktimeAgreementDemoState();
  }
  return globalForWorktimeAgreement.hrOneWorktimeAgreementDemoState!;
}

function normalizeApprovalType(
  value: unknown,
  fallback: WorktimeAgreementApprovalType,
): WorktimeAgreementApprovalType {
  if (value === "labor_management_conference" || value === "labor_union" || value === "other") {
    return value;
  }
  return fallback;
}

function normalizeVerificationStatus(
  value: unknown,
  fallback: WorktimeAgreementVerificationStatus,
): WorktimeAgreementVerificationStatus {
  if (value === "unverified" || value === "verified" || value === "failed") return value;
  return fallback;
}

function normalizeOptionalString(value: unknown, fallback: string | null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalDate(value: unknown, fallback: Date | null) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : startOfDate(value);
  if (typeof value !== "string") return fallback;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : startOfDate(date);
}

function positiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number") return fallback;
  const parsed = Math.round(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function approvalTypeLabel(value: WorktimeAgreementApprovalType) {
  switch (value) {
    case "labor_union":
      return "labor union approval";
    case "other":
      return "other approval";
    case "labor_management_conference":
      return "labor-management conference approval";
  }
}

function minutesToHours(value: number) {
  return Number.isInteger(value / 60) ? String(value / 60) : (value / 60).toFixed(1);
}

function serializeForCompare(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

function startOfDate(date: Date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function endOfDate(date: Date) {
  const clone = new Date(date);
  clone.setHours(23, 59, 59, 999);
  return clone;
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
