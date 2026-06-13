import {
  calculateAnnualLeaveEntitlement,
  calculateHolidayWorkPay,
  calculateRegularDayOvertimePay,
  calculateRestDayOvertimePay,
  defaultTaiwanLaborStandardsConfig,
  validateMinimumWage,
  validateRestDayCycle,
  validateWorkingTime,
  type TaiwanLaborStandardsConfig,
} from "./taiwan-labor-standards";

export type RuleKey =
  | "tw.minimum_wage"
  | "tw.working_time"
  | "tw.rest_day_cycle"
  | "tw.regular_day_overtime_pay"
  | "tw.rest_day_overtime_pay"
  | "tw.holiday_work_pay"
  | "tw.annual_leave_entitlement";

export type RuleContext = {
  tenantId: string;
  companyId: string;
  ruleVersionId: string;
  effectiveAt: Date;
  ruleKey: RuleKey;
};

export type RuleEvaluationResult = {
  ruleVersionId: string;
  ruleKey: RuleKey;
  passed: boolean;
  result: Record<string, unknown>;
  explanation: string;
  sourceIds: string[];
};

export type RuleEngineReadiness = {
  passed: boolean;
  passedCount: number;
  checkCount: number;
  detail: string;
};

export type RuleHandler = (
  context: RuleContext,
  input: Record<string, unknown>,
) => RuleEvaluationResult;

export interface RuleEngine {
  evaluate(
    context: RuleContext,
    input: Record<string, unknown>,
  ): Promise<RuleEvaluationResult>;
}

export class RuleRegistryEngine implements RuleEngine {
  constructor(private readonly handlers: Map<RuleKey, RuleHandler>) {}

  async evaluate(
    context: RuleContext,
    input: Record<string, unknown>,
  ): Promise<RuleEvaluationResult> {
    const handler = this.handlers.get(context.ruleKey);
    if (!handler) {
      throw new Error(`Rule handler is not registered: ${context.ruleKey}`);
    }
    return handler(context, input);
  }
}

export function createTaiwanLaborRuleEngine(
  config: TaiwanLaborStandardsConfig = defaultTaiwanLaborStandardsConfig,
) {
  return new RuleRegistryEngine(new Map<RuleKey, RuleHandler>([
    ["tw.minimum_wage", (context, input) => {
      const result = validateMinimumWage({
        monthlyWage: optionalNumber(input.monthlyWage),
        hourlyWage: optionalNumber(input.hourlyWage),
        config,
      });
      return buildResult({
        context,
        passed: result.passed,
        result: {
          issues: result.issues,
          minimumMonthlyWage: config.minimumMonthlyWage,
          minimumHourlyWage: config.minimumHourlyWage,
        },
        explanation: result.passed
          ? "Configured Taiwan minimum wage checks passed."
          : result.issues.join(" "),
        sourceIds: sourceIds(result.sources),
      });
    }],
    ["tw.working_time", (context, input) => {
      const result = validateWorkingTime({
        regularMinutes: requiredNumber(input.regularMinutes, "regularMinutes"),
        overtimeMinutes: requiredNumber(input.overtimeMinutes, "overtimeMinutes"),
        weeklyRegularMinutes: requiredNumber(input.weeklyRegularMinutes, "weeklyRegularMinutes"),
        monthlyOvertimeMinutes: optionalNumber(input.monthlyOvertimeMinutes),
        threeMonthOvertimeMinutes: optionalNumber(input.threeMonthOvertimeMinutes),
        laborManagementAgreement: input.laborManagementAgreement === true,
        config,
      });
      return buildResult({
        context,
        passed: result.passed,
        result: {
          issues: result.issues,
          normalDailyMinutes: config.normalDailyMinutes,
          normalWeeklyMinutes: config.normalWeeklyMinutes,
          maxDailyWorkMinutesIncludingOvertime: config.maxDailyWorkMinutesIncludingOvertime,
          maxMonthlyOvertimeMinutes: input.laborManagementAgreement === true
            ? config.maxMonthlyOvertimeMinutesWithAgreement
            : config.maxMonthlyOvertimeMinutes,
        },
        explanation: result.passed
          ? "Configured Taiwan working-time checks passed."
          : result.issues.join(" "),
        sourceIds: sourceIds(result.sources),
      });
    }],
    ["tw.rest_day_cycle", (context, input) => {
      const result = validateRestDayCycle({
        days: requiredRestDayCycle(input.days),
        config,
      });
      return buildResult({
        context,
        passed: result.passed,
        result: {
          issues: result.issues,
          restDayCycleDays: config.restDayCycleDays,
          requiredRegularLeaveDaysPerCycle: config.requiredRegularLeaveDaysPerCycle,
          requiredRestDaysPerCycle: config.requiredRestDaysPerCycle,
        },
        explanation: result.passed
          ? "Configured Taiwan seven-day rest cycle checks passed."
          : result.issues.join(" "),
        sourceIds: sourceIds(result.sources),
      });
    }],
    ["tw.regular_day_overtime_pay", (context, input) => {
      const result = calculateRegularDayOvertimePay({
        hourlyWage: requiredNumber(input.hourlyWage, "hourlyWage"),
        overtimeMinutes: requiredNumber(input.overtimeMinutes, "overtimeMinutes"),
        config,
      });
      return buildResult({
        context,
        passed: true,
        result: {
          total: result.total,
          buckets: result.buckets,
        },
        explanation: `Configured regular-day overtime calculation produced ${result.total}.`,
        sourceIds: sourceIds(result.sources),
      });
    }],
    ["tw.rest_day_overtime_pay", (context, input) => {
      const result = calculateRestDayOvertimePay({
        hourlyWage: requiredNumber(input.hourlyWage, "hourlyWage"),
        workMinutes: requiredNumber(input.workMinutes, "workMinutes"),
        config,
      });
      return buildResult({
        context,
        passed: true,
        result: {
          total: result.total,
          buckets: result.buckets,
        },
        explanation: `Configured rest-day work calculation produced ${result.total}.`,
        sourceIds: sourceIds(result.sources),
      });
    }],
    ["tw.holiday_work_pay", (context, input) => {
      const result = calculateHolidayWorkPay({
        hourlyWage: requiredNumber(input.hourlyWage, "hourlyWage"),
        workMinutes: requiredNumber(input.workMinutes, "workMinutes"),
        holidayType: input.holidayType === "regular_leave" ? "regular_leave" : "national_holiday",
        config,
      });
      return buildResult({
        context,
        passed: true,
        result: {
          total: result.total,
          multiplier: result.multiplier,
        },
        explanation: `Configured holiday work calculation produced ${result.total}.`,
        sourceIds: sourceIds(result.sources),
      });
    }],
    ["tw.annual_leave_entitlement", (context, input) => {
      const result = calculateAnnualLeaveEntitlement({
        serviceMonths: requiredNumber(input.serviceMonths, "serviceMonths"),
        config,
      });
      return buildResult({
        context,
        passed: true,
        result: {
          days: result.days,
        },
        explanation: `Configured annual leave entitlement is ${result.days} day(s).`,
        sourceIds: sourceIds(result.sources),
      });
    }],
  ]));
}

export async function evaluateTaiwanRuleEngineReadiness(
  config: TaiwanLaborStandardsConfig = defaultTaiwanLaborStandardsConfig,
): Promise<RuleEngineReadiness> {
  const engine = createTaiwanLaborRuleEngine(config);
  const context = {
    tenantId: "readiness",
    companyId: "readiness",
    ruleVersionId: config.version,
    effectiveAt: new Date(`${config.effectiveFrom}T00:00:00.000Z`),
  };
  const checks = await Promise.all([
    engine.evaluate(
      { ...context, ruleKey: "tw.minimum_wage" },
      { hourlyWage: config.minimumHourlyWage - 1 },
    ).then((result) => ({
      name: "minimum wage violation",
      passed: !result.passed && result.sourceIds.includes("tw-minimum-wage-2026"),
    })),
    engine.evaluate(
      { ...context, ruleKey: "tw.working_time" },
      {
        regularMinutes: config.normalDailyMinutes,
        overtimeMinutes: Math.max(1, config.maxDailyWorkMinutesIncludingOvertime - config.normalDailyMinutes + 1),
        weeklyRegularMinutes: config.normalWeeklyMinutes,
        monthlyOvertimeMinutes: config.maxMonthlyOvertimeMinutes + 1,
      },
    ).then((result) => ({
      name: "working-time violation",
      passed: !result.passed && result.sourceIds.includes("tw-lsa-article-30"),
    })),
    engine.evaluate(
      { ...context, ruleKey: "tw.regular_day_overtime_pay" },
      { hourlyWage: config.minimumHourlyWage, overtimeMinutes: 180 },
    ).then((result) => ({
      name: "regular-day overtime calculation",
      passed: result.passed && typeof result.result.total === "number" && result.sourceIds.includes("tw-lsa-article-24"),
    })),
    engine.evaluate(
      { ...context, ruleKey: "tw.annual_leave_entitlement" },
      { serviceMonths: 36 },
    ).then((result) => ({
      name: "annual leave entitlement",
      passed: result.passed && result.result.days === 14 && result.sourceIds.includes("tw-lsa-article-38"),
    })),
  ]);
  const failed = checks.filter((check) => !check.passed);
  return {
    passed: failed.length === 0,
    passedCount: checks.length - failed.length,
    checkCount: checks.length,
    detail: failed.length === 0
      ? `${checks.length} executable rule-engine check(s) passed.`
      : `Failed executable rule-engine check(s): ${failed.map((check) => check.name).join(", ")}.`,
  };
}

function buildResult(input: {
  context: RuleContext;
  passed: boolean;
  result: Record<string, unknown>;
  explanation: string;
  sourceIds: string[];
}): RuleEvaluationResult {
  return {
    ruleVersionId: input.context.ruleVersionId,
    ruleKey: input.context.ruleKey,
    passed: input.passed,
    result: input.result,
    explanation: input.explanation,
    sourceIds: input.sourceIds,
  };
}

function requiredNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Rule input ${fieldName} must be a finite number.`);
  }
  return value;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredRestDayCycle(value: unknown): Array<{
  date: string;
  dayType: "workday" | "regular_leave" | "rest_day" | "holiday";
}> {
  if (!Array.isArray(value)) {
    throw new Error("Rule input days must be an array.");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Rule input days contains an invalid row.");
    }
    const record = item as Record<string, unknown>;
    if (typeof record.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      throw new Error("Rule input days.date must use YYYY-MM-DD.");
    }
    if (
      record.dayType !== "workday" &&
      record.dayType !== "regular_leave" &&
      record.dayType !== "rest_day" &&
      record.dayType !== "holiday"
    ) {
      throw new Error("Rule input days.dayType is invalid.");
    }
    return {
      date: record.date,
      dayType: record.dayType,
    };
  });
}

function sourceIds(sources: Array<{ id: string }>) {
  return [...new Set(sources.map((source) => source.id))];
}
