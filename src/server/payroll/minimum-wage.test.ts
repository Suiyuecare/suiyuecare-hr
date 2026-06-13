import { describe, expect, it } from "vitest";
import { evaluateSalaryProfileMinimumWageCompliance } from "@/server/payroll/minimum-wage";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";

describe("salary profile minimum wage compliance", () => {
  it("passes when active salary profiles meet the configured Taiwan minimum wage", () => {
    const report = evaluateSalaryProfileMinimumWageCompliance([
      {
        employeeId: "emp_1",
        employeeNo: "E001",
        employeeName: "Lin HR",
        baseSalary: defaultTaiwanLaborStandardsConfig.minimumMonthlyWage,
        hourlyWage: defaultTaiwanLaborStandardsConfig.minimumHourlyWage,
      },
    ]);

    expect(report).toMatchObject({
      ready: true,
      checkedCount: 1,
      monthlyViolationCount: 0,
      hourlyViolationCount: 0,
    });
  });

  it("flags monthly and hourly wages below the active configured rule without leaking actual pay in detail", () => {
    const config = {
      ...defaultTaiwanLaborStandardsConfig,
      minimumMonthlyWage: 31_000,
      minimumHourlyWage: 210,
    };
    const report = evaluateSalaryProfileMinimumWageCompliance(
      [
        {
          employeeId: "emp_1",
          employeeNo: "E001",
          employeeName: "Lin HR",
          baseSalary: 30_999,
          hourlyWage: 209,
        },
      ],
      config,
    );

    expect(report.ready).toBe(false);
    expect(report.monthlyViolationCount).toBe(1);
    expect(report.hourlyViolationCount).toBe(1);
    expect(report.violations).toEqual([
      expect.objectContaining({
        employeeId: "emp_1",
        type: "monthly",
        requiredMinimum: 31_000,
      }),
      expect.objectContaining({
        employeeId: "emp_1",
        type: "hourly",
        requiredMinimum: 210,
      }),
    ]);
    expect(report.detail).toBe("1 salary profile(s) checked; 1 monthly and 1 hourly minimum wage violation(s).");
    expect(report.detail).not.toContain("30999");
    expect(report.detail).not.toContain("209");
  });
});
