import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type AttendancePolicyInput = {
  id?: string | null;
  name: string;
  status: "active" | "inactive";
  regularDailyMinutes: number;
  overtimeWarningDailyMinutes: number;
  clockInGraceMinutes: number;
  clockOutGraceMinutes: number;
  requireOvertimeApproval: boolean;
  requirePunchCorrectionApproval: boolean;
  allowMobilePunch: boolean;
  allowRemotePunch?: boolean;
  requireOfficeNetworkPunch?: boolean;
  allowedOfficeIpCidrs?: string[];
  requireGpsProximityPunch?: boolean;
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  gpsRadiusMeters?: number;
  punchPolicyNote?: string | null;
  attendanceRecordRetentionDays: number;
  employeeSelfServiceEnabled: boolean;
  employeeExportEnabled: boolean;
  effectiveFrom: Date;
};

export type AttendancePolicyView = Omit<
  AttendancePolicyInput,
  | "allowRemotePunch"
  | "requireOfficeNetworkPunch"
  | "allowedOfficeIpCidrs"
  | "requireGpsProximityPunch"
  | "officeLatitude"
  | "officeLongitude"
  | "gpsRadiusMeters"
  | "punchPolicyNote"
> & {
  id: string;
  allowRemotePunch: boolean;
  requireOfficeNetworkPunch: boolean;
  allowedOfficeIpCidrs: string[];
  requireGpsProximityPunch: boolean;
  officeLatitude: number | null;
  officeLongitude: number | null;
  gpsRadiusMeters: number;
  punchPolicyNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AttendancePolicyDemoState = {
  policies: AttendancePolicyView[];
};

const globalForAttendancePolicies = globalThis as unknown as {
  hrOneAttendancePolicyDemoState?: AttendancePolicyDemoState;
};

export async function getAttendancePolicySettings(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    const policies = await getDb().attendancePolicy.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
    });
    return policies.map(mapAttendancePolicy);
  }
  return getAttendancePolicyDemoState().policies;
}

export async function getActiveAttendancePolicy(session: SessionLike) {
  const policies = await getAttendancePolicySettings({
    ...session,
    role: session.role === "employee" ? "hr_admin" : session.role,
  });
  return (
    policies
      .filter((policy) => policy.status === "active" && policy.effectiveFrom <= new Date())
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? defaultAttendancePolicy()
  );
}

export async function saveAttendancePolicySettings(session: SessionLike, input: AttendancePolicyInput) {
  assertPermission(session.role, "attendance_policy:manage");
  const normalized = normalizeAttendancePolicyInput(input);
  if (canUseDatabase(session)) {
    return await saveDbAttendancePolicySettings(session, normalized);
  }
  return saveDemoAttendancePolicySettings(session, normalized);
}

export function resetAttendancePolicyDemoState() {
  const now = new Date();
  globalForAttendancePolicies.hrOneAttendancePolicyDemoState = {
    policies: [
      {
        ...defaultAttendancePolicy(),
        id: "demo-attendance-policy-default",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

async function saveDbAttendancePolicySettings(
  session: SessionLike,
  input: ReturnType<typeof normalizeAttendancePolicyInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = input.id
      ? await tx.attendancePolicy.findFirst({
          where: {
            id: input.id,
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
        })
      : null;
    const policy = before
      ? await tx.attendancePolicy.update({
          where: { id: before.id },
          data: dbPolicyData(input),
        })
      : await tx.attendancePolicy.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            createdByUserId: session.user?.id,
            ...dbPolicyData(input),
          },
        });

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "attendance_policy",
      entityId: policy.id,
      before,
      after: policy,
      metadata: {
        status: policy.status,
        effectiveFrom: policy.effectiveFrom.toISOString().slice(0, 10),
        punchControls: summarizePunchControls(policy),
        thresholdsRedacted: true,
      },
    });

    return mapAttendancePolicy(policy);
  });
}

function saveDemoAttendancePolicySettings(
  session: SessionLike,
  input: ReturnType<typeof normalizeAttendancePolicyInput>,
) {
  const state = getAttendancePolicyDemoState();
  const existingIndex = state.policies.findIndex((policy) => policy.id === input.id);
  const now = new Date();
  const policy: AttendancePolicyView = {
    id: existingIndex >= 0 ? state.policies[existingIndex].id : crypto.randomUUID(),
    name: input.name,
    status: input.status,
    regularDailyMinutes: input.regularDailyMinutes,
    overtimeWarningDailyMinutes: input.overtimeWarningDailyMinutes,
    clockInGraceMinutes: input.clockInGraceMinutes,
    clockOutGraceMinutes: input.clockOutGraceMinutes,
    requireOvertimeApproval: input.requireOvertimeApproval,
    requirePunchCorrectionApproval: input.requirePunchCorrectionApproval,
    allowMobilePunch: input.allowMobilePunch,
    allowRemotePunch: input.allowRemotePunch,
    requireOfficeNetworkPunch: input.requireOfficeNetworkPunch,
    allowedOfficeIpCidrs: input.allowedOfficeIpCidrs,
    requireGpsProximityPunch: input.requireGpsProximityPunch,
    officeLatitude: input.officeLatitude,
    officeLongitude: input.officeLongitude,
    gpsRadiusMeters: input.gpsRadiusMeters,
    punchPolicyNote: input.punchPolicyNote,
    attendanceRecordRetentionDays: input.attendanceRecordRetentionDays,
    employeeSelfServiceEnabled: input.employeeSelfServiceEnabled,
    employeeExportEnabled: input.employeeExportEnabled,
    effectiveFrom: input.effectiveFrom,
    createdAt: existingIndex >= 0 ? state.policies[existingIndex].createdAt : now,
    updatedAt: now,
  };
  if (existingIndex >= 0) {
    state.policies[existingIndex] = policy;
  } else {
    state.policies.unshift(policy);
  }

  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: existingIndex >= 0 ? "update" : "create",
    entityType: "attendance_policy",
    entityId: policy.id,
    after: policy,
    metadata: {
      status: policy.status,
      effectiveFrom: policy.effectiveFrom.toISOString().slice(0, 10),
      punchControls: summarizePunchControls(policy),
      thresholdsRedacted: true,
    },
  });
  return policy;
}

function normalizeAttendancePolicyInput(input: AttendancePolicyInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Attendance policy name is required.");
  const regularDailyMinutes = normalizeMinutes(input.regularDailyMinutes, "Regular daily minutes");
  const overtimeWarningDailyMinutes = normalizeMinutes(input.overtimeWarningDailyMinutes, "Overtime warning minutes");
  if (overtimeWarningDailyMinutes < regularDailyMinutes) {
    throw new Error("Overtime warning minutes cannot be below regular daily minutes.");
  }
  const effectiveFrom = startOfDate(input.effectiveFrom);
  if (Number.isNaN(effectiveFrom.getTime())) {
    throw new Error("Effective date is required.");
  }
  return {
    id: input.id || null,
    name,
    status: input.status === "inactive" ? "inactive" as const : "active" as const,
    regularDailyMinutes,
    overtimeWarningDailyMinutes,
    clockInGraceMinutes: normalizeNonNegativeInt(input.clockInGraceMinutes, "Clock-in grace minutes"),
    clockOutGraceMinutes: normalizeNonNegativeInt(input.clockOutGraceMinutes, "Clock-out grace minutes"),
    requireOvertimeApproval: Boolean(input.requireOvertimeApproval),
    requirePunchCorrectionApproval: Boolean(input.requirePunchCorrectionApproval),
    allowMobilePunch: Boolean(input.allowMobilePunch),
    allowRemotePunch: input.allowRemotePunch ?? true,
    requireOfficeNetworkPunch: Boolean(input.requireOfficeNetworkPunch),
    allowedOfficeIpCidrs: normalizeCidrList(input.allowedOfficeIpCidrs ?? []),
    requireGpsProximityPunch: Boolean(input.requireGpsProximityPunch),
    officeLatitude: normalizeCoordinate(input.officeLatitude ?? null, "Office latitude", -90, 90),
    officeLongitude: normalizeCoordinate(input.officeLongitude ?? null, "Office longitude", -180, 180),
    gpsRadiusMeters: normalizeRadius(input.gpsRadiusMeters ?? 300),
    punchPolicyNote: cleanOptionalText(input.punchPolicyNote ?? null, 500),
    attendanceRecordRetentionDays: normalizeRetentionDays(input.attendanceRecordRetentionDays),
    employeeSelfServiceEnabled: Boolean(input.employeeSelfServiceEnabled),
    employeeExportEnabled: Boolean(input.employeeExportEnabled),
    effectiveFrom,
  };
}

function dbPolicyData(input: ReturnType<typeof normalizeAttendancePolicyInput>) {
  return {
    name: input.name,
    status: input.status,
    regularDailyMinutes: input.regularDailyMinutes,
    overtimeWarningDailyMinutes: input.overtimeWarningDailyMinutes,
    clockInGraceMinutes: input.clockInGraceMinutes,
    clockOutGraceMinutes: input.clockOutGraceMinutes,
    requireOvertimeApproval: input.requireOvertimeApproval,
    requirePunchCorrectionApproval: input.requirePunchCorrectionApproval,
    allowMobilePunch: input.allowMobilePunch,
    allowRemotePunch: input.allowRemotePunch,
    requireOfficeNetworkPunch: input.requireOfficeNetworkPunch,
    allowedOfficeIpCidrsJson: input.allowedOfficeIpCidrs,
    requireGpsProximityPunch: input.requireGpsProximityPunch,
    officeLatitude: input.officeLatitude,
    officeLongitude: input.officeLongitude,
    gpsRadiusMeters: input.gpsRadiusMeters,
    punchPolicyNote: input.punchPolicyNote,
    attendanceRecordRetentionDays: input.attendanceRecordRetentionDays,
    employeeSelfServiceEnabled: input.employeeSelfServiceEnabled,
    employeeExportEnabled: input.employeeExportEnabled,
    effectiveFrom: input.effectiveFrom,
  };
}

function mapAttendancePolicy(row: {
  id: string;
  name: string;
  status: string;
  regularDailyMinutes: number;
  overtimeWarningDailyMinutes: number;
  clockInGraceMinutes: number;
  clockOutGraceMinutes: number;
  requireOvertimeApproval: boolean;
  requirePunchCorrectionApproval: boolean;
  allowMobilePunch: boolean;
  allowRemotePunch?: boolean;
  requireOfficeNetworkPunch?: boolean;
  allowedOfficeIpCidrsJson?: unknown;
  requireGpsProximityPunch?: boolean;
  officeLatitude?: { toNumber(): number } | number | null;
  officeLongitude?: { toNumber(): number } | number | null;
  gpsRadiusMeters?: number;
  punchPolicyNote?: string | null;
  attendanceRecordRetentionDays?: number;
  employeeSelfServiceEnabled?: boolean;
  employeeExportEnabled?: boolean;
  effectiveFrom: Date;
  createdAt: Date;
  updatedAt: Date;
}): AttendancePolicyView {
  return {
    id: row.id,
    name: row.name,
    status: row.status === "inactive" ? "inactive" : "active",
    regularDailyMinutes: row.regularDailyMinutes,
    overtimeWarningDailyMinutes: row.overtimeWarningDailyMinutes,
    clockInGraceMinutes: row.clockInGraceMinutes,
    clockOutGraceMinutes: row.clockOutGraceMinutes,
    requireOvertimeApproval: row.requireOvertimeApproval,
    requirePunchCorrectionApproval: row.requirePunchCorrectionApproval,
    allowMobilePunch: row.allowMobilePunch,
    allowRemotePunch: row.allowRemotePunch ?? true,
    requireOfficeNetworkPunch: row.requireOfficeNetworkPunch ?? false,
    allowedOfficeIpCidrs: readStringArray(row.allowedOfficeIpCidrsJson),
    requireGpsProximityPunch: row.requireGpsProximityPunch ?? false,
    officeLatitude: decimalToNumber(row.officeLatitude),
    officeLongitude: decimalToNumber(row.officeLongitude),
    gpsRadiusMeters: row.gpsRadiusMeters ?? 300,
    punchPolicyNote: row.punchPolicyNote ?? null,
    attendanceRecordRetentionDays: row.attendanceRecordRetentionDays ?? minimumAttendanceRetentionDays,
    employeeSelfServiceEnabled: row.employeeSelfServiceEnabled ?? true,
    employeeExportEnabled: row.employeeExportEnabled ?? true,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function defaultAttendancePolicy(): AttendancePolicyView {
  const now = new Date();
  return {
    id: "default-attendance-policy",
    name: "Default attendance policy",
    status: "active",
    regularDailyMinutes: 540,
    overtimeWarningDailyMinutes: 720,
    clockInGraceMinutes: 5,
    clockOutGraceMinutes: 5,
    requireOvertimeApproval: true,
    requirePunchCorrectionApproval: true,
    allowMobilePunch: true,
    allowRemotePunch: true,
    requireOfficeNetworkPunch: false,
    allowedOfficeIpCidrs: ["10.0.0.0/8", "192.168.0.0/16"],
    requireGpsProximityPunch: false,
    officeLatitude: 25.033,
    officeLongitude: 121.5654,
    gpsRadiusMeters: 300,
    punchPolicyNote: "員工可遠端打卡；若啟用辦公室網路或 GPS，系統會在打卡前提示限制。",
    attendanceRecordRetentionDays: minimumAttendanceRetentionDays,
    employeeSelfServiceEnabled: true,
    employeeExportEnabled: true,
    effectiveFrom: new Date("2026-01-01T00:00:00+08:00"),
    createdAt: now,
    updatedAt: now,
  };
}

export const minimumAttendanceRetentionDays = 365 * 5;

export type AttendanceRecordkeepingReadinessReport = {
  ready: boolean;
  missing: string[];
  detail: string;
};

export function evaluateAttendanceRecordkeepingReadiness(policy: AttendancePolicyView | null | undefined) {
  const missing = [
    !policy ? "active attendance policy" : null,
    policy && policy.attendanceRecordRetentionDays < minimumAttendanceRetentionDays ? "5-year attendance record retention" : null,
    policy && !policy.employeeSelfServiceEnabled ? "employee self-service attendance access" : null,
    policy && !policy.employeeExportEnabled ? "employee attendance export access" : null,
  ].filter((item): item is string => Boolean(item));
  return {
    ready: missing.length === 0,
    missing,
    detail: policy
      ? `${policy.attendanceRecordRetentionDays} retention day(s); employee self-service ${policy.employeeSelfServiceEnabled ? "enabled" : "disabled"}; export ${policy.employeeExportEnabled ? "enabled" : "disabled"}.`
      : "No active attendance policy configured.",
  };
}

function getAttendancePolicyDemoState() {
  if (!globalForAttendancePolicies.hrOneAttendancePolicyDemoState) {
    resetAttendancePolicyDemoState();
  }
  return globalForAttendancePolicies.hrOneAttendancePolicyDemoState!;
}

function normalizeMinutes(value: number, label: string) {
  const parsed = normalizeNonNegativeInt(value, label);
  if (parsed <= 0) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

function normalizeNonNegativeInt(value: number, label: string) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return parsed;
}

function normalizeRetentionDays(value: number) {
  const parsed = normalizeNonNegativeInt(value, "Attendance record retention days");
  if (parsed <= 0) throw new Error("Attendance record retention days must be greater than zero.");
  return parsed;
}

function normalizeRadius(value: number) {
  const parsed = normalizeNonNegativeInt(value, "GPS radius meters");
  if (parsed < 50) return 50;
  if (parsed > 5000) return 5000;
  return parsed;
}

function normalizeCoordinate(value: number | null, label: string, min: number, max: number) {
  if (value === null || value === undefined || value === 0) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} is outside the allowed range.`);
  }
  return Math.round(parsed * 10_000_000) / 10_000_000;
}

function normalizeCidrList(values: string[]) {
  return values
    .flatMap((value) => value.split(/[\n,]/))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function cleanOptionalText(value: string | null, maxLength: number) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function decimalToNumber(value: { toNumber(): number } | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return null;
  return value.toNumber();
}

function summarizePunchControls(policy: Pick<
  AttendancePolicyView,
  "allowRemotePunch" | "requireOfficeNetworkPunch" | "requireGpsProximityPunch" | "gpsRadiusMeters"
>) {
  return {
    allowRemotePunch: policy.allowRemotePunch,
    requireOfficeNetworkPunch: policy.requireOfficeNetworkPunch,
    requireGpsProximityPunch: policy.requireGpsProximityPunch,
    gpsRadiusMeters: policy.gpsRadiusMeters,
  };
}

function startOfDate(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
