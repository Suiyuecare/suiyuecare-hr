import {
  calculateAnnualLeaveEntitlement,
  calculateHolidayWorkPay,
  calculateNationalHealthInsuranceSupplementaryPremium,
  calculateRegularDayOvertimePay,
  calculateRestDayOvertimePay,
  validateMinimumWage,
  validateRestDayCycle,
  validateWorkingTime,
  type LegalSource,
  type TaiwanLaborStandardsConfig,
} from "./taiwan-labor-standards";
import { calculateTerminationCompliance } from "@/server/employees/termination-compliance";

export type RuleValidationFixture = {
  id: string;
  name: string;
  category: "minimum_wage" | "overtime" | "working_time" | "leave" | "termination" | "payroll";
  passed: boolean;
  detail: string;
  sourceIds: string[];
};

export type RuleValidationSummary = {
  status: "passed" | "failed";
  passed: boolean;
  passedCount: number;
  failedCount: number;
  fixtureCount: number;
  validatedAt: string;
  fixtureSetVersion: string;
  fixtures: RuleValidationFixture[];
};

export const taiwanLaborFixtureSetVersion = "tw-labor-fixtures-2026.06-v3";
export const defaultLegalSourceMaxAgeDays = 180;

export type LegalSourceFreshnessSummary = {
  passed: boolean;
  totalSourceCount: number;
  freshSourceCount: number;
  staleSourceCount: number;
  invalidSourceCount: number;
  oldestCheckedAt: string | null;
  maxAgeDays: number;
  checkedAt: string;
  staleSourceIds: string[];
  invalidSourceIds: string[];
};

export function validateTaiwanLaborStandardsRuleSet(
  config: TaiwanLaborStandardsConfig,
  validatedAt = new Date().toISOString(),
): RuleValidationSummary {
  const fixtures: RuleValidationFixture[] = [
    validateMinimumWageBoundary(config),
    validateRegularDayOvertime(config),
    validateRestDayAndHolidayWork(config),
    validateWorkingTimeLimits(config),
    validateRestCycle(config),
    validateAnnualLeaveTiers(config),
    validateTerminationCompliance(config),
    validateSupplementaryNhiPremium(config),
    validateStatutoryFilingMappings(config),
  ];
  const failedCount = fixtures.filter((fixture) => !fixture.passed).length;
  return {
    status: failedCount === 0 ? "passed" : "failed",
    passed: failedCount === 0,
    passedCount: fixtures.length - failedCount,
    failedCount,
    fixtureCount: fixtures.length,
    validatedAt,
    fixtureSetVersion: taiwanLaborFixtureSetVersion,
    fixtures,
  };
}

export function buildRuleVersionTestCases(validation: RuleValidationSummary) {
  return validation.fixtures.map((fixture) => ({
    id: fixture.id,
    name: fixture.name,
    category: fixture.category,
    expected: { passed: true },
    actual: { passed: fixture.passed },
    passed: fixture.passed,
    detail: fixture.detail,
    sourceIds: fixture.sourceIds,
  }));
}

export function readRuleValidationSummary(value: unknown): Pick<RuleValidationSummary, "passed" | "passedCount" | "failedCount" | "fixtureCount" | "validatedAt" | "fixtureSetVersion"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidate = record.validationSummary;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const summary = candidate as Record<string, unknown>;
  if (
    typeof summary.passed === "boolean" &&
    typeof summary.passedCount === "number" &&
    typeof summary.failedCount === "number" &&
    typeof summary.fixtureCount === "number" &&
    typeof summary.validatedAt === "string" &&
    typeof summary.fixtureSetVersion === "string"
  ) {
    return {
      passed: summary.passed,
      passedCount: summary.passedCount,
      failedCount: summary.failedCount,
      fixtureCount: summary.fixtureCount,
      validatedAt: summary.validatedAt,
      fixtureSetVersion: summary.fixtureSetVersion,
    };
  }
  return null;
}

export function evaluateLegalSourceFreshness(
  sources: LegalSource[],
  options: { now?: Date; maxAgeDays?: number } = {},
): LegalSourceFreshnessSummary {
  const now = options.now ?? new Date();
  const maxAgeDays = options.maxAgeDays ?? defaultLegalSourceMaxAgeDays;
  const staleSourceIds: string[] = [];
  const invalidSourceIds: string[] = [];
  let freshSourceCount = 0;
  let oldestCheckedAt: string | null = null;

  for (const source of sources) {
    const checkedAt = parseIsoDateOnly(source.checkedAt);
    if (!checkedAt) {
      invalidSourceIds.push(source.id);
      continue;
    }

    if (!oldestCheckedAt || checkedAt.getTime() < new Date(`${oldestCheckedAt}T00:00:00.000Z`).getTime()) {
      oldestCheckedAt = source.checkedAt;
    }

    const ageDays = Math.floor((startOfUtcDay(now).getTime() - checkedAt.getTime()) / 86_400_000);
    if (ageDays < 0 || ageDays > maxAgeDays) {
      staleSourceIds.push(source.id);
    } else {
      freshSourceCount += 1;
    }
  }

  return {
    passed: staleSourceIds.length === 0 && invalidSourceIds.length === 0 && sources.length > 0,
    totalSourceCount: sources.length,
    freshSourceCount,
    staleSourceCount: staleSourceIds.length,
    invalidSourceCount: invalidSourceIds.length,
    oldestCheckedAt,
    maxAgeDays,
    checkedAt: startOfUtcDay(now).toISOString().slice(0, 10),
    staleSourceIds,
    invalidSourceIds,
  };
}

export function summarizeLegalSourceFreshness(summary: LegalSourceFreshnessSummary) {
  return {
    passed: summary.passed,
    totalSourceCount: summary.totalSourceCount,
    freshSourceCount: summary.freshSourceCount,
    staleSourceCount: summary.staleSourceCount,
    invalidSourceCount: summary.invalidSourceCount,
    oldestCheckedAt: summary.oldestCheckedAt,
    maxAgeDays: summary.maxAgeDays,
    checkedAt: summary.checkedAt,
  };
}

function validateMinimumWageBoundary(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const passCase = validateMinimumWage({
    monthlyWage: config.minimumMonthlyWage,
    hourlyWage: config.minimumHourlyWage,
    config,
  });
  const failCase = validateMinimumWage({
    monthlyWage: config.minimumMonthlyWage - 1,
    hourlyWage: config.minimumHourlyWage - 1,
    config,
  });
  const passed = passCase.passed && !failCase.passed && failCase.issues.length >= 2;
  return {
    id: "tw_minimum_wage_boundary",
    name: "Minimum wage accepts configured floor and rejects below-floor values",
    category: "minimum_wage",
    passed,
    detail: passed
      ? `Monthly ${config.minimumMonthlyWage} and hourly ${config.minimumHourlyWage} floors validated.`
      : "Minimum wage boundary validation failed.",
    sourceIds: sourceIds(passCase.sources),
  };
}

function validateRegularDayOvertime(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const hourlyWage = 180;
  const result = calculateRegularDayOvertimePay({ hourlyWage, overtimeMinutes: 180, config });
  const expected = roundMoney(
    (hourlyWage * 120 * config.regularDayOvertimeTiers[0].multiplier) / 60 +
    (hourlyWage * 60 * config.regularDayOvertimeTiers[1].multiplier) / 60,
  );
  const passed = result.total === expected && result.buckets.length === 2;
  return {
    id: "tw_regular_day_overtime_tiers",
    name: "Regular-day overtime uses first two configured Article 24 tiers",
    category: "overtime",
    passed,
    detail: passed ? `180 overtime minutes produce ${expected}.` : `Expected ${expected}, got ${result.total}.`,
    sourceIds: sourceIds(result.sources),
  };
}

function validateRestDayAndHolidayWork(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const hourlyWage = 200;
  const restDay = calculateRestDayOvertimePay({ hourlyWage, workMinutes: 180, config });
  const holiday = calculateHolidayWorkPay({
    hourlyWage,
    workMinutes: 480,
    holidayType: "national_holiday",
    config,
  });
  const expectedHoliday = roundMoney((hourlyWage * 480 * config.holidayWorkMultiplier) / 60);
  const passed = restDay.total > 0 && holiday.total === expectedHoliday;
  return {
    id: "tw_rest_day_holiday_work",
    name: "Rest-day and holiday work use configured multipliers",
    category: "overtime",
    passed,
    detail: passed ? `Holiday work produces ${expectedHoliday}; rest-day tiers are calculable.` : "Rest-day or holiday work validation failed.",
    sourceIds: sourceIds([...restDay.sources, ...holiday.sources]),
  };
}

function validateWorkingTimeLimits(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const valid = validateWorkingTime({
    regularMinutes: config.normalDailyMinutes,
    overtimeMinutes: Math.max(0, config.maxDailyWorkMinutesIncludingOvertime - config.normalDailyMinutes),
    weeklyRegularMinutes: config.normalWeeklyMinutes,
    monthlyOvertimeMinutes: config.maxMonthlyOvertimeMinutes,
    threeMonthOvertimeMinutes: config.maxThreeMonthOvertimeMinutesWithAgreement,
    laborManagementAgreement: true,
    config,
  });
  const invalid = validateWorkingTime({
    regularMinutes: config.normalDailyMinutes,
    overtimeMinutes: Math.max(1, config.maxDailyWorkMinutesIncludingOvertime - config.normalDailyMinutes + 1),
    weeklyRegularMinutes: config.normalWeeklyMinutes + 1,
    monthlyOvertimeMinutes: config.maxMonthlyOvertimeMinutesWithAgreement + 1,
    threeMonthOvertimeMinutes: config.maxThreeMonthOvertimeMinutesWithAgreement + 1,
    laborManagementAgreement: true,
    config,
  });
  const passed = valid.passed && !invalid.passed && invalid.issues.length >= 3;
  return {
    id: "tw_working_time_limits",
    name: "Working-time caps allow configured limits and reject exceedances",
    category: "working_time",
    passed,
    detail: passed
      ? `${config.maxDailyWorkMinutesIncludingOvertime / 60}h daily and overtime caps validated.`
      : "Working-time cap validation failed.",
    sourceIds: sourceIds(valid.sources),
  };
}

function validateRestCycle(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const validDays = [
    { date: "2026-06-01", dayType: "workday" as const },
    { date: "2026-06-02", dayType: "workday" as const },
    { date: "2026-06-03", dayType: "workday" as const },
    { date: "2026-06-04", dayType: "workday" as const },
    { date: "2026-06-05", dayType: "workday" as const },
    { date: "2026-06-06", dayType: "regular_leave" as const },
    { date: "2026-06-07", dayType: "rest_day" as const },
  ];
  const invalidDays = validDays.map((day) => ({ ...day, dayType: "workday" as const }));
  const valid = validateRestDayCycle({ days: validDays, config });
  const invalid = validateRestDayCycle({ days: invalidDays, config });
  const passed = valid.passed && !invalid.passed;
  return {
    id: "tw_rest_cycle",
    name: "Seven-day cycle checks regular leave and rest day requirements",
    category: "working_time",
    passed,
    detail: passed ? "Rest cycle accepts one regular leave day and one rest day." : "Rest cycle validation failed.",
    sourceIds: sourceIds(valid.sources),
  };
}

function validateAnnualLeaveTiers(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const cases = [
    { months: 5, days: 0 },
    { months: 6, days: 3 },
    { months: 12, days: 7 },
    { months: 36, days: 14 },
    { months: 132, days: 16 },
    { months: 360, days: 30 },
  ];
  const results = cases.map((testCase) => ({
    ...testCase,
    result: calculateAnnualLeaveEntitlement({ serviceMonths: testCase.months, config }),
  }));
  const passed = results.every((result) => result.result.days === result.days);
  return {
    id: "tw_annual_leave_tiers",
    name: "Annual leave tiers follow Article 38 service-month boundaries",
    category: "leave",
    passed,
    detail: passed ? "Service-month boundaries 6, 12, 36, 132, and 360 months validated." : "Annual leave tier validation failed.",
    sourceIds: sourceIds(results.flatMap((result) => result.result.sources)),
  };
}

function validateTerminationCompliance(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const hireDate = new Date("2024-01-01T00:00:00.000Z");
  const effectiveDate = new Date("2026-01-01T00:00:00.000Z");
  const result = calculateTerminationCompliance({
    hireDate,
    effectiveDate,
    reasonCategory: "layoff",
    pensionScheme: "labor_pension_new",
    averageMonthlyWage: 60_000,
    config,
  });
  const expectedMonths = Math.min(
    config.terminationCompliance.laborPensionSeveranceMaxAverageWageMonths,
    result.serviceYears * config.terminationCompliance.laborPensionSeveranceMultiplierPerServiceYear,
  );
  const passed =
    result.appliesStatutorySeverance &&
    result.requiredAdvanceNoticeDays >= 20 &&
    result.severancePayMonths === roundDecimal(expectedMonths, 4) &&
    result.severancePayEstimate === roundMoney(
      60_000 *
        Math.min(
          config.terminationCompliance.laborPensionSeveranceMaxAverageWageMonths,
          (differenceInDays(hireDate, effectiveDate) / 365) *
            config.terminationCompliance.laborPensionSeveranceMultiplierPerServiceYear,
        ),
    ) &&
    result.requiresHumanReview;
  return {
    id: "tw_termination_notice_severance",
    name: "Termination compliance calculates notice and severance review basis",
    category: "termination",
    passed,
    detail: passed
      ? `${result.requiredAdvanceNoticeDays} notice day(s); ${result.severancePayMonths} average-wage month(s).`
      : "Termination notice or severance validation failed.",
    sourceIds: sourceIds(result.sources),
  };
}

function validateSupplementaryNhiPremium(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const insuredSalary = 60_000;
  const bonusAmount = insuredSalary * config.statutoryPayroll.nationalHealthInsuranceSupplementaryBonusThresholdMultiplier + 10_000;
  const result = calculateNationalHealthInsuranceSupplementaryPremium({
    insuredSalary,
    bonusAmount,
    config,
  });
  const expected = Math.round(10_000 * config.statutoryPayroll.nationalHealthInsuranceSupplementaryPremiumRate);
  const passed = result.amount === expected && result.chargeableAmount === 10_000;
  return {
    id: "tw_nhi_supplementary_bonus_premium",
    name: "NHI supplementary premium applies only to bonus amount above configured threshold",
    category: "payroll",
    passed,
    detail: passed
      ? `Bonus excess 10000 produces supplementary premium ${expected}.`
      : `Expected ${expected}, got ${result.amount}.`,
    sourceIds: sourceIds(result.sources),
  };
}

function validateStatutoryFilingMappings(config: TaiwanLaborStandardsConfig): RuleValidationFixture {
  const reports = config.statutoryPayroll.statutoryFilingReports;
  const reportKeys = new Set(reports.map((report) => `${report.report}:${report.authority}`));
  const allCodes = reports.flatMap((report) => report.payrollItemCodes);
  const passed =
    reports.length > 0 &&
    reportKeys.size === reports.length &&
    reports.every((report) => (
      report.report.trim().length > 0 &&
      report.authority.trim().length > 0 &&
      report.payrollItemCodes.length > 0 &&
      report.payrollItemCodes.every((code) => code.trim().length > 0)
    ));
  return {
    id: "tw_statutory_filing_mappings",
    name: "Statutory filing packages map payroll item codes through versioned rules",
    category: "payroll",
    passed,
    detail: passed
      ? `${reports.length} filing package(s) map ${new Set(allCodes).size} payroll item code(s).`
      : "Statutory filing mappings must include unique report/authority rows and at least one payroll item code.",
    sourceIds: sourceIds(config.sources),
  };
}

function sourceIds(sources: Array<{ id: string }>) {
  return Array.from(new Set(sources.map((source) => source.id)));
}

function roundMoney(value: number) {
  return Math.round(value);
}

function roundDecimal(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function differenceInDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUtc - startUtc) / 86_400_000);
}

function parseIsoDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
