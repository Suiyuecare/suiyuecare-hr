import {
  defaultTaiwanLaborStandardsConfig,
  type TaiwanLaborStandardsConfig,
} from "@/server/rules/taiwan-labor-standards";

export type TerminationReasonCategory =
  | "resignation"
  | "layoff"
  | "misconduct"
  | "retirement"
  | "contract_end"
  | "other";

export type PensionScheme = "labor_pension_new" | "labor_standards_old";

export type TerminationComplianceInput = {
  hireDate: Date;
  effectiveDate: Date;
  reasonCategory: TerminationReasonCategory;
  pensionScheme?: PensionScheme | null;
  averageMonthlyWage?: number | null;
  config?: TaiwanLaborStandardsConfig;
};

export type TerminationComplianceSnapshot = {
  appliesStatutorySeverance: boolean;
  reasonCategory: TerminationReasonCategory;
  pensionScheme: PensionScheme;
  serviceDays: number;
  serviceMonths: number;
  serviceYears: number;
  requiredAdvanceNoticeDays: number;
  severancePayEstimate: number | null;
  severancePayMonths: number | null;
  averageMonthlyWageProvided: boolean;
  requiresHumanReview: true;
  warnings: string[];
  sources: Array<{ id: string; title: string; url: string; checkedAt: string }>;
};

const statutorySeveranceReasons: TerminationReasonCategory[] = ["layoff"];

export function calculateTerminationCompliance(
  input: TerminationComplianceInput,
): TerminationComplianceSnapshot {
  const config = input.config ?? defaultTaiwanLaborStandardsConfig;
  const serviceDays = Math.max(0, differenceInDays(input.hireDate, input.effectiveDate));
  const serviceMonths = Math.floor(serviceDays / 30.4375);
  const serviceYears = serviceDays / 365;
  const pensionScheme = input.pensionScheme ?? "labor_pension_new";
  const appliesStatutorySeverance = statutorySeveranceReasons.includes(input.reasonCategory);
  const requiredAdvanceNoticeDays = appliesStatutorySeverance
    ? calculateAdvanceNoticeDays(serviceMonths, config)
    : 0;
  const averageMonthlyWage = normalizeMoney(input.averageMonthlyWage);
  const severancePayMonths = appliesStatutorySeverance
    ? calculateSeverancePayMonths({ serviceDays, serviceYears, pensionScheme, config })
    : 0;
  const severancePayEstimate =
    appliesStatutorySeverance && averageMonthlyWage !== null
      ? roundMoney(averageMonthlyWage * severancePayMonths)
      : null;
  const warnings: string[] = [];
  if (appliesStatutorySeverance && averageMonthlyWage === null) {
    warnings.push("Average monthly wage is required before HR can confirm statutory severance.");
  }
  if (input.effectiveDate < input.hireDate) {
    warnings.push("Termination effective date is before hire date.");
  }
  if (input.reasonCategory === "other") {
    warnings.push("Termination reason category must be reviewed by HR/legal before final processing.");
  }

  return {
    appliesStatutorySeverance,
    reasonCategory: input.reasonCategory,
    pensionScheme,
    serviceDays,
    serviceMonths,
    serviceYears: roundDecimal(serviceYears, 4),
    requiredAdvanceNoticeDays,
    severancePayEstimate,
    severancePayMonths: appliesStatutorySeverance ? roundDecimal(severancePayMonths, 4) : null,
    averageMonthlyWageProvided: averageMonthlyWage !== null,
    requiresHumanReview: true,
    warnings,
    sources: config.sources.filter((source) =>
      source.id === "tw-lsa-article-16-17" || source.id === "tw-labor-pension-act-article-12",
    ),
  };
}

function calculateAdvanceNoticeDays(serviceMonths: number, config: TaiwanLaborStandardsConfig) {
  const tier = config.terminationCompliance.advanceNoticeTiers.find((candidate) =>
    serviceMonths >= candidate.serviceMonthsFrom &&
    (candidate.serviceMonthsTo === null || serviceMonths < candidate.serviceMonthsTo),
  );
  return tier?.noticeDays ?? 0;
}

function calculateSeverancePayMonths(input: {
  serviceDays: number;
  serviceYears: number;
  pensionScheme: PensionScheme;
  config: TaiwanLaborStandardsConfig;
}) {
  if (input.pensionScheme === "labor_standards_old") {
    const oldServiceMonths = Math.max(1, Math.ceil(input.serviceDays / 30.4375));
    return oldServiceMonths * (input.config.terminationCompliance.laborStandardsSeveranceMultiplierPerServiceYear / 12);
  }
  return Math.min(
    input.config.terminationCompliance.laborPensionSeveranceMaxAverageWageMonths,
    input.serviceYears * input.config.terminationCompliance.laborPensionSeveranceMultiplierPerServiceYear,
  );
}

function differenceInDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUtc - startUtc) / 86_400_000);
}

function normalizeMoney(value?: number | null) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function roundMoney(value: number) {
  return Math.round(value);
}

function roundDecimal(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
