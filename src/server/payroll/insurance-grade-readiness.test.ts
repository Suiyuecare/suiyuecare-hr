import { describe, expect, it } from "vitest";
import { evaluatePayrollInsuranceGradeReadiness } from "@/server/payroll/insurance-grade-readiness";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";

describe("payroll insurance grade readiness", () => {
  it("passes when profiles use rule-selected grades or overrides at the recommended insured salary", () => {
    const report = evaluatePayrollInsuranceGradeReadiness([
      {
        employeeId: "emp_1",
        employeeNo: "E001",
        employeeName: "Lin HR",
        baseSalary: 56_000,
        recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: 2_000 }],
      },
      {
        employeeId: "emp_2",
        employeeNo: "E002",
        employeeName: "Chen Manager",
        baseSalary: 78_000,
        healthInsuranceMonthlyWage: 80_200,
      },
    ]);

    expect(report).toMatchObject({
      ready: true,
      checkedCount: 2,
      issueCount: 0,
    });
    expect(report.recommendations[0].items).toHaveLength(3);
  });

  it("flags explicit insured wage overrides below configured recommended grades without leaking salary in detail", () => {
    const config = structuredClone(defaultTaiwanLaborStandardsConfig);
    config.statutoryPayroll.laborInsuranceSalaryGrades = [
      { level: 1, insuredSalary: 30_000, salaryFrom: 0, salaryTo: 30_000 },
      { level: 2, insuredSalary: 60_000, salaryFrom: 30_001, salaryTo: null },
    ];
    const report = evaluatePayrollInsuranceGradeReadiness(
      [
        {
          employeeId: "emp_1",
          employeeNo: "E001",
          employeeName: "Lin HR",
          baseSalary: 56_000,
          laborInsuranceMonthlyWage: 30_000,
        },
      ],
      config,
    );

    expect(report.ready).toBe(false);
    expect(report.issueCount).toBe(1);
    expect(report.issues[0]).toMatchObject({
      employeeId: "emp_1",
      kind: "labor_insurance",
      recommendedInsuredSalary: 60_000,
      overrideMonthlyWage: 30_000,
    });
    expect(report.detail).toBe("1 payroll compliance profile(s) checked; 1 under-insured wage override risk(s).");
    expect(report.detail).not.toContain("56000");
    expect(report.detail).not.toContain("30000");
  });
});
