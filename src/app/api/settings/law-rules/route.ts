import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateTaiwanLaborStandardsConfig } from "@/server/rules/settings";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = normalizeLawRulesReturnTo(parseText(formData.get("returnTo")));
  try {
    await updateTaiwanLaborStandardsConfig(await requireTenantSession({ permission: "settings:write" }), {
      changeControl: {
        reason: parseText(formData.get("changeReason")),
        sourceUrl: parseText(formData.get("changeSourceUrl")),
        reviewedBy: parseText(formData.get("reviewedBy")),
        reviewStatus: formData.get("reviewStatus") === "approved" ? "approved" : "pending_legal_review",
        requiresPayrollRecalculation: formData.get("requiresPayrollRecalculation") === "on",
      },
      minimumMonthlyWage: parseNumber(formData.get("minimumMonthlyWage")),
      minimumHourlyWage: parseNumber(formData.get("minimumHourlyWage")),
      payrollStandardMonthlyHours: parseNumber(formData.get("payrollStandardMonthlyHours")),
      holidayWorkMultiplier: parseNumber(formData.get("holidayWorkMultiplier")),
      regularLeaveWorkMultiplier: parseNumber(formData.get("regularLeaveWorkMultiplier")),
      emergencyOvertimeMultiplier: parseNumber(formData.get("emergencyOvertimeMultiplier")),
      maxDailyWorkMinutesIncludingOvertime: parseHoursToMinutes(formData.get("maxDailyWorkHoursIncludingOvertime")),
      maxMonthlyOvertimeMinutes: parseHoursToMinutes(formData.get("maxMonthlyOvertimeHours")),
      maxMonthlyOvertimeMinutesWithAgreement: parseHoursToMinutes(formData.get("maxMonthlyOvertimeHoursWithAgreement")),
      maxThreeMonthOvertimeMinutesWithAgreement: parseHoursToMinutes(
        formData.get("maxThreeMonthOvertimeHoursWithAgreement"),
      ),
      restDayCycleDays: parseNumber(formData.get("restDayCycleDays")),
      requiredRegularLeaveDaysPerCycle: parseNumber(formData.get("requiredRegularLeaveDaysPerCycle")),
      requiredRestDaysPerCycle: parseNumber(formData.get("requiredRestDaysPerCycle")),
      sources: parseLegalSourcesCsv(formData.get("legalSourcesCsv")),
      terminationCompliance: {
        advanceNoticeTiers: parseAdvanceNoticeTiersCsv(formData.get("terminationAdvanceNoticeTiersCsv")),
        laborPensionSeveranceMultiplierPerServiceYear: parseNumber(
          formData.get("laborPensionSeveranceMultiplierPerServiceYear"),
        ),
        laborPensionSeveranceMaxAverageWageMonths: parseNumber(
          formData.get("laborPensionSeveranceMaxAverageWageMonths"),
        ),
        laborStandardsSeveranceMultiplierPerServiceYear: parseNumber(
          formData.get("laborStandardsSeveranceMultiplierPerServiceYear"),
        ),
      },
      statutoryOnboarding: {
        laborInsuranceEnrollmentDueDaysFromHire: parseNumber(
          formData.get("laborInsuranceEnrollmentDueDaysFromHire"),
        ),
        employmentInsuranceEnrollmentDueDaysFromHire: parseNumber(
          formData.get("employmentInsuranceEnrollmentDueDaysFromHire"),
        ),
        occupationalAccidentInsuranceEnrollmentDueDaysFromHire: parseNumber(
          formData.get("occupationalAccidentInsuranceEnrollmentDueDaysFromHire"),
        ),
        insuranceWithdrawalDueDaysFromTermination: parseNumber(
          formData.get("insuranceWithdrawalDueDaysFromTermination"),
        ),
      },
      statutoryPayroll: {
        laborInsuranceEmployeeRate: parsePercent(formData.get("laborInsuranceEmployeeRate")),
        laborInsuranceEmployerShare: parsePercent(formData.get("laborInsuranceEmployerShare")),
        nationalHealthInsuranceRate: parsePercent(formData.get("nationalHealthInsuranceRate")),
        nationalHealthInsuranceEmployeeShare: parsePercent(formData.get("nationalHealthInsuranceEmployeeShare")),
        nationalHealthInsuranceEmployerShare: parsePercent(formData.get("nationalHealthInsuranceEmployerShare")),
        nationalHealthInsuranceAverageDependentCount: parseNumber(
          formData.get("nationalHealthInsuranceAverageDependentCount"),
        ),
        nationalHealthInsuranceDependentLimit: parseNumber(formData.get("nationalHealthInsuranceDependentLimit")),
        nationalHealthInsuranceSupplementaryPremiumEnabled:
          formData.get("nationalHealthInsuranceSupplementaryPremiumEnabled") === "on",
        nationalHealthInsuranceSupplementaryPremiumRate: parsePercent(
          formData.get("nationalHealthInsuranceSupplementaryPremiumRate"),
        ),
        nationalHealthInsuranceSupplementaryBonusThresholdMultiplier: parseNumber(
          formData.get("nationalHealthInsuranceSupplementaryBonusThresholdMultiplier"),
        ),
        occupationalAccidentIndustryRate: parsePercent(formData.get("occupationalAccidentIndustryRate")),
        occupationalAccidentCommuteRate: parsePercent(formData.get("occupationalAccidentCommuteRate")),
        laborPensionEmployerContributionRate: parsePercent(formData.get("laborPensionEmployerContributionRate")),
        incomeTaxWithholdingRate: parsePercent(formData.get("incomeTaxWithholdingRate")),
        incomeTaxWithholding: {
          monthsPerYear: parseNumber(formData.get("incomeTaxWithholdingMonthsPerYear")),
          monthlyExemptionAmount: parseNumber(formData.get("monthlyExemptionAmount")),
          monthlyStandardDeductionAmount: parseNumber(formData.get("monthlyStandardDeductionAmount")),
          annualSalarySpecialDeductionAmount: parseNumber(formData.get("annualSalarySpecialDeductionAmount")),
          minimumMonthlyWithholding: parseNumber(formData.get("minimumMonthlyWithholding")),
          brackets: parseIncomeTaxBracketsCsv(formData.get("incomeTaxBracketsCsv")),
        },
        laborInsuranceSalaryGrades: parseSalaryGradesCsv(formData.get("laborInsuranceSalaryGradesCsv")),
        healthInsuranceSalaryGrades: parseSalaryGradesCsv(formData.get("healthInsuranceSalaryGradesCsv")),
        laborPensionContributionGrades: parseSalaryGradesCsv(formData.get("laborPensionContributionGradesCsv")),
        statutoryFilingReports: parseStatutoryFilingReportsCsv(formData.get("statutoryFilingReportsCsv")),
      },
    });
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update law rules.";
    const url = new URL(returnTo, request.url);
    url.searchParams.delete("success");
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, 303);
  }
}

function normalizeLawRulesReturnTo(value: string | undefined) {
  const fallback = "/settings?success=law-rules#law-rules-setup";
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://hr-one.local");
    const allowed = new Set(["/settings", "/settings/law-rules"]);
    if (!allowed.has(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function parseText(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim();
}

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePercent(value: FormDataEntryValue | null) {
  const parsed = parseNumber(value);
  if (parsed === undefined) return undefined;
  return parsed / 100;
}

function parseHoursToMinutes(value: FormDataEntryValue | null) {
  const parsed = parseNumber(value);
  if (parsed === undefined) return undefined;
  return Math.round(parsed * 60);
}

function parseAdvanceNoticeTiersCsv(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const tiers = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serviceMonthsFrom, serviceMonthsTo, noticeDays] = line.split(",").map((part) => part.trim());
      return {
        serviceMonthsFrom: Number(serviceMonthsFrom),
        serviceMonthsTo: serviceMonthsTo ? Number(serviceMonthsTo) : null,
        noticeDays: Number(noticeDays),
      };
    })
    .filter((tier) => (
      Number.isInteger(tier.serviceMonthsFrom) &&
      tier.serviceMonthsFrom >= 0 &&
      (tier.serviceMonthsTo === null || (Number.isInteger(tier.serviceMonthsTo) && tier.serviceMonthsTo > tier.serviceMonthsFrom)) &&
      Number.isInteger(tier.noticeDays) &&
      tier.noticeDays >= 0
    ));
  return tiers.length > 0 ? tiers : undefined;
}

function parseSalaryGradesCsv(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const grades = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [level, insuredSalary, salaryFrom, salaryTo] = line.split(",").map((part) => part.trim());
      return {
        level: Number(level),
        insuredSalary: Number(insuredSalary),
        salaryFrom: Number(salaryFrom),
        salaryTo: salaryTo ? Number(salaryTo) : null,
      };
    })
    .filter((grade) => (
      Number.isInteger(grade.level) &&
      Number.isFinite(grade.insuredSalary) &&
      Number.isFinite(grade.salaryFrom) &&
      (grade.salaryTo === null || Number.isFinite(grade.salaryTo))
    ));
  return grades.length > 0 ? grades : undefined;
}

function parseIncomeTaxBracketsCsv(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const brackets = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [taxableIncomeFrom, taxableIncomeTo, ratePercent, progressiveDifference] =
        line.split(",").map((part) => part.trim());
      return {
        taxableIncomeFrom: Number(taxableIncomeFrom),
        taxableIncomeTo: taxableIncomeTo ? Number(taxableIncomeTo) : null,
        rate: Number(ratePercent) / 100,
        progressiveDifference: Number(progressiveDifference),
      };
    })
    .filter((bracket) => (
      Number.isFinite(bracket.taxableIncomeFrom) &&
      (bracket.taxableIncomeTo === null || Number.isFinite(bracket.taxableIncomeTo)) &&
      Number.isFinite(bracket.rate) &&
      bracket.rate >= 0 &&
      bracket.rate <= 1 &&
      Number.isFinite(bracket.progressiveDifference)
    ));
  return brackets.length > 0 ? brackets : undefined;
}

function parseLegalSourcesCsv(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const sources = value
    .split(/\r?\n/)
    .map((line) => parseCsvLine(line.trim()))
    .filter((parts) => parts.length >= 4)
    .map(([id, title, url, checkedAt]) => ({
      id,
      title,
      url,
      checkedAt,
    }))
    .filter((source) => (
      source.id.length > 0 &&
      source.title.length > 0 &&
      /^https?:\/\//.test(source.url) &&
      /^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)
    ));
  return sources.length > 0 ? sources : undefined;
}

function parseStatutoryFilingReportsCsv(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const reports = value
    .split(/\r?\n/)
    .map((line) => parseCsvLine(line.trim()))
    .filter((parts) => parts.length >= 3)
    .map(([report, authority, payrollItemCodes]) => ({
      report,
      authority,
      payrollItemCodes: payrollItemCodes
        .split("|")
        .map((code) => code.trim())
        .filter(Boolean),
    }))
    .filter((report) => (
      report.report.length > 0 &&
      report.authority.length > 0 &&
      report.payrollItemCodes.length > 0
    ));
  return reports.length > 0 ? reports : undefined;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}
