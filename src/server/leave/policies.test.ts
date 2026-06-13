import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getLeavePolicySettings,
  resetLeavePolicyDemoState,
  saveLeavePolicySettings,
} from "./policies";
import { evaluateTaiwanStatutoryLeavePolicyCoverage } from "./statutory";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("leave policy settings", () => {
  beforeEach(() => {
    resetLeavePolicyDemoState();
    resetAuditDemoState();
  });

  it("starts with reviewed Taiwan statutory leave coverage", async () => {
    const policies = await getLeavePolicySettings(hrSession);
    const coverage = evaluateTaiwanStatutoryLeavePolicyCoverage(policies);

    expect(coverage).toMatchObject({
      ready: true,
      detail: "11/11 statutory leave categories approved; 0 missing; 0 pending review.",
    });
    expect(policies.map((policy) => policy.statutoryCategory)).toEqual(expect.arrayContaining([
      "annual_leave",
      "sick_leave",
      "personal_leave",
      "family_care",
      "menstrual",
      "maternity",
      "paternity",
      "bereavement",
      "marriage",
      "official",
      "occupational_injury",
    ]));
  });

  it("lets HR update a statutory leave policy with audited balance sync intent", async () => {
    const policy = await saveLeavePolicySettings(hrSession, {
      code: "family-care",
      name: "Family care leave",
      annualUnits: 7.5,
      unit: "day",
      attachmentRequired: true,
      status: "active",
      statutoryCategory: "family_care",
      eligibilityRule: "caregiver",
      payRatePercent: 0,
      annualLimitNote: "Company-reviewed family care policy.",
      requiresLegalReview: true,
      accrualMethod: "annual_grant",
      minNoticeDays: 1,
      carryoverLimitUnits: 0,
      paid: false,
      syncBalancesOnUpdate: true,
    });

    const policies = await getLeavePolicySettings(hrSession);

    expect(policy).toMatchObject({
      code: "family-care",
      annualUnits: 7.5,
      attachmentRequired: true,
      statutoryCategory: "family_care",
      eligibilityRule: "caregiver",
      payRatePercent: 0,
      requiresLegalReview: true,
      balanceCount: 5,
    });
    expect(policies).toEqual(expect.arrayContaining([expect.objectContaining({ code: "family-care" })]));
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "leave_policy",
      metadataJson: expect.objectContaining({
        statutoryCategory: "family_care",
        payRatePercent: "[REDACTED]",
        requiresLegalReview: true,
      }),
    });
  });

  it("rejects impossible leave pay percentages", async () => {
    await expect(
      saveLeavePolicySettings(hrSession, {
        code: "bad-pay-rate",
        name: "Bad pay rate",
        annualUnits: 1,
        unit: "day",
        attachmentRequired: false,
        status: "active",
        statutoryCategory: "company",
        eligibilityRule: "all_employees",
        payRatePercent: 125,
        annualLimitNote: null,
        requiresLegalReview: true,
        accrualMethod: "manual",
        minNoticeDays: 0,
        carryoverLimitUnits: null,
        paid: true,
        syncBalancesOnUpdate: false,
      }),
    ).rejects.toThrow(/Pay rate percent/);
  });

  it("blocks managers from changing leave policies", async () => {
    await expect(
      saveLeavePolicySettings(managerSession, {
        code: "special",
        name: "Special leave",
        annualUnits: 1,
        unit: "day",
        attachmentRequired: false,
        status: "active",
        statutoryCategory: "company",
        eligibilityRule: "all_employees",
        payRatePercent: 100,
        annualLimitNote: null,
        requiresLegalReview: false,
        accrualMethod: "manual",
        minNoticeDays: 0,
        carryoverLimitUnits: null,
        paid: true,
        syncBalancesOnUpdate: false,
      }),
    ).rejects.toThrow(/employee:write/);
  });
});
