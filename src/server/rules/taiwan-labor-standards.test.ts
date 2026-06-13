import { describe, expect, it } from "vitest";
import {
  calculateAnnualLeaveEntitlement,
  calculateHolidayWorkPay,
  calculateIncomeTaxWithholding,
  calculateRegularDayOvertimePay,
  calculateRestDayOvertimePay,
  calculateTaiwanStatutoryPayroll,
  calculateUnusedAnnualLeavePayout,
  defaultTaiwanLaborStandardsConfig,
  selectInsuranceSalaryGrade,
  validateMinimumWage,
  validateRestDayCycle,
  validateWorkingTime,
} from "./taiwan-labor-standards";

describe("Taiwan labor standards v1", () => {
  it("calculates regular-day overtime using Article 24 tiers", () => {
    const result = calculateRegularDayOvertimePay({
      hourlyWage: 300,
      overtimeMinutes: 180,
    });

    expect(result.total).toBe(1300);
    expect(result.buckets).toEqual([
      expect.objectContaining({
        minutes: 120,
        multiplier: 4 / 3,
        amount: 800,
      }),
      expect.objectContaining({
        minutes: 60,
        multiplier: 5 / 3,
        amount: 500,
      }),
    ]);
    expect(result.sources[0].id).toBe("tw-lsa-article-24");
  });

  it("calculates Article 38 annual leave entitlement tiers", () => {
    expect(calculateAnnualLeaveEntitlement({ serviceMonths: 5 }).days).toBe(0);
    expect(calculateAnnualLeaveEntitlement({ serviceMonths: 6 }).days).toBe(3);
    expect(calculateAnnualLeaveEntitlement({ serviceMonths: 12 }).days).toBe(7);
    expect(calculateAnnualLeaveEntitlement({ serviceMonths: 36 }).days).toBe(14);
    expect(calculateAnnualLeaveEntitlement({ serviceMonths: 132 }).days).toBe(16);
    expect(calculateAnnualLeaveEntitlement({ serviceMonths: 360 }).days).toBe(30);
  });

  it("calculates unused annual leave payout using Article 38 and Enforcement Rule 24-1", () => {
    const result = calculateUnusedAnnualLeavePayout({
      unusedDays: 3.5,
      monthlyRegularWage: 60000,
      reason: "year_end",
      carriedFromPreviousYear: true,
    });

    expect(result).toMatchObject({
      amount: 7000,
      dailyWage: 2000,
      unusedDays: 3.5,
      reason: "year_end",
      carriedFromPreviousYear: true,
    });
    expect(result.sources.map((source) => source.id)).toEqual([
      "tw-lsa-article-38",
      "tw-lsa-enforcement-article-24-1",
    ]);
  });

  it("calculates rest day and holiday work using configurable Article 24/39 multipliers", () => {
    const restDay = calculateRestDayOvertimePay({
      hourlyWage: 300,
      workMinutes: 180,
    });
    const holiday = calculateHolidayWorkPay({
      hourlyWage: 300,
      workMinutes: 480,
      holidayType: "national_holiday",
    });

    expect(restDay.total).toBe(1300);
    expect(restDay.sources.map((source) => source.id)).toEqual(["tw-lsa-article-24", "tw-lsa-article-36"]);
    expect(holiday).toMatchObject({
      total: 4800,
      multiplier: 2,
    });
    expect(holiday.sources.map((source) => source.id)).toEqual(["tw-lsa-article-37", "tw-lsa-article-39"]);
  });

  it("validates 2026 minimum wage defaults", () => {
    expect(
      validateMinimumWage({
        monthlyWage: defaultTaiwanLaborStandardsConfig.minimumMonthlyWage,
        hourlyWage: defaultTaiwanLaborStandardsConfig.minimumHourlyWage,
      }).passed,
    ).toBe(true);

    const result = validateMinimumWage({ monthlyWage: 29_000, hourlyWage: 190 });
    expect(result.passed).toBe(false);
    expect(result.sources[0].id).toBe("tw-minimum-wage-2026");
  });

  it("calculates configurable statutory payroll deductions with source references", () => {
    const result = calculateTaiwanStatutoryPayroll({
      monthlyWage: 60000,
      dependents: 1,
    });

    expect(result.employeeDeductions).toEqual([
      expect.objectContaining({
        code: "tw_labor_insurance_employee",
        amount: 1099,
        metadata: { insuredSalary: 45800, gradeLevel: 11 },
      }),
      expect.objectContaining({
        code: "tw_nhi_employee",
        amount: 1886,
        metadata: { dependents: 1, insuredSalary: 60800, gradeLevel: 17 },
      }),
      expect.objectContaining({
        code: "tw_income_tax_withholding",
        amount: 1875,
        metadata: expect.objectContaining({
          annualizedTaxableIncome: 450000,
          bracketRate: 0.05,
          requiresReview: true,
        }),
      }),
    ]);
    expect(result.employerContributions).toEqual([
      expect.objectContaining({
        code: "tw_labor_insurance_employer",
        amount: 3847,
        metadata: { insuredSalary: 45800, gradeLevel: 11 },
      }),
      expect.objectContaining({
        code: "tw_nhi_employer",
        amount: 2942,
        metadata: { averageDependentCount: 0.56, insuredSalary: 60800, gradeLevel: 17 },
      }),
      expect.objectContaining({
        code: "tw_occupational_accident_insurance_employer",
        amount: 128,
        metadata: { insuredSalary: 45800, gradeLevel: 11, industryRate: 0.0021, commuteRate: 0.0007 },
      }),
      expect.objectContaining({
        code: "tw_labor_pension_employer",
        amount: 2748,
        metadata: { insuredSalary: 45800, gradeLevel: 11 },
      }),
    ]);
    expect(result.sources.map((source) => source.id)).toEqual([
      "tw-nhi-premium-2026",
      "tw-labor-insurance-grades-2026",
      "tw-occupational-accident-insurance-2026",
      "tw-income-tax-brackets-2026",
    ]);
  });

  it("estimates resident income tax withholding with 2026 progressive brackets", () => {
    const result = calculateIncomeTaxWithholding({ monthlyTaxablePay: 62000 });

    expect(result).toMatchObject({
      amount: 1975,
      annualizedTaxableIncome: 474000,
      annualTax: 23700,
      requiresReview: true,
      bracket: expect.objectContaining({
        rate: 0.05,
        progressiveDifference: 0,
      }),
    });
    expect(result.sources[0].id).toBe("tw-income-tax-brackets-2026");
  });

  it("selects the configured insurance salary grade for monthly wages", () => {
    const grade = selectInsuranceSalaryGrade(
      62000,
      defaultTaiwanLaborStandardsConfig.statutoryPayroll.healthInsuranceSalaryGrades,
    );

    expect(grade).toMatchObject({
      level: 18,
      insuredSalary: 63800,
      salaryFrom: 60801,
      salaryTo: 63800,
    });
  });

  it("flags working time issues against configurable limits", () => {
    const result = validateWorkingTime({
      regularMinutes: 9 * 60,
      overtimeMinutes: 300,
      weeklyRegularMinutes: 41 * 60,
    });

    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(3);
  });

  it("validates monthly overtime caps and seven-day rest cycles", () => {
    const overtime = validateWorkingTime({
      regularMinutes: 8 * 60,
      overtimeMinutes: 120,
      weeklyRegularMinutes: 40 * 60,
      monthlyOvertimeMinutes: 47 * 60,
      threeMonthOvertimeMinutes: 139 * 60,
      laborManagementAgreement: true,
    });
    const restCycle = validateRestDayCycle({
      days: [
        { date: "2026-06-01", dayType: "workday" },
        { date: "2026-06-02", dayType: "workday" },
        { date: "2026-06-03", dayType: "workday" },
        { date: "2026-06-04", dayType: "workday" },
        { date: "2026-06-05", dayType: "workday" },
        { date: "2026-06-06", dayType: "workday" },
        { date: "2026-06-07", dayType: "rest_day" },
      ],
    });

    expect(overtime.passed).toBe(false);
    expect(overtime.issues).toEqual(["Three-month overtime exceeds configured 138 hours."]);
    expect(restCycle.passed).toBe(false);
    expect(restCycle.issues[0]).toContain("regular leave");
    expect(restCycle.sources[0].id).toBe("tw-lsa-article-36");
  });
});
