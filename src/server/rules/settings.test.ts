import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import { getAuditLogs } from "@/server/audit/queries";
import {
  getActiveTaiwanLaborStandardsConfig,
  getTaiwanLaborRuleCenter,
  reviewTaiwanLaborLegalSources,
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T04:00:00.000Z"));
    resetRuleSettingsDemoState();
    resetAuditDemoState();
  });

  afterEach(() => {
    vi.useRealTimers();
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
            fixtureCount: 9,
            failedCount: 0,
          }),
        }),
      }),
    ]);
  });

  it("summarizes rule center readiness and version history for HR operations", async () => {
    const initial = await getTaiwanLaborRuleCenter(ownerSession);

    expect(initial.readiness.status).toBe("ready");
    expect(initial.sourceReview).toMatchObject({
      status: "ready",
      dueCount: 0,
      missingCount: 0,
      invalidCount: 0,
      staleCount: 0,
    });
    expect(initial.sourceReview.items[0]).toMatchObject({
      status: "fresh",
      coverageTitles: expect.arrayContaining(["加班費與休息日出勤"]),
    });
    expect(initial.sourceReview.items.find((source) => source.id === "tw-lsa-article-32")).toMatchObject({
      primaryOwner: "HR",
      owners: ["HR", "Payroll"],
    });
    expect(initial.sourceReview.ownerQueues).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: "HR", status: "ready", dueCount: 0, missingCount: 0 }),
      expect.objectContaining({ owner: "Payroll", status: "ready", dueCount: 0, missingCount: 0 }),
      expect.objectContaining({ owner: "Owner", status: "ready", dueCount: 0, missingCount: 0 }),
    ]));
    expect(initial.complianceCoverageSummary).toMatchObject({
      status: "ready",
      coveredCount: 11,
      blockedCount: 0,
      totalCount: 11,
    });
    expect(initial.launchGate).toMatchObject({
      status: "ready",
      readyCount: 6,
      needsReviewCount: 0,
      blockedCount: 0,
      totalCount: 6,
      headline: "台灣法遵 Gate 已可支援月結與試用上線",
    });
    expect(initial.launchGate.steps.map((step) => step.id)).toEqual([
      "source_version",
      "human_review",
      "payroll_recalculation",
      "workflow_impact",
      "employee_rollout",
      "audit_package",
    ]);
    expect(initial.complianceCoverage.map((item) => item.id)).toEqual([
      "minimum_wage",
      "working_time",
      "overtime_pay",
      "rest_holiday_pay",
      "annual_leave",
      "statutory_leave",
      "termination",
      "insurance_onboarding",
      "statutory_payroll",
      "income_tax",
      "filing_package",
    ]);
    expect(initial.impactTasks.map((task) => task.id)).toEqual([
      "payroll_recalculation",
      "attendance_worktime_gate",
      "leave_calendar_gate",
      "termination_insurance_gate",
      "employee_policy_rollout",
      "audit_filing_package",
    ]);
    expect(initial.impactTasks.every((task) => task.status === "covered")).toBe(true);
    expect(initial.versionHistory).toEqual([
      expect.objectContaining({
        version: expect.stringContaining("2026.01"),
        status: "active",
        validationPassed: true,
      }),
    ]);

    await updateTaiwanLaborStandardsConfig(ownerSession, {
      changeControl: {
        reason: "HR imported draft labor rule settings for legal review",
        sourceUrl: "https://laws.mol.gov.tw/",
        reviewedBy: "Payroll owner",
        reviewStatus: "pending_legal_review",
        requiresPayrollRecalculation: true,
      },
      minimumHourlyWage: 206,
    });

    const draft = await getTaiwanLaborRuleCenter(ownerSession);

    expect(draft.readiness.status).toBe("needs_review");
    expect(draft.launchGate).toMatchObject({
      status: "needs_review",
      readyCount: 0,
      needsReviewCount: 6,
      blockedCount: 0,
    });
    expect(draft.launchGate.steps.find((step) => step.id === "payroll_recalculation")).toMatchObject({
      status: "needs_review",
      metric: "需要重算",
      actionHref: "/hr",
    });
    expect(draft.readiness.warnings).toEqual(expect.arrayContaining([
      "目前版本尚待法務或人資負責人審核",
      "台灣法遵覆蓋矩陣有 11 項需複核",
      "薪資草稿需重新試算檢查",
    ]));
    expect(draft.impactTasks.find((task) => task.id === "payroll_recalculation")).toMatchObject({
      status: "needs_review",
      actionHref: "/hr",
    });
    expect(draft.impactTasks.find((task) => task.id === "payroll_recalculation")?.nextAction).toContain("重新試算");
    expect(draft.versionHistory).toHaveLength(2);
    expect(draft.versionHistory[0]).toMatchObject({
      status: "active",
      reviewStatus: "pending_legal_review",
      requiresPayrollRecalculation: true,
      validationPassed: true,
    });
    expect(draft.versionHistory[1].status).toBe("superseded");
  });

  it("blocks rule center readiness when legal source coverage is incomplete", async () => {
    await updateTaiwanLaborStandardsConfig(ownerSession, {
      changeControl: {
        reason: "HR accidentally uploaded an incomplete source list",
        sourceUrl: "https://laws.mol.gov.tw/",
        reviewedBy: "Payroll owner",
        reviewStatus: "approved",
        requiresPayrollRecalculation: false,
      },
      sources: [
        {
          id: "tw-minimum-wage-2026",
          title: "Ministry of Labor 2026 minimum wage announcement",
          url: "https://english.mol.gov.tw/21139/40790/87087/",
          checkedAt: "2026-06-13",
        },
      ],
    });

    const center = await getTaiwanLaborRuleCenter(ownerSession);
    const workingTime = center.complianceCoverage.find((item) => item.id === "working_time");

    expect(center.complianceCoverageSummary).toMatchObject({
      status: "blocked",
      coveredCount: 1,
      blockedCount: 10,
      totalCount: 11,
    });
    expect(workingTime).toMatchObject({
      status: "blocked",
      missingSourceIds: ["tw-lsa-article-30", "tw-lsa-article-32"],
    });
    expect(center.impactTasks.find((task) => task.id === "attendance_worktime_gate")).toMatchObject({
      status: "blocked",
      sourceCoverage: {
        covered: 0,
        total: 6,
      },
    });
    expect(center.impactTasks.find((task) => task.id === "attendance_worktime_gate")?.nextAction).toContain("先補齊阻擋的法遵覆蓋");
    expect(center.launchGate).toMatchObject({
      status: "blocked",
      blockedCount: 5,
    });
    expect(center.launchGate.steps.find((step) => step.id === "source_version")).toMatchObject({
      status: "blocked",
      metric: "1/1 來源",
      actionHref: "#source-review",
    });
    expect(center.readiness).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining(["台灣法遵覆蓋矩陣有 10 個阻擋項"]),
    });
    expect(center.sourceReview).toMatchObject({
      status: "blocked",
      missingCount: 18,
      dueCount: 18,
    });
    expect(center.sourceReview.ownerQueues.find((queue) => queue.owner === "HR")).toMatchObject({
      status: "blocked",
      missingCount: expect.any(Number),
    });
    expect(center.sourceReview.ownerQueues.find((queue) => queue.owner === "Payroll")).toMatchObject({
      status: "blocked",
      missingCount: expect.any(Number),
    });
    expect(JSON.stringify(center.impactTasks)).not.toMatch(/postgresql:\/\/|sb_publishable_|password|銀行帳號|身分證字號/);
  });

  it("lets HR review configured legal sources without changing payroll parameters", async () => {
    await updateTaiwanLaborStandardsConfig(ownerSession, {
      changeControl: {
        reason: "Backdated source review fixture",
        sourceUrl: "https://laws.mol.gov.tw/",
        reviewedBy: "Payroll owner",
        reviewStatus: "approved",
        requiresPayrollRecalculation: false,
      },
      sources: getActiveTaiwanLaborStandardsConfig().sources.map((source) => ({
        ...source,
        checkedAt: "2025-12-01",
      })),
    });
    const stale = await getTaiwanLaborRuleCenter(ownerSession);

    expect(stale.sourceReview.status).toBe("needs_review");
    expect(stale.sourceReview.staleCount).toBe(stale.config.sources.length);
    expect(stale.sourceReview.ownerQueues.every((queue) => queue.status === "needs_review")).toBe(true);

    const reviewed = await reviewTaiwanLaborLegalSources(ownerSession, {
      reviewedBy: "Legal reviewer",
      reviewedAt: "2026-06-19",
      evidenceNote: "raw private legal note should not be stored",
      sourceIds: ["tw-lsa-article-24", "tw-lsa-article-30"],
    });
    const center = await getTaiwanLaborRuleCenter(ownerSession);
    const auditPayload = JSON.stringify(await getAuditLogs(ownerSession, 3));

    expect(reviewed.sources.find((source) => source.id === "tw-lsa-article-24")?.checkedAt).toBe("2026-06-19");
    expect(reviewed.sources.find((source) => source.id === "tw-lsa-article-30")?.checkedAt).toBe("2026-06-19");
    expect(reviewed.sources.find((source) => source.id === "tw-lsa-article-32")?.checkedAt).toBe("2025-12-01");
    expect(reviewed.changeControl).toMatchObject({
      reviewedBy: "Legal reviewer",
      reviewStatus: "approved",
      requiresPayrollRecalculation: false,
    });
    expect(reviewed.changeControl.reason).toContain("evidenceHash:");
    expect(center.versionHistory[0]).toMatchObject({
      status: "active",
      reviewedBy: "Legal reviewer",
      requiresPayrollRecalculation: false,
    });
    expect(center.sourceReview.items.find((source) => source.id === "tw-lsa-article-24")).toMatchObject({
      checkedAt: "2026-06-19",
      status: "fresh",
    });
    expect(center.sourceReview.items.find((source) => source.id === "tw-lsa-article-32")).toMatchObject({
      checkedAt: "2025-12-01",
      status: "stale",
    });
    expect(center.sourceReview.ownerQueues.find((queue) => queue.owner === "Payroll")).toMatchObject({
      status: "needs_review",
      staleCount: expect.any(Number),
    });
    expect(auditPayload).not.toContain("raw private legal note should not be stored");
  });

  it("versions statutory filing package mappings without code changes", async () => {
    const updated = await updateTaiwanLaborStandardsConfig(ownerSession, {
      statutoryPayroll: {
        statutoryFilingReports: [
          {
            report: "Custom labor insurance review",
            authority: "Bureau of Labor Insurance",
            payrollItemCodes: ["tw_labor_insurance_employee", "tw_labor_insurance_employer"],
          },
          {
            report: "Custom withholding review",
            authority: "Ministry of Finance",
            payrollItemCodes: ["tw_income_tax_withholding"],
          },
        ],
      },
      changeControl: {
        reason: "Customer statutory filing mapping review",
        sourceUrl: "https://laws.mol.gov.tw/",
        reviewedBy: "Payroll owner",
        reviewStatus: "approved",
        requiresPayrollRecalculation: false,
      },
    });

    expect(updated.statutoryPayroll.statutoryFilingReports).toEqual([
      {
        report: "Custom labor insurance review",
        authority: "Bureau of Labor Insurance",
        payrollItemCodes: ["tw_labor_insurance_employee", "tw_labor_insurance_employer"],
      },
      {
        report: "Custom withholding review",
        authority: "Ministry of Finance",
        payrollItemCodes: ["tw_income_tax_withholding"],
      },
    ]);
    await expect(getAuditLogs(ownerSession, 1)).resolves.toEqual([
      expect.objectContaining({
        entityType: "rule_settings",
        metadata: expect.objectContaining({
          changedFields: expect.arrayContaining(["statutoryPayroll.statutoryFilingReports"]),
          validationSummary: expect.objectContaining({
            passed: true,
            fixtureCount: 9,
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
    await expect(
      reviewTaiwanLaborLegalSources(managerSession, {
        reviewedBy: "陳主管",
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
