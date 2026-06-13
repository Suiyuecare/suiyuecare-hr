import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, normalizeRole, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: string;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type AttendancePeriodSignoffView = {
  id: string;
  employeeId: string;
  employeeName: string;
  periodStart: Date;
  periodEnd: Date;
  recordCount: number;
  exceptionCount: number;
  summaryHash: string;
  source: string;
  signedAt: Date;
};

export type AttendanceSignoffWorkspace = {
  periodStart: Date;
  periodEnd: Date;
  recordCount: number;
  exceptionCount: number;
  openExceptionCount: number;
  signoff: AttendancePeriodSignoffView | null;
};

export type AttendanceSignoffCoverage = {
  periodStart: Date;
  periodEnd: Date;
  employeeCount: number;
  signedCount: number;
  missingCount: number;
  openExceptionCount: number;
  coverageRate: number;
  readyForPayroll: boolean;
  signoffs: AttendancePeriodSignoffView[];
};

const fallbackEmployees = [
  { id: "demo-hr-employee", displayName: "林人資" },
  { id: "demo-manager-employee", displayName: "陳主管" },
  { id: "demo-employee-1", displayName: "張小安" },
  { id: "demo-employee-2", displayName: "李小真" },
  { id: "demo-employee-3", displayName: "黃小宇" },
];

type DemoState = {
  signoffs: AttendancePeriodSignoffView[];
};

const globalForAttendanceSignoffs = globalThis as unknown as {
  hrOneAttendanceSignoffDemoState?: DemoState;
};

export async function getEmployeeAttendanceSignoffWorkspace(
  session: SessionLike,
  input?: { periodStart?: Date; periodEnd?: Date },
): Promise<AttendanceSignoffWorkspace> {
  assertPermission(role(session.role), "attendance:read:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  const period = normalizePeriod(input?.periodStart, input?.periodEnd);
  if (canUseDatabase(session)) {
    try {
      const [recordCount, exceptionCount, openExceptionCount, signoff] = await Promise.all([
        getDb().attendanceRecord.count({
          where: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            employeeId: session.employee.id,
            workDate: { gte: period.periodStart, lte: period.periodEnd },
          },
        }),
        getDb().attendanceException.count({
          where: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            employeeId: session.employee.id,
            createdAt: { gte: period.periodStart, lte: period.periodEnd },
          },
        }),
        getDb().attendanceException.count({
          where: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            employeeId: session.employee.id,
            status: "pending",
            createdAt: { gte: period.periodStart, lte: period.periodEnd },
          },
        }),
        getDb().attendancePeriodSignoff.findUnique({
          where: {
            employeeId_periodStart: {
              employeeId: session.employee.id,
              periodStart: period.periodStart,
            },
          },
          include: { employee: { select: { displayName: true } } },
        }),
      ]);
      return {
        ...period,
        recordCount,
        exceptionCount,
        openExceptionCount,
        signoff: signoff ? readSignoff(signoff) : null,
      };
    } catch {
      return getDemoEmployeeWorkspace(session, period);
    }
  }
  return getDemoEmployeeWorkspace(session, period);
}

export async function signAttendancePeriod(
  session: SessionLike,
  input?: { periodStart?: Date; periodEnd?: Date },
) {
  assertPermission(role(session.role), "attendance:write");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  const workspace = await getEmployeeAttendanceSignoffWorkspace(session, input);
  if (workspace.openExceptionCount > 0) {
    throw new Error("Resolve pending attendance exceptions before signing this period.");
  }
  const summaryHash = signoffSummaryHash({
    employeeId: session.employee.id,
    periodStart: workspace.periodStart,
    periodEnd: workspace.periodEnd,
    recordCount: workspace.recordCount,
    exceptionCount: workspace.exceptionCount,
  });
  if (canUseDatabase(session)) {
    try {
      return signDbAttendancePeriod(session, workspace, summaryHash);
    } catch {
      return signDemoAttendancePeriod(session, workspace, summaryHash);
    }
  }
  return signDemoAttendancePeriod(session, workspace, summaryHash);
}

export async function getAttendanceSignoffCoverage(
  session: SessionLike,
  input?: { periodStart?: Date; periodEnd?: Date },
): Promise<AttendanceSignoffCoverage> {
  assertPermission(role(session.role), "employee:read");
  const period = normalizePeriod(input?.periodStart, input?.periodEnd);
  if (canUseDatabase(session)) {
    try {
      const [employees, signoffs, openExceptionCount] = await Promise.all([
        getDb().employee.findMany({
          where: { tenantId: session.tenantId, companyId: session.companyId, employmentStatus: "active" },
          select: { id: true },
        }),
        getDb().attendancePeriodSignoff.findMany({
          where: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            periodStart: period.periodStart,
          },
          include: { employee: { select: { displayName: true } } },
          orderBy: { signedAt: "desc" },
        }),
        getDb().attendanceException.count({
          where: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            status: "pending",
            createdAt: { gte: period.periodStart, lte: period.periodEnd },
          },
        }),
      ]);
      return buildCoverage(period, employees.length, signoffs.map(readSignoff), openExceptionCount);
    } catch {
      return getDemoCoverage(period);
    }
  }
  return getDemoCoverage(period);
}

export function resetAttendanceSignoffDemoState() {
  const period = normalizePeriod(new Date("2026-06-01T00:00:00.000Z"), new Date("2026-06-30T23:59:59.999Z"));
  globalForAttendanceSignoffs.hrOneAttendanceSignoffDemoState = {
    signoffs: fallbackEmployees.slice(0, 2).map((employee, index) => ({
      id: `demo-attendance-signoff-${index + 1}`,
      employeeId: employee.id,
      employeeName: employee.displayName,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      recordCount: 20,
      exceptionCount: 0,
      summaryHash: signoffSummaryHash({
        employeeId: employee.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        recordCount: 20,
        exceptionCount: 0,
      }),
      source: "seed",
      signedAt: new Date("2026-06-30T10:00:00.000Z"),
    })),
  };
}

function getDemoEmployeeWorkspace(
  session: SessionLike,
  period: { periodStart: Date; periodEnd: Date },
): AttendanceSignoffWorkspace {
  const state = getDemoState();
  const signoff = state.signoffs.find(
    (item) => item.employeeId === session.employee?.id && sameDay(item.periodStart, period.periodStart),
  ) ?? null;
  return {
    ...period,
    recordCount: 2,
    exceptionCount: 0,
    openExceptionCount: 0,
    signoff,
  };
}

function signDemoAttendancePeriod(
  session: SessionLike,
  workspace: AttendanceSignoffWorkspace,
  summaryHash: string,
) {
  const state = getDemoState();
  const index = state.signoffs.findIndex(
    (item) => item.employeeId === session.employee?.id && sameDay(item.periodStart, workspace.periodStart),
  );
  const signoff: AttendancePeriodSignoffView = {
    id: index >= 0 ? state.signoffs[index].id : crypto.randomUUID(),
    employeeId: session.employee!.id,
    employeeName: session.employee!.displayName,
    periodStart: workspace.periodStart,
    periodEnd: workspace.periodEnd,
    recordCount: workspace.recordCount,
    exceptionCount: workspace.exceptionCount,
    summaryHash,
    source: "employee_self_service",
    signedAt: new Date(),
  };
  if (index >= 0) state.signoffs[index] = signoff;
  else state.signoffs.unshift(signoff);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName,
    action: "approve",
    entityType: "attendance_period_signoff",
    entityId: signoff.id,
    after: signoffAuditPayload(signoff),
    metadata: signoffAuditMetadata(signoff),
  });
  return signoff;
}

async function signDbAttendancePeriod(
  session: SessionLike & { tenantId: string; companyId: string },
  workspace: AttendanceSignoffWorkspace,
  summaryHash: string,
) {
  const signoff = await getDb().$transaction(async (tx) => {
    const record = await tx.attendancePeriodSignoff.upsert({
      where: {
        employeeId_periodStart: {
          employeeId: session.employee!.id,
          periodStart: workspace.periodStart,
        },
      },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: session.employee!.id,
        periodStart: workspace.periodStart,
        periodEnd: workspace.periodEnd,
        recordCount: workspace.recordCount,
        exceptionCount: workspace.exceptionCount,
        summaryHash,
        source: "employee_self_service",
      },
      update: {
        periodEnd: workspace.periodEnd,
        recordCount: workspace.recordCount,
        exceptionCount: workspace.exceptionCount,
        summaryHash,
        source: "employee_self_service",
        signedAt: new Date(),
      },
      include: { employee: { select: { displayName: true } } },
    });
    const view = readSignoff(record);
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "approve",
      entityType: "attendance_period_signoff",
      entityId: record.id,
      after: signoffAuditPayload(view),
      metadata: signoffAuditMetadata(view),
    });
    return view;
  });
  return signoff;
}

function getDemoCoverage(period: { periodStart: Date; periodEnd: Date }) {
  return buildCoverage(period, fallbackEmployees.length, getDemoState().signoffs, 0);
}

function buildCoverage(
  period: { periodStart: Date; periodEnd: Date },
  employeeCount: number,
  signoffs: AttendancePeriodSignoffView[],
  openExceptionCount: number,
): AttendanceSignoffCoverage {
  const periodSignoffs = signoffs.filter((item) => sameDay(item.periodStart, period.periodStart));
  const signedCount = new Set(periodSignoffs.map((item) => item.employeeId)).size;
  const coverageRate = employeeCount === 0 ? 100 : Math.round((signedCount / employeeCount) * 100);
  return {
    ...period,
    employeeCount,
    signedCount,
    missingCount: Math.max(0, employeeCount - signedCount),
    openExceptionCount,
    coverageRate,
    readyForPayroll: coverageRate >= 90 && openExceptionCount === 0,
    signoffs: periodSignoffs,
  };
}

function readSignoff(record: {
  id: string;
  employeeId: string;
  employee: { displayName: string };
  periodStart: Date;
  periodEnd: Date;
  recordCount: number;
  exceptionCount: number;
  summaryHash: string;
  source: string;
  signedAt: Date;
}): AttendancePeriodSignoffView {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employee.displayName,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    recordCount: record.recordCount,
    exceptionCount: record.exceptionCount,
    summaryHash: record.summaryHash,
    source: record.source,
    signedAt: record.signedAt,
  };
}

function signoffAuditPayload(signoff: AttendancePeriodSignoffView) {
  return {
    employeeId: signoff.employeeId,
    periodStart: signoff.periodStart,
    periodEnd: signoff.periodEnd,
    recordCount: signoff.recordCount,
    exceptionCount: signoff.exceptionCount,
    summaryHash: signoff.summaryHash,
  };
}

function signoffAuditMetadata(signoff: AttendancePeriodSignoffView) {
  return {
    periodStart: signoff.periodStart.toISOString(),
    periodEnd: signoff.periodEnd.toISOString(),
    recordCount: signoff.recordCount,
    exceptionCount: signoff.exceptionCount,
    summaryHash: signoff.summaryHash,
    source: signoff.source,
    rawAttendanceRecordsIncluded: false,
  };
}

function signoffSummaryHash(input: {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  recordCount: number;
  exceptionCount: number;
}) {
  return stableHash({
    employeeId: input.employeeId,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    recordCount: input.recordCount,
    exceptionCount: input.exceptionCount,
  });
}

function normalizePeriod(periodStart?: Date, periodEnd?: Date) {
  const base = periodStart && !Number.isNaN(periodStart.getTime()) ? periodStart : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const end = periodEnd && !Number.isNaN(periodEnd.getTime())
    ? periodEnd
    : new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { periodStart: start, periodEnd: end };
}

function sameDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function getDemoState() {
  if (!globalForAttendanceSignoffs.hrOneAttendanceSignoffDemoState) resetAttendanceSignoffDemoState();
  return globalForAttendanceSignoffs.hrOneAttendanceSignoffDemoState!;
}

function role(value: string): RoleKey {
  return normalizeRole(value);
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
