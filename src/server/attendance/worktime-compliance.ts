import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import {
  defaultTaiwanLaborStandardsConfig,
  validateRestDayCycle,
  validateWorkingTime,
  type TaiwanLaborStandardsConfig,
} from "@/server/rules/taiwan-labor-standards";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type WorktimeComplianceRisk = {
  employeeId: string;
  employeeName: string;
  riskType: "daily_worktime" | "monthly_overtime" | "rest_day_cycle";
  severity: "warning" | "danger";
  detail: string;
  sourceIds: string[];
};

export type WorktimeComplianceWorkspace = {
  periodStart: Date;
  periodEnd: Date;
  risks: WorktimeComplianceRisk[];
  auditCount: number;
};

type DemoState = {
  auditCount: number;
};

const globalForWorktimeCompliance = globalThis as unknown as {
  hrOneWorktimeComplianceDemoState?: DemoState;
};

export async function getWorktimeComplianceWorkspace(
  session: SessionLike,
  input?: { periodStart?: Date; periodEnd?: Date },
): Promise<WorktimeComplianceWorkspace> {
  assertPermission(session.role, "employee:read");
  const period = normalizePeriod(input?.periodStart, input?.periodEnd);
  if (canUseDatabase(session)) {
    try {
      const [risks, auditCount] = await Promise.all([
        scanDbWorktimeRisks(session, period.periodStart, period.periodEnd),
        getDb().auditLog.count({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            entityType: "worktime_compliance_scan",
          },
        }),
      ]);
      return { ...period, risks, auditCount };
    } catch {
      return getDemoWorkspace(period.periodStart, period.periodEnd);
    }
  }
  return getDemoWorkspace(period.periodStart, period.periodEnd);
}

export async function createWorktimeComplianceExceptions(
  session: SessionLike,
  input?: { periodStart?: Date; periodEnd?: Date },
) {
  assertPermission(session.role, "employee:write");
  const period = normalizePeriod(input?.periodStart, input?.periodEnd);
  if (canUseDatabase(session)) {
    try {
      return createDbWorktimeComplianceExceptions(session, period.periodStart, period.periodEnd);
    } catch {
      return createDemoWorktimeComplianceExceptions(session, period.periodStart, period.periodEnd);
    }
  }
  return createDemoWorktimeComplianceExceptions(session, period.periodStart, period.periodEnd);
}

export function resetWorktimeComplianceDemoState() {
  globalForWorktimeCompliance.hrOneWorktimeComplianceDemoState = { auditCount: 0 };
}

async function scanDbWorktimeRisks(session: SessionLike, periodStart: Date, periodEnd: Date) {
  const [employees, laborConfig] = await Promise.all([
    getDb().employee.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employmentStatus: "active",
      },
      include: {
        attendanceRecords: {
          where: {
            workDate: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        },
        overtimeRequests: {
          where: {
            status: "approved",
            startAt: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        },
      },
      orderBy: { employeeNo: "asc" },
    }),
    getTaiwanLaborStandardsConfig(session),
  ]);
  return employees.flatMap((employee) => {
    const dailyRisks = employee.attendanceRecords.flatMap((record) => {
      const workMinutes = record.clockInAt && record.clockOutAt
        ? minutesBetween(record.clockInAt, record.clockOutAt)
        : 0;
      const regularMinutes = Math.min(workMinutes, laborConfig.normalDailyMinutes);
      const overtimeMinutes = Math.max(0, workMinutes - regularMinutes);
      const validation = validateWorkingTime({
        regularMinutes,
        overtimeMinutes,
        weeklyRegularMinutes: 0,
        config: laborConfig,
      });
      return validation.issues.map((issue) => ({
        employeeId: employee.id,
        employeeName: employee.displayName,
        riskType: "daily_worktime" as const,
        severity: "danger" as const,
        detail: `${formatDate(record.workDate)} · ${issue}`,
        sourceIds: validation.sources.map((source) => source.id),
      }));
    });
    const approvedOvertimeMinutes = employee.overtimeRequests.reduce((sum, request) => sum + request.minutes, 0);
    const monthly = validateWorkingTime({
      regularMinutes: 0,
      overtimeMinutes: 0,
      weeklyRegularMinutes: 0,
      monthlyOvertimeMinutes: approvedOvertimeMinutes,
      threeMonthOvertimeMinutes: approvedOvertimeMinutes,
      laborManagementAgreement: false,
      config: laborConfig,
    });
    const monthlyRisks = monthly.issues.map((issue) => ({
      employeeId: employee.id,
      employeeName: employee.displayName,
      riskType: "monthly_overtime" as const,
      severity: "warning" as const,
      detail: issue,
      sourceIds: monthly.sources.map((source) => source.id),
    }));
    return [...dailyRisks, ...monthlyRisks];
  });
}

async function createDbWorktimeComplianceExceptions(
  session: SessionLike,
  periodStart: Date,
  periodEnd: Date,
) {
  const risks = await scanDbWorktimeRisks(session, periodStart, periodEnd);
  await getDb().$transaction(async (tx) => {
    for (const risk of risks) {
      await tx.attendanceException.create({
        data: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employeeId: risk.employeeId,
          exceptionType: `worktime_${risk.riskType}`,
          severity: risk.severity,
          status: "pending",
        },
      });
    }
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "worktime_compliance_scan",
      entityId: `${formatDate(periodStart)}_${formatDate(periodEnd)}`,
      before: null,
      after: {
        periodStart,
        periodEnd,
        riskCount: risks.length,
      },
      metadata: {
        riskCount: risks.length,
        sourceIds: ["tw-lsa-article-30", "tw-lsa-article-32", "tw-lsa-article-36"],
      },
    });
  });
  return risks;
}

function getDemoWorkspace(periodStart: Date, periodEnd: Date): WorktimeComplianceWorkspace {
  return {
    periodStart,
    periodEnd,
    risks: demoRisks(defaultTaiwanLaborStandardsConfig),
    auditCount: getDemoState().auditCount,
  };
}

function createDemoWorktimeComplianceExceptions(
  session: SessionLike,
  periodStart: Date,
  periodEnd: Date,
) {
  const risks = demoRisks(defaultTaiwanLaborStandardsConfig);
  const state = getDemoState();
  state.auditCount += 1;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "worktime_compliance_scan",
    entityId: `${formatDate(periodStart)}_${formatDate(periodEnd)}`,
    before: null,
    after: {
      periodStart,
      periodEnd,
      riskCount: risks.length,
    },
    metadata: {
      riskCount: risks.length,
      sourceIds: ["tw-lsa-article-30", "tw-lsa-article-32", "tw-lsa-article-36"],
    },
  });
  return risks;
}

function demoRisks(config: TaiwanLaborStandardsConfig): WorktimeComplianceRisk[] {
  const daily = validateWorkingTime({
    regularMinutes: 8 * 60,
    overtimeMinutes: 5 * 60,
    weeklyRegularMinutes: 40 * 60,
    config,
  });
  const monthly = validateWorkingTime({
    regularMinutes: 8 * 60,
    overtimeMinutes: 0,
    weeklyRegularMinutes: 40 * 60,
    monthlyOvertimeMinutes: 47 * 60,
    config,
  });
  const rest = validateRestDayCycle({
    days: [
      { date: "2026-06-01", dayType: "workday" },
      { date: "2026-06-02", dayType: "workday" },
      { date: "2026-06-03", dayType: "workday" },
      { date: "2026-06-04", dayType: "workday" },
      { date: "2026-06-05", dayType: "workday" },
      { date: "2026-06-06", dayType: "workday" },
      { date: "2026-06-07", dayType: "rest_day" },
    ],
    config,
  });
  return [
    ...daily.issues.map((issue) => ({
      employeeId: "demo-employee-1",
      employeeName: "張小安",
      riskType: "daily_worktime" as const,
      severity: "danger" as const,
      detail: issue,
      sourceIds: daily.sources.map((source) => source.id),
    })),
    ...monthly.issues.map((issue) => ({
      employeeId: "demo-manager-employee",
      employeeName: "陳主管",
      riskType: "monthly_overtime" as const,
      severity: "warning" as const,
      detail: issue,
      sourceIds: monthly.sources.map((source) => source.id),
    })),
    ...rest.issues.map((issue) => ({
      employeeId: "demo-employee-2",
      employeeName: "李小真",
      riskType: "rest_day_cycle" as const,
      severity: "danger" as const,
      detail: issue,
      sourceIds: rest.sources.map((source) => source.id),
    })),
  ];
}

function normalizePeriod(periodStart?: Date, periodEnd?: Date) {
  const now = new Date();
  const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const end = periodEnd ?? new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { periodStart: startOfDate(start), periodEnd: startOfDate(end) };
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function getDemoState() {
  if (!globalForWorktimeCompliance.hrOneWorktimeComplianceDemoState) {
    resetWorktimeComplianceDemoState();
  }
  return globalForWorktimeCompliance.hrOneWorktimeComplianceDemoState!;
}

function startOfDate(date: Date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function canUseDatabase(session: { tenantId: string | null; companyId: string | null }) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
