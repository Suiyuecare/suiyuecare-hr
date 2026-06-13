export type LegalSource = {
  id: string;
  title: string;
  url: string;
  checkedAt: string;
};

export type OvertimeTier = {
  fromMinute: number;
  toMinute: number | null;
  multiplier: number;
  label: string;
};

export type InsuranceSalaryGrade = {
  level: number;
  insuredSalary: number;
  salaryFrom: number;
  salaryTo: number | null;
};

export type IncomeTaxBracket = {
  taxableIncomeFrom: number;
  taxableIncomeTo: number | null;
  rate: number;
  progressiveDifference: number;
};

export type StatutoryFilingReportDefinition = {
  report: string;
  authority: string;
  payrollItemCodes: string[];
};

export type TaiwanLaborStandardsConfig = {
  jurisdiction: "TW";
  version: string;
  effectiveFrom: string;
  changeControl: RuleChangeControl;
  minimumMonthlyWage: number;
  minimumHourlyWage: number;
  normalDailyMinutes: number;
  normalWeeklyMinutes: number;
  payrollStandardMonthlyHours: number;
  statutoryPayroll: TaiwanStatutoryPayrollConfig;
  regularDayOvertimeTiers: OvertimeTier[];
  restDayOvertimeTiers: OvertimeTier[];
  holidayWorkMultiplier: number;
  regularLeaveWorkMultiplier: number;
  emergencyOvertimeMultiplier: number;
  maxDailyWorkMinutesIncludingOvertime: number;
  maxMonthlyOvertimeMinutes: number;
  maxMonthlyOvertimeMinutesWithAgreement: number;
  maxThreeMonthOvertimeMinutesWithAgreement: number;
  restDayCycleDays: number;
  requiredRegularLeaveDaysPerCycle: number;
  requiredRestDaysPerCycle: number;
  terminationCompliance: TaiwanTerminationComplianceConfig;
  statutoryOnboarding: TaiwanStatutoryOnboardingConfig;
  annualLeaveTiers: Array<{
    serviceMonthsFrom: number;
    serviceMonthsTo: number | null;
    days: number;
    additionalDaysAfterYears?: number;
    maxDays?: number;
  }>;
  sources: LegalSource[];
};

export type TaiwanTerminationComplianceConfig = {
  advanceNoticeTiers: Array<{
    serviceMonthsFrom: number;
    serviceMonthsTo: number | null;
    noticeDays: number;
  }>;
  laborPensionSeveranceMultiplierPerServiceYear: number;
  laborPensionSeveranceMaxAverageWageMonths: number;
  laborStandardsSeveranceMultiplierPerServiceYear: number;
};

export type TaiwanStatutoryOnboardingConfig = {
  laborInsuranceEnrollmentDueDaysFromHire: number;
  employmentInsuranceEnrollmentDueDaysFromHire: number;
  occupationalAccidentInsuranceEnrollmentDueDaysFromHire: number;
  insuranceWithdrawalDueDaysFromTermination: number;
};

export type RuleChangeControl = {
  reason: string;
  sourceUrl: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewStatus: "pending_legal_review" | "approved";
  requiresPayrollRecalculation: boolean;
};

export type TaiwanStatutoryPayrollConfig = {
  laborInsuranceEmployeeRate: number;
  laborInsuranceEmployerShare: number;
  nationalHealthInsuranceRate: number;
  nationalHealthInsuranceEmployeeShare: number;
  nationalHealthInsuranceEmployerShare: number;
  nationalHealthInsuranceAverageDependentCount: number;
  nationalHealthInsuranceDependentLimit: number;
  nationalHealthInsuranceSupplementaryPremiumEnabled: boolean;
  nationalHealthInsuranceSupplementaryPremiumRate: number;
  nationalHealthInsuranceSupplementaryBonusThresholdMultiplier: number;
  occupationalAccidentIndustryRate: number;
  occupationalAccidentCommuteRate: number;
  laborPensionEmployerContributionRate: number;
  incomeTaxWithholdingRate: number;
  incomeTaxWithholding: TaiwanIncomeTaxWithholdingConfig;
  nonResidentIncomeTaxWithholdingRate: number;
  laborInsuranceSalaryGrades: InsuranceSalaryGrade[];
  healthInsuranceSalaryGrades: InsuranceSalaryGrade[];
  laborPensionContributionGrades: InsuranceSalaryGrade[];
  statutoryFilingReports: StatutoryFilingReportDefinition[];
};

export type TaiwanIncomeTaxWithholdingConfig = {
  mode: "annualized_progressive";
  monthsPerYear: number;
  monthlyExemptionAmount: number;
  monthlyStandardDeductionAmount: number;
  annualSalarySpecialDeductionAmount: number;
  minimumMonthlyWithholding: number;
  brackets: IncomeTaxBracket[];
};

export const defaultTaiwanLaborStandardsConfig: TaiwanLaborStandardsConfig = {
  jurisdiction: "TW",
  version: "2026.01-official-v1",
  effectiveFrom: "2026-01-01",
  changeControl: {
    reason: "Initial official-source baseline for Taiwan payroll and labor standards settings.",
    sourceUrl: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030001",
    reviewedBy: "HR One compliance baseline",
    reviewedAt: "2026-06-12",
    reviewStatus: "approved",
    requiresPayrollRecalculation: false,
  },
  minimumMonthlyWage: 29_500,
  minimumHourlyWage: 196,
  normalDailyMinutes: 8 * 60,
  normalWeeklyMinutes: 40 * 60,
  payrollStandardMonthlyHours: 240,
  statutoryPayroll: {
    laborInsuranceEmployeeRate: 0.12 * 0.2,
    laborInsuranceEmployerShare: 0.7,
    nationalHealthInsuranceRate: 0.0517,
    nationalHealthInsuranceEmployeeShare: 0.3,
    nationalHealthInsuranceEmployerShare: 0.6,
    nationalHealthInsuranceAverageDependentCount: 0.56,
    nationalHealthInsuranceDependentLimit: 3,
    nationalHealthInsuranceSupplementaryPremiumEnabled: true,
    nationalHealthInsuranceSupplementaryPremiumRate: 0.0211,
    nationalHealthInsuranceSupplementaryBonusThresholdMultiplier: 4,
    occupationalAccidentIndustryRate: 0.0021,
    occupationalAccidentCommuteRate: 0.0007,
    laborPensionEmployerContributionRate: 0.06,
    incomeTaxWithholdingRate: 0,
    nonResidentIncomeTaxWithholdingRate: 0.18,
    incomeTaxWithholding: {
      mode: "annualized_progressive",
      monthsPerYear: 12,
      monthlyExemptionAmount: 0,
      monthlyStandardDeductionAmount: 0,
      annualSalarySpecialDeductionAmount: 270_000,
      minimumMonthlyWithholding: 0,
      brackets: buildResidentIncomeTaxBrackets2026(),
    },
    laborInsuranceSalaryGrades: buildLaborInsuranceGrades2026(),
    healthInsuranceSalaryGrades: buildHealthInsuranceGrades2026Sample(),
    laborPensionContributionGrades: buildLaborInsuranceGrades2026(),
    statutoryFilingReports: [
      {
        report: "Labor insurance premium review",
        authority: "Bureau of Labor Insurance",
        payrollItemCodes: ["tw_labor_insurance_employee", "tw_labor_insurance_employer"],
      },
      {
        report: "National Health Insurance premium review",
        authority: "National Health Insurance Administration",
        payrollItemCodes: ["tw_nhi_employee", "tw_nhi_employer"],
      },
      {
        report: "Occupational accident insurance review",
        authority: "Bureau of Labor Insurance",
        payrollItemCodes: ["tw_occupational_accident_insurance_employer"],
      },
      {
        report: "Labor pension contribution review",
        authority: "Bureau of Labor Insurance",
        payrollItemCodes: ["tw_labor_pension_employer"],
      },
      {
        report: "Income tax withholding review",
        authority: "Ministry of Finance",
        payrollItemCodes: ["tw_income_tax_withholding"],
      },
      {
        report: "NHI supplementary premium review",
        authority: "National Health Insurance Administration",
        payrollItemCodes: ["tw_nhi_supplementary_employee"],
      },
    ],
  },
  regularDayOvertimeTiers: [
    {
      fromMinute: 0,
      toMinute: 120,
      multiplier: 4 / 3,
      label: "Regular day overtime first 2 hours",
    },
    {
      fromMinute: 120,
      toMinute: 240,
      multiplier: 5 / 3,
      label: "Regular day overtime over 2 and up to 4 hours",
    },
  ],
  restDayOvertimeTiers: [
    {
      fromMinute: 0,
      toMinute: 120,
      multiplier: 4 / 3,
      label: "Rest day work first 2 hours",
    },
    {
      fromMinute: 120,
      toMinute: null,
      multiplier: 5 / 3,
      label: "Rest day work over 2 hours",
    },
  ],
  holidayWorkMultiplier: 2,
  regularLeaveWorkMultiplier: 2,
  emergencyOvertimeMultiplier: 2,
  maxDailyWorkMinutesIncludingOvertime: 12 * 60,
  maxMonthlyOvertimeMinutes: 46 * 60,
  maxMonthlyOvertimeMinutesWithAgreement: 54 * 60,
  maxThreeMonthOvertimeMinutesWithAgreement: 138 * 60,
  restDayCycleDays: 7,
  requiredRegularLeaveDaysPerCycle: 1,
  requiredRestDaysPerCycle: 1,
  terminationCompliance: {
    advanceNoticeTiers: [
      { serviceMonthsFrom: 3, serviceMonthsTo: 12, noticeDays: 10 },
      { serviceMonthsFrom: 12, serviceMonthsTo: 36, noticeDays: 20 },
      { serviceMonthsFrom: 36, serviceMonthsTo: null, noticeDays: 30 },
    ],
    laborPensionSeveranceMultiplierPerServiceYear: 0.5,
    laborPensionSeveranceMaxAverageWageMonths: 6,
    laborStandardsSeveranceMultiplierPerServiceYear: 1,
  },
  statutoryOnboarding: {
    laborInsuranceEnrollmentDueDaysFromHire: 0,
    employmentInsuranceEnrollmentDueDaysFromHire: 0,
    occupationalAccidentInsuranceEnrollmentDueDaysFromHire: 0,
    insuranceWithdrawalDueDaysFromTermination: 0,
  },
  annualLeaveTiers: [
    { serviceMonthsFrom: 6, serviceMonthsTo: 12, days: 3 },
    { serviceMonthsFrom: 12, serviceMonthsTo: 24, days: 7 },
    { serviceMonthsFrom: 24, serviceMonthsTo: 36, days: 10 },
    { serviceMonthsFrom: 36, serviceMonthsTo: 60, days: 14 },
    { serviceMonthsFrom: 60, serviceMonthsTo: 120, days: 15 },
    {
      serviceMonthsFrom: 120,
      serviceMonthsTo: null,
      days: 15,
      additionalDaysAfterYears: 10,
      maxDays: 30,
    },
  ],
  sources: [
    {
      id: "tw-lsa-article-24",
      title: "Labor Standards Act Article 24 overtime wage",
      url: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030001",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-lsa-article-30",
      title: "Labor Standards Act Article 30 regular working time",
      url: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030001",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-lsa-article-36",
      title: "Labor Standards Act Article 36 regular leave and rest day",
      url: "https://laws.mol.gov.tw/FLAW/FLAWDAT09.aspx?flno=36&id=FL014930",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-lsa-article-37",
      title: "Labor Standards Act Article 37 national holidays",
      url: "https://laws.mol.gov.tw/FLAW/FLAWDAT09.aspx?flno=37&id=FL014930",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-lsa-article-38",
      title: "Labor Standards Act Article 38 annual paid leave",
      url: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030001",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-lsa-article-39",
      title: "Labor Standards Act Article 39 holiday work wage",
      url: "https://laws.mol.gov.tw/flaw/FLAWDAT0201.aspx?id=FL014930",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-lsa-enforcement-article-24-1",
      title: "Enforcement Rules of the Labor Standards Act Article 24-1 unused annual leave wage",
      url: "https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=24-1&id=FL014931",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-worker-leave-rules",
      title: "Regulations of Leave-Taking by Workers",
      url: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030006",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-gender-equality-employment-act",
      title: "Gender Equality in Employment Act",
      url: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030014",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-minimum-wage-2026",
      title: "Ministry of Labor 2026 minimum wage announcement",
      url: "https://english.mol.gov.tw/21139/40790/87087/",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-nhi-premium-2026",
      title: "National Health Insurance premium calculation examples",
      url: "https://www.nhi.gov.tw/ch/cp-3277-6c895-2588-1.html",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-nhi-supplementary-premium-2026",
      title: "National Health Insurance supplementary premium",
      url: "https://www.nhi.gov.tw/en/cp-225-fda97-8-2.html",
      checkedAt: "2026-06-13",
    },
    {
      id: "tw-labor-insurance-grades-2026",
      title: "MOL 2026 labor insurance and labor pension grading table update",
      url: "https://english.mol.gov.tw/21004/21005/80661/90780/",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-occupational-accident-insurance-2026",
      title: "Labor occupational accident insurance rate",
      url: "https://www.bli.gov.tw/en/0016054.html",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-income-tax-brackets-2026",
      title: "eTax Portal 2026 progressive income tax rate",
      url: "https://www.etax.nat.gov.tw/etwmain/en/announcement/alien-individual-income-tax/progressive-tax-rate",
      checkedAt: "2026-06-12",
    },
    {
      id: "tw-lsa-article-16-17",
      title: "Labor Standards Act Article 16 and 17 termination notice and severance",
      url: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030001",
      checkedAt: "2026-06-13",
    },
    {
      id: "tw-labor-pension-act-article-12",
      title: "Labor Pension Act Article 12 severance pay",
      url: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030020",
      checkedAt: "2026-06-13",
    },
    {
      id: "tw-labor-insurance-enrollment",
      title: "Bureau of Labor Insurance enrollment and withdrawal timing",
      url: "https://www.bli.gov.tw/en/0013141.html",
      checkedAt: "2026-06-13",
    },
  ],
};

export type OvertimeBucket = {
  label: string;
  minutes: number;
  multiplier: number;
  amount: number;
};

export function calculateRegularDayOvertimePay(input: {
  hourlyWage: number;
  overtimeMinutes: number;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const buckets = config.regularDayOvertimeTiers
    .map((tier) => {
      const tierEnd = tier.toMinute ?? input.overtimeMinutes;
      const minutes = Math.max(
        0,
        Math.min(input.overtimeMinutes, tierEnd) - tier.fromMinute,
      );
      return {
        label: tier.label,
        minutes,
        multiplier: tier.multiplier,
        amount: roundMoney((input.hourlyWage * minutes * tier.multiplier) / 60),
      };
    })
    .filter((bucket) => bucket.minutes > 0);

  return {
    total: buckets.reduce((sum, bucket) => sum + bucket.amount, 0),
    buckets,
    sources: config.sources.filter((source) => source.id === "tw-lsa-article-24"),
  };
}

export function calculateRestDayOvertimePay(input: {
  hourlyWage: number;
  workMinutes: number;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const buckets = config.restDayOvertimeTiers
    .map((tier) => {
      const tierEnd = tier.toMinute ?? input.workMinutes;
      const minutes = Math.max(0, Math.min(input.workMinutes, tierEnd) - tier.fromMinute);
      return {
        label: tier.label,
        minutes,
        multiplier: tier.multiplier,
        amount: roundMoney((input.hourlyWage * minutes * tier.multiplier) / 60),
      };
    })
    .filter((bucket) => bucket.minutes > 0);
  return {
    total: buckets.reduce((sum, bucket) => sum + bucket.amount, 0),
    buckets,
    sources: config.sources.filter((source) => source.id === "tw-lsa-article-24" || source.id === "tw-lsa-article-36"),
  };
}

export function calculateHolidayWorkPay(input: {
  hourlyWage: number;
  workMinutes: number;
  holidayType: "national_holiday" | "regular_leave";
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const multiplier = input.holidayType === "regular_leave"
    ? config.regularLeaveWorkMultiplier
    : config.holidayWorkMultiplier;
  return {
    total: roundMoney((input.hourlyWage * input.workMinutes * multiplier) / 60),
    multiplier,
    sources: config.sources.filter((source) =>
      input.holidayType === "regular_leave"
        ? source.id === "tw-lsa-article-36" || source.id === "tw-lsa-article-39"
        : source.id === "tw-lsa-article-37" || source.id === "tw-lsa-article-39",
    ),
  };
}

export function calculateAnnualLeaveEntitlement(input: {
  serviceMonths: number;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const tier = config.annualLeaveTiers.find(
    (candidate) =>
      input.serviceMonths >= candidate.serviceMonthsFrom &&
      (candidate.serviceMonthsTo === null || input.serviceMonths < candidate.serviceMonthsTo),
  );
  if (!tier) return { days: 0, sources: article38Sources(config) };

  if (!tier.additionalDaysAfterYears) {
    return { days: tier.days, sources: article38Sources(config) };
  }

  const serviceYears = Math.floor(input.serviceMonths / 12);
  const extraDays = Math.max(0, serviceYears - tier.additionalDaysAfterYears);
  return {
    days: Math.min(tier.maxDays ?? Number.POSITIVE_INFINITY, tier.days + extraDays),
    sources: article38Sources(config),
  };
}

export function calculateUnusedAnnualLeavePayout(input: {
  unusedDays: number;
  monthlyRegularWage?: number | null;
  dailyRegularWage?: number | null;
  reason: "year_end" | "contract_termination";
  carriedFromPreviousYear?: boolean;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const dailyWage =
    input.dailyRegularWage ??
    (input.monthlyRegularWage !== undefined && input.monthlyRegularWage !== null
      ? input.monthlyRegularWage / 30
      : null);
  if (!Number.isFinite(input.unusedDays) || input.unusedDays < 0) {
    throw new Error("Unused annual leave days must be zero or greater.");
  }
  if (dailyWage === null || !Number.isFinite(dailyWage) || dailyWage < 0) {
    throw new Error("Daily regular wage or monthly regular wage is required for unused annual leave payout.");
  }
  return {
    amount: roundMoney(input.unusedDays * dailyWage),
    dailyWage: roundCurrency(dailyWage),
    unusedDays: input.unusedDays,
    reason: input.reason,
    carriedFromPreviousYear: input.carriedFromPreviousYear ?? false,
    sources: config.sources.filter((source) =>
      source.id === "tw-lsa-article-38" || source.id === "tw-lsa-enforcement-article-24-1",
    ),
  };
}

export function validateMinimumWage(input: {
  monthlyWage?: number | null;
  hourlyWage?: number | null;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const issues: string[] = [];
  if (input.monthlyWage !== undefined && input.monthlyWage !== null && input.monthlyWage < config.minimumMonthlyWage) {
    issues.push(`Monthly wage is below configured TW minimum wage ${config.minimumMonthlyWage}.`);
  }
  if (input.hourlyWage !== undefined && input.hourlyWage !== null && input.hourlyWage < config.minimumHourlyWage) {
    issues.push(`Hourly wage is below configured TW minimum wage ${config.minimumHourlyWage}.`);
  }
  return {
    passed: issues.length === 0,
    issues,
    sources: config.sources.filter((source) => source.id === "tw-minimum-wage-2026"),
  };
}

export function validateWorkingTime(input: {
  regularMinutes: number;
  overtimeMinutes: number;
  weeklyRegularMinutes: number;
  monthlyOvertimeMinutes?: number;
  threeMonthOvertimeMinutes?: number;
  laborManagementAgreement?: boolean;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const issues: string[] = [];
  if (input.regularMinutes > config.normalDailyMinutes) {
    issues.push(`Regular daily work exceeds configured ${config.normalDailyMinutes / 60} hours.`);
  }
  if (input.weeklyRegularMinutes > config.normalWeeklyMinutes) {
    issues.push(`Regular weekly work exceeds configured ${config.normalWeeklyMinutes / 60} hours.`);
  }
  if (input.regularMinutes + input.overtimeMinutes > config.maxDailyWorkMinutesIncludingOvertime) {
    issues.push(`Daily work including overtime exceeds configured ${config.maxDailyWorkMinutesIncludingOvertime / 60} hours.`);
  }
  const monthlyLimit = input.laborManagementAgreement
    ? config.maxMonthlyOvertimeMinutesWithAgreement
    : config.maxMonthlyOvertimeMinutes;
  if (input.monthlyOvertimeMinutes !== undefined && input.monthlyOvertimeMinutes > monthlyLimit) {
    issues.push(`Monthly overtime exceeds configured ${monthlyLimit / 60} hours.`);
  }
  if (
    input.laborManagementAgreement &&
    input.threeMonthOvertimeMinutes !== undefined &&
    input.threeMonthOvertimeMinutes > config.maxThreeMonthOvertimeMinutesWithAgreement
  ) {
    issues.push(`Three-month overtime exceeds configured ${config.maxThreeMonthOvertimeMinutesWithAgreement / 60} hours.`);
  }
  return {
    passed: issues.length === 0,
    issues,
    sources: config.sources.filter((source) =>
      source.id === "tw-lsa-article-30" || source.id === "tw-lsa-article-24" || source.id === "tw-lsa-article-36",
    ),
  };
}

export function validateRestDayCycle(input: {
  days: Array<{ date: string; dayType: "workday" | "regular_leave" | "rest_day" | "holiday" }>;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const issues: string[] = [];
  for (let index = 0; index + config.restDayCycleDays <= input.days.length; index += 1) {
    const cycle = input.days.slice(index, index + config.restDayCycleDays);
    const regularLeaveCount = cycle.filter((day) => day.dayType === "regular_leave").length;
    const restDayCount = cycle.filter((day) => day.dayType === "rest_day").length;
    if (regularLeaveCount < config.requiredRegularLeaveDaysPerCycle) {
      issues.push(`${cycle[0]?.date} cycle has fewer than ${config.requiredRegularLeaveDaysPerCycle} regular leave day(s).`);
    }
    if (restDayCount < config.requiredRestDaysPerCycle) {
      issues.push(`${cycle[0]?.date} cycle has fewer than ${config.requiredRestDaysPerCycle} rest day(s).`);
    }
  }
  return {
    passed: issues.length === 0,
    issues,
    sources: config.sources.filter((source) => source.id === "tw-lsa-article-36"),
  };
}

export function calculateTaiwanStatutoryPayroll(input: {
  monthlyWage: number;
  bonusAmount?: number;
  dependents?: number;
  taxResidency?: "resident" | "non_resident";
  laborInsuranceMonthlyWage?: number | null;
  healthInsuranceMonthlyWage?: number | null;
  laborPensionMonthlyWage?: number | null;
  nonResidentWithholdingRate?: number | null;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const settings = config.statutoryPayroll;
  const laborInsuranceGrade = selectInsuranceSalaryGrade(
    input.laborInsuranceMonthlyWage ?? input.monthlyWage,
    settings.laborInsuranceSalaryGrades,
  );
  const healthInsuranceGrade = selectInsuranceSalaryGrade(
    input.healthInsuranceMonthlyWage ?? input.monthlyWage,
    settings.healthInsuranceSalaryGrades,
  );
  const laborPensionGrade = selectInsuranceSalaryGrade(
    input.laborPensionMonthlyWage ?? input.monthlyWage,
    settings.laborPensionContributionGrades,
  );
  const dependents = Math.max(
    0,
    Math.min(input.dependents ?? 0, settings.nationalHealthInsuranceDependentLimit),
  );
  const laborInsuranceEmployeePremium = roundMoney(
    laborInsuranceGrade.insuredSalary * settings.laborInsuranceEmployeeRate,
  );
  const laborInsuranceEmployerPremium = roundMoney(
    laborInsuranceGrade.insuredSalary *
      (settings.laborInsuranceEmployeeRate / 0.2) *
      settings.laborInsuranceEmployerShare,
  );
  const nationalHealthInsuranceEmployeePremium = roundMoney(
    healthInsuranceGrade.insuredSalary *
      settings.nationalHealthInsuranceRate *
      settings.nationalHealthInsuranceEmployeeShare *
      (1 + dependents),
  );
  const nationalHealthInsuranceEmployerPremium = roundMoney(
    healthInsuranceGrade.insuredSalary *
      settings.nationalHealthInsuranceRate *
      settings.nationalHealthInsuranceEmployerShare *
      (1 + settings.nationalHealthInsuranceAverageDependentCount),
  );
  const incomeTaxWithholding = calculateIncomeTaxWithholding({
    monthlyTaxablePay: input.monthlyWage,
    taxResidency: input.taxResidency,
    nonResidentWithholdingRate: input.nonResidentWithholdingRate,
    config,
  });
  const laborPensionEmployerContribution = roundMoney(
    laborPensionGrade.insuredSalary * settings.laborPensionEmployerContributionRate,
  );
  const occupationalAccidentInsuranceEmployerPremium = roundMoney(
    laborInsuranceGrade.insuredSalary *
      (settings.occupationalAccidentIndustryRate + settings.occupationalAccidentCommuteRate),
  );
  const supplementaryPremium = calculateNationalHealthInsuranceSupplementaryPremium({
    bonusAmount: input.bonusAmount ?? 0,
    insuredSalary: healthInsuranceGrade.insuredSalary,
    config,
  });

  return {
    employeeDeductions: [
      {
        code: "tw_labor_insurance_employee",
        name: "Labor insurance employee premium",
        amount: laborInsuranceEmployeePremium,
        metadata: { insuredSalary: laborInsuranceGrade.insuredSalary, gradeLevel: laborInsuranceGrade.level },
      },
      {
        code: "tw_nhi_employee",
        name: "National health insurance employee premium",
        amount: nationalHealthInsuranceEmployeePremium,
        metadata: {
          dependents,
          insuredSalary: healthInsuranceGrade.insuredSalary,
          gradeLevel: healthInsuranceGrade.level,
        },
      },
      {
        code: "tw_income_tax_withholding",
        name: "Income tax withholding",
        amount: incomeTaxWithholding.amount,
        metadata: {
          annualizedTaxableIncome: incomeTaxWithholding.annualizedTaxableIncome,
          annualTax: incomeTaxWithholding.annualTax,
          bracketRate: incomeTaxWithholding.bracket?.rate ?? null,
          progressiveDifference: incomeTaxWithholding.bracket?.progressiveDifference ?? null,
          requiresReview: incomeTaxWithholding.requiresReview,
        },
      },
      {
        code: "tw_nhi_supplementary_employee",
        name: "National health insurance supplementary premium",
        amount: supplementaryPremium.amount,
        metadata: {
          bonusAmount: supplementaryPremium.bonusAmount,
          chargeableAmount: supplementaryPremium.chargeableAmount,
          thresholdAmount: supplementaryPremium.thresholdAmount,
          insuredSalary: supplementaryPremium.insuredSalary,
          rate: supplementaryPremium.rate,
          requiresReview: supplementaryPremium.requiresReview,
        },
      },
    ].filter((item) => item.amount > 0),
    employerContributions: [
      {
        code: "tw_labor_insurance_employer",
        name: "Labor insurance employer premium",
        amount: laborInsuranceEmployerPremium,
        metadata: { insuredSalary: laborInsuranceGrade.insuredSalary, gradeLevel: laborInsuranceGrade.level },
      },
      {
        code: "tw_nhi_employer",
        name: "National health insurance employer premium",
        amount: nationalHealthInsuranceEmployerPremium,
        metadata: {
          insuredSalary: healthInsuranceGrade.insuredSalary,
          gradeLevel: healthInsuranceGrade.level,
          averageDependentCount: settings.nationalHealthInsuranceAverageDependentCount,
        },
      },
      {
        code: "tw_occupational_accident_insurance_employer",
        name: "Occupational accident insurance employer premium",
        amount: occupationalAccidentInsuranceEmployerPremium,
        metadata: {
          insuredSalary: laborInsuranceGrade.insuredSalary,
          gradeLevel: laborInsuranceGrade.level,
          industryRate: settings.occupationalAccidentIndustryRate,
          commuteRate: settings.occupationalAccidentCommuteRate,
        },
      },
      {
        code: "tw_labor_pension_employer",
        name: "Labor pension employer contribution",
        amount: laborPensionEmployerContribution,
        metadata: { insuredSalary: laborPensionGrade.insuredSalary, gradeLevel: laborPensionGrade.level },
      },
    ].filter((item) => item.amount > 0),
    sources: config.sources.filter((source) =>
      [
        "tw-nhi-premium-2026",
        "tw-nhi-supplementary-premium-2026",
        "tw-labor-insurance-grades-2026",
        "tw-occupational-accident-insurance-2026",
        "tw-income-tax-brackets-2026",
      ].includes(source.id),
    ),
  };
}

export function calculateNationalHealthInsuranceSupplementaryPremium(input: {
  bonusAmount: number;
  insuredSalary: number;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const settings = config.statutoryPayroll;
  const bonusAmount = Math.max(0, input.bonusAmount);
  const insuredSalary = Math.max(0, input.insuredSalary);
  const thresholdAmount = roundMoney(
    insuredSalary * settings.nationalHealthInsuranceSupplementaryBonusThresholdMultiplier,
  );
  const chargeableAmount = settings.nationalHealthInsuranceSupplementaryPremiumEnabled
    ? Math.max(0, bonusAmount - thresholdAmount)
    : 0;
  const amount = roundMoney(chargeableAmount * settings.nationalHealthInsuranceSupplementaryPremiumRate);
  return {
    amount,
    bonusAmount,
    chargeableAmount,
    thresholdAmount,
    insuredSalary,
    rate: settings.nationalHealthInsuranceSupplementaryPremiumRate,
    thresholdMultiplier: settings.nationalHealthInsuranceSupplementaryBonusThresholdMultiplier,
    requiresReview: amount > 0,
    sources: config.sources.filter((source) => source.id === "tw-nhi-supplementary-premium-2026"),
  };
}

export function calculateIncomeTaxWithholding(input: {
  monthlyTaxablePay: number;
  taxResidency?: "resident" | "non_resident";
  nonResidentWithholdingRate?: number | null;
  config?: TaiwanLaborStandardsConfig;
}) {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const settings = config.statutoryPayroll.incomeTaxWithholding;
  if (input.taxResidency === "non_resident") {
    const rate = input.nonResidentWithholdingRate ?? config.statutoryPayroll.nonResidentIncomeTaxWithholdingRate;
    const amount = roundMoney(input.monthlyTaxablePay * rate);
    return {
      amount,
      annualGrossPay: input.monthlyTaxablePay * settings.monthsPerYear,
      annualizedTaxableIncome: input.monthlyTaxablePay * settings.monthsPerYear,
      annualTax: amount * settings.monthsPerYear,
      bracket: null,
      requiresReview: true,
      method: "non_resident_flat" as const,
      sources: config.sources.filter((source) => source.id === "tw-income-tax-brackets-2026"),
    };
  }
  const annualGrossPay = input.monthlyTaxablePay * settings.monthsPerYear;
  const annualizedTaxableIncome = Math.max(
    0,
    annualGrossPay -
      settings.monthlyExemptionAmount * settings.monthsPerYear -
      settings.monthlyStandardDeductionAmount * settings.monthsPerYear -
      settings.annualSalarySpecialDeductionAmount,
  );
  const bracket = selectIncomeTaxBracket(annualizedTaxableIncome, settings.brackets);
  const annualTax = bracket
    ? Math.max(0, roundMoney(annualizedTaxableIncome * bracket.rate - bracket.progressiveDifference))
    : 0;
  const monthlyWithholding = roundMoney(annualTax / settings.monthsPerYear);
  const amount = monthlyWithholding < settings.minimumMonthlyWithholding ? 0 : monthlyWithholding;

  return {
    amount,
    annualGrossPay,
    annualizedTaxableIncome,
    annualTax,
    bracket,
    requiresReview: amount > 0,
    method: "annualized_progressive" as const,
    sources: config.sources.filter((source) => source.id === "tw-income-tax-brackets-2026"),
  };
}

export function selectIncomeTaxBracket(annualizedTaxableIncome: number, brackets: IncomeTaxBracket[]) {
  const sortedBrackets = [...brackets].sort((a, b) => a.taxableIncomeFrom - b.taxableIncomeFrom);
  return sortedBrackets.find((bracket) => {
    const lowerBoundMatches = annualizedTaxableIncome >= bracket.taxableIncomeFrom;
    const upperBoundMatches =
      bracket.taxableIncomeTo === null || annualizedTaxableIncome <= bracket.taxableIncomeTo;
    return lowerBoundMatches && upperBoundMatches;
  }) ?? null;
}

export function selectInsuranceSalaryGrade(monthlyWage: number, grades: InsuranceSalaryGrade[]) {
  const sortedGrades = [...grades].sort((a, b) => a.level - b.level);
  const matchedGrade = sortedGrades.find((grade) => {
    const lowerBoundMatches = monthlyWage >= grade.salaryFrom;
    const upperBoundMatches = grade.salaryTo === null || monthlyWage <= grade.salaryTo;
    return lowerBoundMatches && upperBoundMatches;
  });
  return matchedGrade ?? sortedGrades.at(-1) ?? {
    level: 1,
    insuredSalary: monthlyWage,
    salaryFrom: 0,
    salaryTo: null,
  };
}

function article38Sources(config: TaiwanLaborStandardsConfig) {
  return config.sources.filter((source) => source.id === "tw-lsa-article-38");
}

function buildLaborInsuranceGrades2026(): InsuranceSalaryGrade[] {
  return [
    grade(1, 29500, 0, 29500),
    grade(2, 30300, 29501, 30300),
    grade(3, 31800, 30301, 31800),
    grade(4, 33300, 31801, 33300),
    grade(5, 34800, 33301, 34800),
    grade(6, 36300, 34801, 36300),
    grade(7, 38200, 36301, 38200),
    grade(8, 40100, 38201, 40100),
    grade(9, 42000, 40101, 42000),
    grade(10, 43900, 42001, 43900),
    grade(11, 45800, 43901, null),
  ];
}

function buildHealthInsuranceGrades2026Sample(): InsuranceSalaryGrade[] {
  return [
    grade(1, 29500, 0, 29500),
    grade(2, 30300, 29501, 30300),
    grade(3, 31800, 30301, 31800),
    grade(4, 33300, 31801, 33300),
    grade(5, 34800, 33301, 34800),
    grade(6, 36300, 34801, 36300),
    grade(7, 38200, 36301, 38200),
    grade(8, 40100, 38201, 40100),
    grade(9, 42000, 40101, 42000),
    grade(10, 43900, 42001, 43900),
    grade(11, 45800, 43901, 45800),
    grade(12, 48200, 45801, 48200),
    grade(13, 50600, 48201, 50600),
    grade(14, 53000, 50601, 53000),
    grade(15, 55400, 53001, 55400),
    grade(16, 57800, 55401, 57800),
    grade(17, 60800, 57801, 60800),
    grade(18, 63800, 60801, 63800),
    grade(19, 66800, 63801, 66800),
    grade(20, 69800, 66801, 69800),
    grade(21, 72800, 69801, 72800),
    grade(22, 76500, 72801, 76500),
    grade(23, 80200, 76501, 80200),
    grade(24, 83900, 80201, 83900),
    grade(25, 87600, 83901, 87600),
    grade(26, 92100, 87601, 92100),
    grade(27, 96600, 92101, 96600),
    grade(28, 101100, 96601, 101100),
    grade(29, 105600, 101101, 105600),
    grade(30, 110100, 105601, 110100),
    grade(31, 115500, 110101, 115500),
    grade(32, 120900, 115501, 120900),
    grade(33, 126300, 120901, 126300),
    grade(34, 131700, 126301, 131700),
    grade(35, 137100, 131701, 137100),
    grade(36, 142500, 137101, 142500),
    grade(37, 147900, 142501, 147900),
    grade(38, 150000, 147901, null),
  ];
}

function buildResidentIncomeTaxBrackets2026(): IncomeTaxBracket[] {
  return [
    taxBracket(0, 610000, 0.05, 0),
    taxBracket(610001, 1380000, 0.12, 42700),
    taxBracket(1380001, 2770000, 0.2, 153100),
    taxBracket(2770001, 5190000, 0.3, 430100),
    taxBracket(5190001, null, 0.4, 949100),
  ];
}

function taxBracket(
  taxableIncomeFrom: number,
  taxableIncomeTo: number | null,
  rate: number,
  progressiveDifference: number,
) {
  return { taxableIncomeFrom, taxableIncomeTo, rate, progressiveDifference };
}

function grade(level: number, insuredSalary: number, salaryFrom: number, salaryTo: number | null) {
  return { level, insuredSalary, salaryFrom, salaryTo };
}

function roundMoney(value: number) {
  return Math.round(value);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
