import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getWorktimeAgreementReadiness } from "./worktime-agreements";
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
  riskType: "daily_worktime" | "weekly_regular_worktime" | "monthly_overtime" | "rest_day_cycle";
  severity: "warning" | "danger";
  detail: string;
  sourceIds: string[];
};

export type WorktimeComplianceWorkspace = {
  periodStart: Date;
  periodEnd: Date;
  risks: WorktimeComplianceRisk[];
  auditCount: number;
  agreementReady: boolean;
  agreementDetail: string;
};

type RestDayCycleInputDay = {
  date: string;
  dayType: "workday" | "regular_leave" | "rest_day" | "holiday";
};

type WorktimeAttendanceRecordForWeekly = {
  workDate: Date;
  clockInAt: Date | null;
  clockOutAt: Date | null;
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
      const [agreement, auditCount] = await Promise.all([
        getWorktimeAgreementReadiness(session),
        getDb().auditLog.count({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            entityType: "worktime_compliance_scan",
          },
        }),
      ]);
      const risks = await scanDbWorktimeRisks(session, period.periodStart, period.periodEnd, agreement.ready);
      return {
        ...period,
        risks,
        auditCount,
        agreementReady: agreement.ready,
        agreementDetail: agreement.detail,
      };
    } catch {
      return getDemoWorkspace(period.periodStart, period.periodEnd);
    }
  }
  const agreement = await getWorktimeAgreementReadiness(session);
  return getDemoWorkspace(period.periodStart, period.periodEnd, agreement.ready, agreement.detail);
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

async function scanDbWorktimeRisks(
  session: SessionLike,
  periodStart: Date,
  periodEnd: Date,
  agreementReady: boolean,
) {
  const weeklyScanStart = startOfIsoWeek(periodStart);
  const weeklyScanEnd = endOfIsoWeek(periodEnd);
  const [employees, calendarDays, laborConfig] = await Promise.all([
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
              gte: weeklyScanStart,
              lte: weeklyScanEnd,
            },
          },
        },
        workSchedules: {
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
    getDb().companyCalendarDay.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        calendarDate: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: { calendarDate: "asc" },
    }),
    getTaiwanLaborStandardsConfig(session),
  ]);
  return employees.flatMap((employee) => {
    const periodAttendanceRecords = employee.attendanceRecords.filter((record) =>
      isDateInRange(record.workDate, periodStart, periodEnd),
    );
    const dailyRisks = periodAttendanceRecords.flatMap((record) => {
      const workMinutes = record.clockInAt && record.clockOutAt
        ? minutesBetween(record.clockInAt, record.clockOutAt)
        : 0;
      const regularMinutes = Math.min(workMinutes, laborConfig.normalDailyMinutes);
      const overtimeMinutes = Math.max(0, workMinutes - regularMinutes);
      const validation = validateWorkingTime({
        regularMinutes,
        overtimeMinutes,
        weeklyRegularMinutes: laborConfig.normalWeeklyMinutes,
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
    const weeklyRisks = buildWeeklyRegularWorktimeRisks({
      employeeId: employee.id,
      employeeName: employee.displayName,
      records: employee.attendanceRecords,
      config: laborConfig,
    });
    const approvedOvertimeMinutes = employee.overtimeRequests.reduce((sum, request) => sum + request.minutes, 0);
    const monthly = validateWorkingTime({
      regularMinutes: 0,
      overtimeMinutes: 0,
      weeklyRegularMinutes: laborConfig.normalWeeklyMinutes,
      monthlyOvertimeMinutes: approvedOvertimeMinutes,
      threeMonthOvertimeMinutes: approvedOvertimeMinutes,
      laborManagementAgreement: agreementReady,
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
    const restDayCycle = validateRestDayCycle({
      days: buildRestDayCycleDays({
        periodStart,
        periodEnd,
        attendanceDates: periodAttendanceRecords
          .filter((record) => record.clockInAt || record.clockOutAt)
          .map((record) => record.workDate),
        scheduleDates: employee.workSchedules.map((schedule) => schedule.workDate),
        calendarDays: calendarDays.map((day) => ({
          calendarDate: day.calendarDate,
          dayType: day.dayType,
        })),
      }),
      config: laborConfig,
    });
    const restCycleRisks = restDayCycle.issues.map((issue) => ({
      employeeId: employee.id,
      employeeName: employee.displayName,
      riskType: "rest_day_cycle" as const,
      severity: "danger" as const,
      detail: issue,
      sourceIds: restDayCycle.sources.map((source) => source.id),
    }));
    return [...dailyRisks, ...weeklyRisks, ...monthlyRisks, ...restCycleRisks];
  });
}

async function createDbWorktimeComplianceExceptions(
  session: SessionLike,
  periodStart: Date,
  periodEnd: Date,
) {
  const agreement = await getWorktimeAgreementReadiness(session);
  const risks = await scanDbWorktimeRisks(session, periodStart, periodEnd, agreement.ready);
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

function getDemoWorkspace(
  periodStart: Date,
  periodEnd: Date,
  agreementReady = false,
  agreementDetail = "Demo agreement evidence is not configured.",
): WorktimeComplianceWorkspace {
  return {
    periodStart,
    periodEnd,
    risks: demoRisks(defaultTaiwanLaborStandardsConfig, agreementReady),
    auditCount: getDemoState().auditCount,
    agreementReady,
    agreementDetail,
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

function demoRisks(config: TaiwanLaborStandardsConfig, agreementReady = false): WorktimeComplianceRisk[] {
  const daily = validateWorkingTime({
    regularMinutes: 8 * 60,
    overtimeMinutes: 5 * 60,
    weeklyRegularMinutes: 40 * 60,
    config,
  });
  const weekly = validateWorkingTime({
    regularMinutes: 0,
    overtimeMinutes: 0,
    weeklyRegularMinutes: 41 * 60,
    config,
  });
  const monthly = validateWorkingTime({
    regularMinutes: 8 * 60,
    overtimeMinutes: 0,
    weeklyRegularMinutes: 40 * 60,
    monthlyOvertimeMinutes: 47 * 60,
    laborManagementAgreement: agreementReady,
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
    ...weekly.issues.map((issue) => ({
      employeeId: "demo-employee-3",
      employeeName: "王小美",
      riskType: "weekly_regular_worktime" as const,
      severity: "danger" as const,
      detail: `2026-06-01 - 2026-06-07 · ${issue}`,
      sourceIds: weekly.sources.map((source) => source.id),
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

export function buildWeeklyRegularWorktimeRisks(input: {
  employeeId: string;
  employeeName: string;
  records: WorktimeAttendanceRecordForWeekly[];
  config?: TaiwanLaborStandardsConfig;
}): WorktimeComplianceRisk[] {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const weeklySummaries = new Map<string, { weekStart: Date; weekEnd: Date; regularMinutes: number }>();
  for (const record of input.records) {
    const workMinutes = record.clockInAt && record.clockOutAt
      ? minutesBetween(record.clockInAt, record.clockOutAt)
      : 0;
    const regularMinutes = Math.min(workMinutes, config.normalDailyMinutes);
    const weekStart = startOfIsoWeek(record.workDate);
    const weekKey = formatDate(weekStart);
    const existing = weeklySummaries.get(weekKey) ?? {
      weekStart,
      weekEnd: endOfIsoWeek(record.workDate),
      regularMinutes: 0,
    };
    existing.regularMinutes += regularMinutes;
    weeklySummaries.set(weekKey, existing);
  }

  return Array.from(weeklySummaries.values()).flatMap((summary) => {
    const validation = validateWorkingTime({
      regularMinutes: 0,
      overtimeMinutes: 0,
      weeklyRegularMinutes: summary.regularMinutes,
      config,
    });
    return validation.issues.map((issue) => ({
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      riskType: "weekly_regular_worktime" as const,
      severity: "danger" as const,
      detail: `${formatDate(summary.weekStart)} - ${formatDate(summary.weekEnd)} · ${issue}`,
      sourceIds: validation.sources.map((source) => source.id),
    }));
  });
}

export function buildRestDayCycleDays(input: {
  periodStart: Date;
  periodEnd: Date;
  attendanceDates?: Date[];
  scheduleDates?: Date[];
  calendarDays?: Array<{ calendarDate: Date; dayType: string }>;
}): RestDayCycleInputDay[] {
  const attendanceDateKeys = new Set((input.attendanceDates ?? []).map(formatDate));
  const scheduleDateKeys = new Set((input.scheduleDates ?? []).map(formatDate));
  const calendarDayTypeByDate = new Map(
    (input.calendarDays ?? []).map((day) => [formatDate(day.calendarDate), normalizeCalendarDayType(day.dayType)]),
  );
  const days: RestDayCycleInputDay[] = [];
  for (
    let cursor = startOfUtcDate(input.periodStart);
    cursor.getTime() <= startOfUtcDate(input.periodEnd).getTime();
    cursor = addUtcDays(cursor, 1)
  ) {
    const date = formatDate(cursor);
    const hasWorkEvidence = attendanceDateKeys.has(date) || scheduleDateKeys.has(date);
    days.push({
      date,
      dayType: hasWorkEvidence ? "workday" : calendarDayTypeByDate.get(date) ?? "rest_day",
    });
  }
  return days;
}

function normalizeCalendarDayType(dayType: string): RestDayCycleInputDay["dayType"] {
  if (dayType === "regular_leave" || dayType === "regular-leave" || dayType === "例假") return "regular_leave";
  if (dayType === "rest_day" || dayType === "rest-day" || dayType === "休息日") return "rest_day";
  if (
    dayType === "national_holiday" ||
    dayType === "holiday" ||
    dayType === "company_holiday" ||
    dayType === "國定假日"
  ) {
    return "holiday";
  }
  if (dayType === "makeup_workday" || dayType === "workday" || dayType === "工作日") return "workday";
  return "rest_day";
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

function startOfUtcDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfIsoWeek(date: Date) {
  const clone = startOfUtcDate(date);
  const day = clone.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setUTCDate(clone.getUTCDate() + diff);
  return clone;
}

function endOfIsoWeek(date: Date) {
  return addUtcDays(startOfIsoWeek(date), 6);
}

function isDateInRange(date: Date, start: Date, end: Date) {
  const time = startOfUtcDate(date).getTime();
  return time >= startOfUtcDate(start).getTime() && time <= startOfUtcDate(end).getTime();
}

function addUtcDays(date: Date, days: number) {
  const clone = startOfUtcDate(date);
  clone.setUTCDate(clone.getUTCDate() + days);
  return clone;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function canUseDatabase(session: { tenantId: string | null; companyId: string | null }) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
