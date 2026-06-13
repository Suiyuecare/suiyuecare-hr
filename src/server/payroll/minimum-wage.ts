import {
  defaultTaiwanLaborStandardsConfig,
  validateMinimumWage,
  type TaiwanLaborStandardsConfig,
} from "@/server/rules/taiwan-labor-standards";

export type SalaryProfileMinimumWageInput = {
  employeeId: string;
  employeeNo?: string;
  employeeName?: string;
  baseSalary: number;
  hourlyWage?: number | null;
};

export type MinimumWageViolation = {
  employeeId: string;
  employeeNo?: string;
  employeeName?: string;
  type: "monthly" | "hourly";
  requiredMinimum: number;
  message: string;
};

export type MinimumWageComplianceReport = {
  ready: boolean;
  checkedCount: number;
  monthlyViolationCount: number;
  hourlyViolationCount: number;
  violations: MinimumWageViolation[];
  detail: string;
};

export function evaluateSalaryProfileMinimumWageCompliance(
  profiles: SalaryProfileMinimumWageInput[],
  config: TaiwanLaborStandardsConfig = defaultTaiwanLaborStandardsConfig,
): MinimumWageComplianceReport {
  const violations = profiles.flatMap((profile) => {
    const validation = validateMinimumWage({
      monthlyWage: profile.baseSalary,
      hourlyWage: profile.hourlyWage,
      config,
    });
    if (validation.passed) return [];

    const next: MinimumWageViolation[] = [];
    if (profile.baseSalary < config.minimumMonthlyWage) {
      next.push({
        employeeId: profile.employeeId,
        employeeNo: profile.employeeNo,
        employeeName: profile.employeeName,
        type: "monthly",
        requiredMinimum: config.minimumMonthlyWage,
        message: "Monthly base salary is below the configured Taiwan minimum wage.",
      });
    }
    if (profile.hourlyWage !== undefined && profile.hourlyWage !== null && profile.hourlyWage < config.minimumHourlyWage) {
      next.push({
        employeeId: profile.employeeId,
        employeeNo: profile.employeeNo,
        employeeName: profile.employeeName,
        type: "hourly",
        requiredMinimum: config.minimumHourlyWage,
        message: "Hourly wage is below the configured Taiwan minimum wage.",
      });
    }
    return next;
  });

  const monthlyViolationCount = violations.filter((violation) => violation.type === "monthly").length;
  const hourlyViolationCount = violations.filter((violation) => violation.type === "hourly").length;

  return {
    ready: violations.length === 0,
    checkedCount: profiles.length,
    monthlyViolationCount,
    hourlyViolationCount,
    violations,
    detail:
      violations.length === 0
        ? `${profiles.length} salary profile(s) checked; no configured Taiwan minimum wage violations.`
        : `${profiles.length} salary profile(s) checked; ${monthlyViolationCount} monthly and ${hourlyViolationCount} hourly minimum wage violation(s).`,
  };
}
