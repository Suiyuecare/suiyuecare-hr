import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import { getAuditLogs } from "@/server/audit/queries";
import {
  getActiveTaiwanLaborStandardsConfig,
  resetRuleSettingsDemoState,
  updateTaiwanLaborStandardsConfig,
} from "./settings";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王執行長" },
  employee: null,
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("rule settings", () => {
  beforeEach(() => {
    resetRuleSettingsDemoState();
    resetAuditDemoState();
  });

  it("allows owner to create a company-specific Taiwan labor standards version", async () => {
    const updated = await updateTaiwanLaborStandardsConfig(ownerSession, {
      changeControl: {
        reason: "2026 company payroll setup review",
        sourceUrl: "https://laws.mol.gov.tw/",
        reviewedBy: "Legal reviewer",
        reviewStatus: "approved",
        requiresPayrollRecalculation: true,
      },
      minimumHourlyWage: 205,
      payrollStandardMonthlyHours: 228,
      holidayWorkMultiplier: 2.1,
      regularLeaveWorkMultiplier: 2.2,
      emergencyOvertimeMultiplier: 2.3,
      maxDailyWorkMinutesIncludingOvertime: 12 * 60,
      maxMonthlyOvertimeMinutes: 45 * 60,
      maxMonthlyOvertimeMinutesWithAgreement: 54 * 60,
      maxThreeMonthOvertimeMinutesWithAgreement: 138 * 60,
      restDayCycleDays: 7,
      requiredRegularLeaveDaysPerCycle: 1,
      requiredRestDaysPerCycle: 1,
      terminationCompliance: {
        laborPensionSeveranceMultiplierPerServiceYear: 0.55,
        laborPensionSeveranceMaxAverageWageMonths: 6.5,
        laborStandardsSeveranceMultiplierPerServiceYear: 1.1,
      },
      statutoryOnboarding: {
        laborInsuranceEnrollmentDueDaysFromHire: 0,
        employmentInsuranceEnrollmentDueDaysFromHire: 1,
        occupationalAccidentInsuranceEnrollmentDueDaysFromHire: 0,
        insuranceWithdrawalDueDaysFromTermination: 0,
      },
      statutoryPayroll: {
        nationalHealthInsuranceRate: 0.052,
        nationalHealthInsuranceEmployerShare: 0.61,
        nationalHealthInsuranceAverageDependentCount: 0.58,
        nationalHealthInsuranceSupplementaryPremiumEnabled: true,
        nationalHealthInsuranceSupplementaryPremiumRate: 0.022,
        nationalHealthInsuranceSupplementaryBonusThresholdMultiplier: 3.5,
        occupationalAccidentIndustryRate: 0.0025,
        laborPensionEmployerContributionRate: 0.065,
        incomeTaxWithholding: {
          annualSalarySpecialDeductionAmount: 280000,
          minimumMonthlyWithholding: 2000,
        },
      },
    });

    expect(updated.minimumHourlyWage).toBe(205);
    expect(updated.changeControl).toMatchObject({
      reason: "2026 company payroll setup review",
      sourceUrl: "https://laws.mol.gov.tw/",
      reviewedBy: "Legal reviewer",
      reviewStatus: "approved",
      requiresPayrollRecalculation: true,
    });
    expect(updated.changeControl.reviewedAt).toBeTruthy();
    expect(updated.payrollStandardMonthlyHours).toBe(228);
    expect(updated.holidayWorkMultiplier).toBe(2.1);
    expect(updated.regularLeaveWorkMultiplier).toBe(2.2);
    expect(updated.emergencyOvertimeMultiplier).toBe(2.3);
    expect(updated.maxDailyWorkMinutesIncludingOvertime).toBe(12 * 60);
    expect(updated.maxMonthlyOvertimeMinutes).toBe(45 * 60);
    expect(updated.maxMonthlyOvertimeMinutesWithAgreement).toBe(54 * 60);
    expect(updated.maxThreeMonthOvertimeMinutesWithAgreement).toBe(138 * 60);
    expect(updated.restDayCycleDays).toBe(7);
    expect(updated.requiredRegularLeaveDaysPerCycle).toBe(1);
    expect(updated.requiredRestDaysPerCycle).toBe(1);
    expect(updated.terminationCompliance.laborPensionSeveranceMultiplierPerServiceYear).toBe(0.55);
    expect(updated.terminationCompliance.laborPensionSeveranceMaxAverageWageMonths).toBe(6.5);
    expect(updated.terminationCompliance.laborStandardsSeveranceMultiplierPerServiceYear).toBe(1.1);
    expect(updated.statutoryOnboarding).toMatchObject({
      laborInsuranceEnrollmentDueDaysFromHire: 0,
      employmentInsuranceEnrollmentDueDaysFromHire: 1,
      occupationalAccidentInsuranceEnrollmentDueDaysFromHire: 0,
      insuranceWithdrawalDueDaysFromTermination: 0,
    });
    expect(updated.statutoryPayroll.nationalHealthInsuranceRate).toBe(0.052);
    expect(updated.statutoryPayroll.nationalHealthInsuranceEmployerShare).toBe(0.61);
    expect(updated.statutoryPayroll.nationalHealthInsuranceAverageDependentCount).toBe(0.58);
    expect(updated.statutoryPayroll.nationalHealthInsuranceSupplementaryPremiumEnabled).toBe(true);
    expect(updated.statutoryPayroll.nationalHealthInsuranceSupplementaryPremiumRate).toBe(0.022);
    expect(updated.statutoryPayroll.nationalHealthInsuranceSupplementaryBonusThresholdMultiplier).toBe(3.5);
    expect(updated.statutoryPayroll.occupationalAccidentIndustryRate).toBe(0.0025);
    expect(updated.statutoryPayroll.laborPensionEmployerContributionRate).toBe(0.065);
    expect(updated.statutoryPayroll.incomeTaxWithholding.annualSalarySpecialDeductionAmount).toBe(280000);
    expect(updated.statutoryPayroll.incomeTaxWithholding.minimumMonthlyWithholding).toBe(2000);
    expect(updated.version).toContain("+company-1");
    expect(getActiveTaiwanLaborStandardsConfig().minimumHourlyWage).toBe(205);
    expect(getActiveTaiwanLaborStandardsConfig().statutoryPayroll.nationalHealthInsuranceRate).toBe(0.052);
    await expect(getAuditLogs(ownerSession, 1)).resolves.toEqual([
      expect.objectContaining({
        entityType: "rule_settings",
        metadata: expect.objectContaining({
          validationSummary: expect.objectContaining({
            passed: true,
            fixtureCount: 8,
            failedCount: 0,
          }),
        }),
      }),
    ]);
  });

  it("versions configurable statutory payroll grade and tax bracket tables", async () => {
    const updated = await updateTaiwanLaborStandardsConfig(ownerSession, {
      statutoryPayroll: {
        laborInsuranceSalaryGrades: [
          { level: 1, insuredSalary: 30000, salaryFrom: 0, salaryTo: 30000 },
          { level: 2, insuredSalary: 60000, salaryFrom: 30001, salaryTo: null },
        ],
        healthInsuranceSalaryGrades: [
          { level: 1, insuredSalary: 30000, salaryFrom: 0, salaryTo: 30000 },
          { level: 2, insuredSalary: 66000, salaryFrom: 30001, salaryTo: null },
        ],
        laborPensionContributionGrades: [
          { level: 1, insuredSalary: 30000, salaryFrom: 0, salaryTo: 30000 },
          { level: 2, insuredSalary: 60000, salaryFrom: 30001, salaryTo: null },
        ],
        incomeTaxWithholding: {
          brackets: [
            { taxableIncomeFrom: 0, taxableIncomeTo: 500000, rate: 0.05, progressiveDifference: 0 },
            { taxableIncomeFrom: 500001, taxableIncomeTo: null, rate: 0.12, progressiveDifference: 35000 },
          ],
        },
      },
    });

    expect(updated.statutoryPayroll.laborInsuranceSalaryGrades).toHaveLength(2);
    expect(updated.statutoryPayroll.laborInsuranceSalaryGrades[1]).toMatchObject({
      insuredSalary: 60000,
      salaryTo: null,
    });
    expect(updated.statutoryPayroll.healthInsuranceSalaryGrades[1]).toMatchObject({
      insuredSalary: 66000,
    });
    expect(updated.statutoryPayroll.incomeTaxWithholding.brackets[1]).toMatchObject({
      rate: 0.12,
      progressiveDifference: 35000,
    });
  });

  it("marks law rule changes as pending legal review when not explicitly approved", async () => {
    const updated = await updateTaiwanLaborStandardsConfig(ownerSession, {
      changeControl: {
        reason: "HR imported draft labor rule settings for review",
        sourceUrl: "https://laws.mol.gov.tw/",
        reviewedBy: "王執行長",
        requiresPayrollRecalculation: true,
      },
      minimumHourlyWage: 206,
    });

    expect(updated.changeControl).toMatchObject({
      reason: "HR imported draft labor rule settings for review",
      sourceUrl: "https://laws.mol.gov.tw/",
      reviewedBy: "王執行長",
      reviewStatus: "pending_legal_review",
      reviewedAt: null,
      requiresPayrollRecalculation: true,
    });
  });

  it("versions official legal source review evidence without code changes", async () => {
    const updated = await updateTaiwanLaborStandardsConfig(ownerSession, {
      changeControl: {
        reason: "Quarterly official source review",
        sourceUrl: "https://laws.mol.gov.tw/",
        reviewedBy: "Legal reviewer",
        reviewStatus: "approved",
        requiresPayrollRecalculation: false,
      },
      sources: [
        {
          id: "tw-lsa-article-24",
          title: "Labor Standards Act Article 24 overtime wage",
          url: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=N0030001",
          checkedAt: "2026-06-13",
        },
        {
          id: "tw-minimum-wage-2026",
          title: "Ministry of Labor 2026 minimum wage announcement",
          url: "https://english.mol.gov.tw/21139/40790/87087/",
          checkedAt: "2026-06-13",
        },
      ],
    });

    expect(updated.sources).toHaveLength(2);
    expect(updated.sources[0]).toMatchObject({
      id: "tw-lsa-article-24",
      checkedAt: "2026-06-13",
    });
    await expect(getAuditLogs(ownerSession, 1)).resolves.toEqual([
      expect.objectContaining({
        entityType: "rule_settings",
        metadata: expect.objectContaining({
          sourceFreshness: expect.objectContaining({
            passed: true,
            freshSourceCount: 2,
            totalSourceCount: 2,
          }),
          changedFields: expect.arrayContaining(["sources"]),
        }),
      }),
    ]);
  });

  it("keeps invalid zero work-time limits from replacing configured legal controls", async () => {
    const before = getActiveTaiwanLaborStandardsConfig();
    const updated = await updateTaiwanLaborStandardsConfig(ownerSession, {
      maxDailyWorkMinutesIncludingOvertime: 0,
      maxMonthlyOvertimeMinutes: 0,
      restDayCycleDays: 0,
      requiredRegularLeaveDaysPerCycle: 0,
    });

    expect(updated.maxDailyWorkMinutesIncludingOvertime).toBe(before.maxDailyWorkMinutesIncludingOvertime);
    expect(updated.maxMonthlyOvertimeMinutes).toBe(before.maxMonthlyOvertimeMinutes);
    expect(updated.restDayCycleDays).toBe(before.restDayCycleDays);
    expect(updated.requiredRegularLeaveDaysPerCycle).toBe(0);
  });

  it("blocks managers from changing law rule settings", async () => {
    await expect(
      updateTaiwanLaborStandardsConfig(managerSession, {
        minimumHourlyWage: 205,
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
