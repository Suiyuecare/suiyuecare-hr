import {
  defaultTaiwanLaborStandardsConfig,
  selectInsuranceSalaryGrade,
  type InsuranceSalaryGrade,
  type TaiwanLaborStandardsConfig,
} from "@/server/rules/taiwan-labor-standards";
import type { MoneyItem } from "./types";

export type PayrollInsuranceGradeInput = {
  employeeId: string;
  employeeNo?: string;
  employeeName?: string;
  baseSalary: number;
  recurringAllowances?: MoneyItem[];
  laborInsuranceMonthlyWage?: number | null;
  healthInsuranceMonthlyWage?: number | null;
  laborPensionMonthlyWage?: number | null;
};

export type InsuranceGradeRecommendation = {
  kind: "labor_insurance" | "health_insurance" | "labor_pension";
  recommendedInsuredSalary: number;
  recommendedLevel: number;
  overrideMonthlyWage: number | null;
  ready: boolean;
};

export type PayrollInsuranceGradeIssue = {
  employeeId: string;
  employeeNo?: string;
  employeeName?: string;
  kind: InsuranceGradeRecommendation["kind"];
  recommendedInsuredSalary: number;
  recommendedLevel: number;
  overrideMonthlyWage: number;
  message: string;
};

export type PayrollInsuranceGradeReadinessReport = {
  ready: boolean;
  checkedCount: number;
  issueCount: number;
  issues: PayrollInsuranceGradeIssue[];
  recommendations: Array<{
    employeeId: string;
    employeeNo?: string;
    employeeName?: string;
    monthlyRegularPay: number;
    items: InsuranceGradeRecommendation[];
  }>;
  detail: string;
};

export function evaluatePayrollInsuranceGradeReadiness(
  profiles: PayrollInsuranceGradeInput[],
  config: TaiwanLaborStandardsConfig = defaultTaiwanLaborStandardsConfig,
): PayrollInsuranceGradeReadinessReport {
  const recommendations = profiles.map((profile) => {
    const monthlyRegularPay = roundMoney(
      profile.baseSalary +
        (profile.recurringAllowances ?? []).reduce((total, item) => total + Number(item.amount || 0), 0),
    );
    const items = [
      recommendation(
        "labor_insurance",
        monthlyRegularPay,
        profile.laborInsuranceMonthlyWage,
        config.statutoryPayroll.laborInsuranceSalaryGrades,
      ),
      recommendation(
        "health_insurance",
        monthlyRegularPay,
        profile.healthInsuranceMonthlyWage,
        config.statutoryPayroll.healthInsuranceSalaryGrades,
      ),
      recommendation(
        "labor_pension",
        monthlyRegularPay,
        profile.laborPensionMonthlyWage,
        config.statutoryPayroll.laborPensionContributionGrades,
      ),
    ];
    return {
      employeeId: profile.employeeId,
      employeeNo: profile.employeeNo,
      employeeName: profile.employeeName,
      monthlyRegularPay,
      items,
    };
  });
  const issues = recommendations.flatMap((profile) =>
    profile.items
      .filter((item) => !item.ready && item.overrideMonthlyWage !== null)
      .map((item) => ({
        employeeId: profile.employeeId,
        employeeNo: profile.employeeNo,
        employeeName: profile.employeeName,
        kind: item.kind,
        recommendedInsuredSalary: item.recommendedInsuredSalary,
        recommendedLevel: item.recommendedLevel,
        overrideMonthlyWage: item.overrideMonthlyWage!,
        message: `${labelForKind(item.kind)} override is below the configured recommended insured salary grade.`,
      })),
  );

  return {
    ready: issues.length === 0,
    checkedCount: profiles.length,
    issueCount: issues.length,
    issues,
    recommendations,
    detail:
      issues.length === 0
        ? `${profiles.length} payroll compliance profile(s) checked; no under-insured wage override risk.`
        : `${profiles.length} payroll compliance profile(s) checked; ${issues.length} under-insured wage override risk(s).`,
  };
}

function recommendation(
  kind: InsuranceGradeRecommendation["kind"],
  monthlyRegularPay: number,
  overrideMonthlyWage: number | null | undefined,
  grades: InsuranceSalaryGrade[],
): InsuranceGradeRecommendation {
  const grade = selectInsuranceSalaryGrade(monthlyRegularPay, grades);
  const override = normalizeOptionalMoney(overrideMonthlyWage);
  return {
    kind,
    recommendedInsuredSalary: grade.insuredSalary,
    recommendedLevel: grade.level,
    overrideMonthlyWage: override,
    ready: override === null || override >= grade.insuredSalary,
  };
}

function labelForKind(kind: InsuranceGradeRecommendation["kind"]) {
  if (kind === "health_insurance") return "NHI insured wage";
  if (kind === "labor_pension") return "Labor pension contribution wage";
  return "Labor insurance wage";
}

function normalizeOptionalMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? roundMoney(parsed) : null;
}

function roundMoney(value: number) {
  return Math.round(value);
}
