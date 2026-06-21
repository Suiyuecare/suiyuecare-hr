import { describe, expect, it } from "vitest";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";
import {
  calculateEmployeePayroll,
  canLockPayroll,
  closeChecklist,
  evaluatePayrollRuleReview,
} from "./calculation";

describe("payroll calculation", () => {
  it("calculates gross, overtime, deductions, and net pay", () => {
    const result = calculateEmployeePayroll({
      salaryProfile: {
        employeeId: "emp_1",
        employeeName: "Demo Employee",
        baseSalary: 60000,
        recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: 2000 }],
        recurringDeductions: [{ code: "welfare", name: "Welfare deduction", amount: 1000 }],
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      approvedOvertimeMinutes: 120,
      rule: {
        overtimeMultiplier: 4 / 3,
        standardMonthlyHours: 240,
        ruleVersionId: "rule_1",
      },
    });

    expect(result.grossPay).toBe(62667);
    expect(result.deductionTotal).toBe(5064);
    expect(result.netPay).toBe(57603);
    expect(result.employerContributionTotal).toBe(9810);
    expect(result.items.find((item) => item.kind === "overtime")).toMatchObject({
      amount: 667,
      quantity: 120,
      ruleVersionId: "rule_1",
      metadata: {
        buckets: [
          expect.objectContaining({
            minutes: 120,
            multiplier: 4 / 3,
          }),
        ],
      },
    });
    expect(result.items.find((item) => item.code === "tw_labor_insurance_employee")).toMatchObject({
      kind: "deduction",
      amount: 1099,
      metadata: expect.objectContaining({
        insuredSalary: 45800,
        gradeLevel: 11,
      }),
    });
    expect(result.items.find((item) => item.code === "tw_nhi_employee")).toMatchObject({
      kind: "deduction",
      amount: 990,
      metadata: expect.objectContaining({
        insuredSalary: 63800,
        gradeLevel: 18,
      }),
    });
    expect(result.items.find((item) => item.code === "tw_labor_pension_employer")).toMatchObject({
      kind: "employer_contribution",
      amount: 2748,
      metadata: expect.objectContaining({
        affectsNetPay: false,
        insuredSalary: 45800,
      }),
    });
    expect(result.items.find((item) => item.code === "tw_labor_insurance_employer")).toMatchObject({
      kind: "employer_contribution",
      amount: 3847,
    });
    expect(result.items.find((item) => item.code === "tw_nhi_employer")).toMatchObject({
      kind: "employer_contribution",
      amount: 3087,
      metadata: expect.objectContaining({
        averageDependentCount: 0.56,
        insuredSalary: 63800,
      }),
    });
    expect(result.items.find((item) => item.code === "tw_occupational_accident_insurance_employer")).toMatchObject({
      kind: "employer_contribution",
      amount: 128,
      metadata: expect.objectContaining({
        industryRate: 0.0021,
        commuteRate: 0.0007,
      }),
    });
    expect(result.items.find((item) => item.code === "tw_income_tax_withholding")).toMatchObject({
      kind: "deduction",
      amount: 1975,
      metadata: expect.objectContaining({
        annualizedTaxableIncome: 474000,
        bracketRate: 0.05,
        requiresReview: true,
      }),
    });
  });

  it("keeps employer statutory contributions out of employee gross and net pay", () => {
    const result = calculateEmployeePayroll({
      salaryProfile: {
        employeeId: "emp_1",
        employeeName: "Demo Employee",
        baseSalary: 60000,
        recurringAllowances: [],
        recurringDeductions: [],
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      approvedOvertimeMinutes: 0,
      rule: {
        overtimeMultiplier: 4 / 3,
        standardMonthlyHours: 240,
        ruleVersionId: "rule_1",
      },
    });

    expect(result.grossPay).toBe(60000);
    expect(result.employerContributionTotal).toBe(9665);
    expect(result.netPay).toBe(56083);
  });

  it("uses employee compliance profile for dependents and insurance wage overrides", () => {
    const result = calculateEmployeePayroll({
      salaryProfile: {
        employeeId: "emp_1",
        employeeName: "Demo Employee",
        baseSalary: 60000,
        recurringAllowances: [],
        recurringDeductions: [],
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      complianceProfile: {
        employeeId: "emp_1",
        taxResidency: "resident",
        dependentCount: 2,
        healthInsuranceMonthlyWage: 80200,
        incomeTaxWithholdingMethod: "annualized_progressive",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      approvedOvertimeMinutes: 0,
      rule: {
        overtimeMultiplier: 4 / 3,
        standardMonthlyHours: 240,
        ruleVersionId: "rule_1",
      },
    });

    expect(result.items.find((item) => item.code === "tw_nhi_employee")).toMatchObject({
      amount: 3732,
      metadata: expect.objectContaining({
        dependents: 2,
        insuredSalary: 80200,
      }),
    });
    expect(result.items.find((item) => item.code === "tw_nhi_employer")).toMatchObject({
      amount: 3881,
      metadata: expect.objectContaining({
        insuredSalary: 80200,
      }),
    });
  });

  it("uses company-configured statutory grade tables for payroll deductions", () => {
    const customLaborConfig = structuredClone(defaultTaiwanLaborStandardsConfig);
    customLaborConfig.statutoryPayroll.laborInsuranceSalaryGrades = [
      { level: 1, insuredSalary: 30000, salaryFrom: 0, salaryTo: 30000 },
      { level: 2, insuredSalary: 60000, salaryFrom: 30001, salaryTo: null },
    ];
    customLaborConfig.statutoryPayroll.healthInsuranceSalaryGrades = [
      { level: 1, insuredSalary: 30000, salaryFrom: 0, salaryTo: 30000 },
      { level: 2, insuredSalary: 66000, salaryFrom: 30001, salaryTo: null },
    ];
    customLaborConfig.statutoryPayroll.laborPensionContributionGrades = [
      { level: 1, insuredSalary: 30000, salaryFrom: 0, salaryTo: 30000 },
      { level: 2, insuredSalary: 60000, salaryFrom: 30001, salaryTo: null },
    ];

    const result = calculateEmployeePayroll({
      salaryProfile: {
        employeeId: "emp_1",
        employeeName: "Demo Employee",
        baseSalary: 60000,
        recurringAllowances: [],
        recurringDeductions: [],
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      approvedOvertimeMinutes: 0,
      rule: {
        overtimeMultiplier: 4 / 3,
        standardMonthlyHours: 240,
        ruleVersionId: "rule_1",
        taiwanLaborStandards: customLaborConfig,
      },
    });

    expect(result.items.find((item) => item.code === "tw_labor_insurance_employee")).toMatchObject({
      amount: 1440,
      metadata: expect.objectContaining({
        insuredSalary: 60000,
        gradeLevel: 2,
      }),
    });
    expect(result.items.find((item) => item.code === "tw_nhi_employee")).toMatchObject({
      amount: 1024,
      metadata: expect.objectContaining({
        insuredSalary: 66000,
        gradeLevel: 2,
      }),
    });
    expect(result.items.find((item) => item.code === "tw_labor_pension_employer")).toMatchObject({
      amount: 3600,
      metadata: expect.objectContaining({
        insuredSalary: 60000,
      }),
    });
  });

  it("calculates NHI supplementary premium for configured bonus allowance items", () => {
    const customLaborConfig = structuredClone(defaultTaiwanLaborStandardsConfig);
    customLaborConfig.statutoryPayroll.healthInsuranceSalaryGrades = [
      { level: 1, insuredSalary: 60000, salaryFrom: 0, salaryTo: null },
    ];

    const result = calculateEmployeePayroll({
      salaryProfile: {
        employeeId: "emp_1",
        employeeName: "Demo Employee",
        baseSalary: 60000,
        recurringAllowances: [
          { code: "meal", name: "Meal allowance", amount: 2000 },
          { code: "bonus_project", name: "Project bonus", amount: 300000 },
        ],
        recurringDeductions: [],
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      approvedOvertimeMinutes: 0,
      rule: {
        overtimeMultiplier: 4 / 3,
        standardMonthlyHours: 240,
        ruleVersionId: "rule_1",
        taiwanLaborStandards: customLaborConfig,
      },
    });

    expect(result.items.find((item) => item.code === "tw_nhi_supplementary_employee")).toMatchObject({
      kind: "deduction",
      amount: 1266,
      metadata: expect.objectContaining({
        bonusAmount: 300000,
        thresholdAmount: 240000,
        chargeableAmount: 60000,
        rate: 0.0211,
        requiresReview: true,
      }),
    });
  });

  it("uses non-resident withholding rate from employee compliance profile", () => {
    const result = calculateEmployeePayroll({
      salaryProfile: {
        employeeId: "emp_1",
        employeeName: "Foreign Employee",
        baseSalary: 60000,
        recurringAllowances: [],
        recurringDeductions: [],
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      complianceProfile: {
        employeeId: "emp_1",
        taxResidency: "non_resident",
        dependentCount: 0,
        incomeTaxWithholdingMethod: "non_resident_flat",
        nonResidentWithholdingRate: 0.18,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      approvedOvertimeMinutes: 0,
      rule: {
        overtimeMultiplier: 4 / 3,
        standardMonthlyHours: 240,
        ruleVersionId: "rule_1",
      },
    });

    expect(result.items.find((item) => item.code === "tw_income_tax_withholding")).toMatchObject({
      amount: 10800,
      metadata: expect.objectContaining({
        annualTax: 129600,
        requiresReview: true,
      }),
    });
    expect(result.netPay).toBe(47158);
  });

  it("adds unused annual leave payout as a sourced payroll earning", () => {
    const result = calculateEmployeePayroll({
      salaryProfile: {
        employeeId: "emp_1",
        employeeName: "Demo Employee",
        baseSalary: 60000,
        recurringAllowances: [],
        recurringDeductions: [],
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      approvedOvertimeMinutes: 0,
      annualLeaveSettlements: [
        {
          unusedDays: 2.5,
          reason: "year_end",
          carriedFromPreviousYear: false,
        },
      ],
      rule: {
        overtimeMultiplier: 4 / 3,
        standardMonthlyHours: 240,
        ruleVersionId: "rule_1",
      },
    });

    expect(result.grossPay).toBe(65000);
    expect(result.items.find((item) => item.code === "unused_annual_leave_payout")).toMatchObject({
      kind: "allowance",
      amount: 5000,
      quantity: 2.5,
      metadata: expect.objectContaining({
        dailyWage: 2000,
        reason: "year_end",
        sources: [
          expect.objectContaining({ id: "tw-lsa-article-38" }),
          expect.objectContaining({ id: "tw-lsa-enforcement-article-24-1" }),
        ],
      }),
    });
  });

  it("rejects salary profiles below configured Taiwan minimum wage", () => {
    expect(() =>
      calculateEmployeePayroll({
        salaryProfile: {
          employeeId: "emp_1",
          employeeName: "Demo Employee",
          baseSalary: 28000,
          recurringAllowances: [],
          recurringDeductions: [],
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
        approvedOvertimeMinutes: 0,
        rule: {
          overtimeMultiplier: 4 / 3,
          standardMonthlyHours: 240,
          ruleVersionId: "rule_1",
        },
      }),
    ).toThrow(/minimum wage/);
  });
});

describe("payroll close checks", () => {
  it("blocks lock when attendance or approvals are unresolved", () => {
    expect(
      canLockPayroll({
        attendanceComplete: false,
        pendingApprovalCount: 1,
        exceptionCount: 1,
        status: "calculated",
      }),
    ).toBe(false);
  });

  it("allows lock only after calculation and clean blockers", () => {
    expect(
      canLockPayroll({
        attendanceComplete: true,
        pendingApprovalCount: 0,
        exceptionCount: 0,
        status: "calculated",
      }),
    ).toBe(true);
  });

  it("builds the seven-step close checklist", () => {
    const checklist = closeChecklist({
      attendanceComplete: true,
      pendingApprovalCount: 0,
      exceptionCount: 0,
      calculated: true,
      exceptionsReviewed: true,
      confirmed: true,
      locked: false,
      released: false,
    });

    expect(checklist.steps).toHaveLength(7);
    expect(checklist.canLock).toBe(true);
    expect(checklist.legalGate).toMatchObject({
      status: "ready",
      readyCount: 6,
      blockedCount: 0,
      totalCount: 6,
      headline: "薪資法遵 Gate 已可進入鎖定或發布",
    });
    expect(checklist.legalGate.steps.map((step) => step.id)).toEqual([
      "rule_version",
      "attendance_approvals",
      "calculation_draft",
      "hr_confirmation",
      "lock_guard",
      "release_access",
    ]);
  });

  it("blocks lock when a payroll draft uses an outdated rule version that requires recalculation", () => {
    const laborConfig = structuredClone(defaultTaiwanLaborStandardsConfig);
    laborConfig.version = "2026.02-company-review";
    laborConfig.changeControl = {
      reason: "Company changed statutory payroll settings after draft calculation.",
      sourceUrl: "https://laws.mol.gov.tw/",
      reviewedBy: "Legal reviewer",
      reviewedAt: "2026-06-12T00:00:00.000Z",
      reviewStatus: "approved",
      requiresPayrollRecalculation: true,
    };
    const ruleReview = evaluatePayrollRuleReview({
      payrollRuleVersionId: "2026.01-old-draft",
      laborConfig,
    });
    const checklist = closeChecklist({
      attendanceComplete: true,
      pendingApprovalCount: 0,
      exceptionCount: 0,
      calculated: true,
      exceptionsReviewed: true,
      confirmed: true,
      locked: false,
      released: false,
      ruleReview,
    });

    expect(ruleReview.needsRecalculation).toBe(true);
    expect(checklist.canCalculate).toBe(true);
    expect(checklist.canLock).toBe(false);
    expect(checklist.legalGate).toMatchObject({
      status: "blocked",
      blockedCount: 4,
    });
    expect(checklist.legalGate.steps.find((step) => step.id === "rule_version")).toMatchObject({
      status: "blocked",
      metric: "2026.01-old-draft",
      actionHref: "/settings/law-rules",
    });
    expect(checklist.steps.find((step) => step.step === 6)).toMatchObject({
      status: "blocked",
    });
    expect(
      canLockPayroll({
        attendanceComplete: true,
        pendingApprovalCount: 0,
        exceptionCount: 0,
        status: "confirmed",
        ruleReviewPassed: !ruleReview.blocksLock,
      }),
    ).toBe(false);
  });

  it("blocks lock while the active payroll rule version is pending legal review", () => {
    const laborConfig = structuredClone(defaultTaiwanLaborStandardsConfig);
    laborConfig.version = "2026.02-pending-review";
    laborConfig.changeControl = {
      reason: "Draft imported before legal approval.",
      sourceUrl: "https://laws.mol.gov.tw/",
      reviewedBy: null,
      reviewedAt: null,
      reviewStatus: "pending_legal_review",
      requiresPayrollRecalculation: false,
    };

    const ruleReview = evaluatePayrollRuleReview({
      payrollRuleVersionId: laborConfig.version,
      laborConfig,
    });

    expect(ruleReview.needsRecalculation).toBe(false);
    expect(ruleReview.blocksLock).toBe(true);
    expect(ruleReview.detail).toContain("pending legal review");
    expect(
      closeChecklist({
        attendanceComplete: true,
        pendingApprovalCount: 0,
        exceptionCount: 0,
        calculated: true,
        exceptionsReviewed: true,
        confirmed: true,
        locked: false,
        released: false,
        ruleReview,
      }).legalGate.steps.find((step) => step.id === "hr_confirmation"),
    ).toMatchObject({
      status: "blocked",
      actionLabel: "人資確認",
    });
  });

  it("blocks payroll lock when active legal sources are not official HTTPS gov.tw URLs", () => {
    const laborConfig = structuredClone(defaultTaiwanLaborStandardsConfig);
    laborConfig.version = "2026.02-untrusted-source";
    laborConfig.sources = laborConfig.sources.map((source, index) =>
      index === 0
        ? {
            ...source,
            url: "https://example.com/private-law-database",
          }
        : source,
    );

    const ruleReview = evaluatePayrollRuleReview({
      payrollRuleVersionId: laborConfig.version,
      laborConfig,
    });
    const checklist = closeChecklist({
      attendanceComplete: true,
      pendingApprovalCount: 0,
      exceptionCount: 0,
      calculated: true,
      exceptionsReviewed: true,
      confirmed: true,
      locked: false,
      released: false,
      ruleReview,
    });

    expect(ruleReview).toMatchObject({
      sourceAuthorityPassed: false,
      untrustedLegalSourceCount: 1,
      invalidLegalSourceUrlCount: 0,
      blocksLock: true,
    });
    expect(ruleReview.detail).toContain("non-official or invalid legal source URLs");
    expect(checklist.canLock).toBe(false);
    expect(checklist.legalGate.steps.find((step) => step.id === "rule_version")).toMatchObject({
      status: "blocked",
      evidence: "payrollRun.ruleVersionId, payrollItem.ruleVersionId, HTTPS official .gov.tw legal sources",
    });
    expect(
      canLockPayroll({
        attendanceComplete: true,
        pendingApprovalCount: 0,
        exceptionCount: 0,
        status: "confirmed",
        ruleReviewPassed: !ruleReview.blocksLock,
      }),
    ).toBe(false);
  });
});
