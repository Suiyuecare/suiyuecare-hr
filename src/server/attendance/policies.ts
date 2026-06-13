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
  effectiveFrom: Date;
};

export type AttendancePolicyView = AttendancePolicyInput & {
  id: string;
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
    try {
      const policies = await getDb().attendancePolicy.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
      });
      return policies.map(mapAttendancePolicy);
    } catch {
      return getAttendancePolicyDemoState().policies;
    }
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
  assertPermission(session.role, "settings:write");
  const normalized = normalizeAttendancePolicyInput(input);
  if (canUseDatabase(session)) {
    try {
      return await saveDbAttendancePolicySettings(session, normalized);
    } catch {
      return saveDemoAttendancePolicySettings(session, normalized);
    }
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
    effectiveFrom: new Date("2026-01-01T00:00:00+08:00"),
    createdAt: now,
    updatedAt: now,
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

function startOfDate(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
