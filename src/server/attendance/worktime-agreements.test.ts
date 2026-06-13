import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  evaluateWorktimeAgreementReadiness,
  getWorktimeAgreementSettings,
  resetWorktimeAgreementDemoState,
  updateWorktimeAgreementSettings,
} from "./worktime-agreements";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林 HR" },
  employee: { id: "demo-hr-employee", displayName: "林 HR" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("worktime agreement settings", () => {
  beforeEach(() => {
    resetWorktimeAgreementDemoState();
    resetAuditDemoState();
  });

  it("lets HR configure audited worktime agreement evidence", async () => {
    const updated = await updateWorktimeAgreementSettings(hrSession, {
      approvalType: "labor_management_conference",
      approvalOnFile: true,
      evidenceRef: "meeting://2026-06",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      monthlyOvertimeLimitMinutes: 54 * 60,
      threeMonthOvertimeLimitMinutes: 138 * 60,
      verificationStatus: "verified",
    });

    await expect(getWorktimeAgreementSettings(hrSession)).resolves.toEqual(updated);
    expect(evaluateWorktimeAgreementReadiness(updated, new Date("2026-06-13T00:00:00.000Z"))).toMatchObject({
      ready: true,
      missing: [],
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "worktime_agreement_settings",
      metadataJson: expect.objectContaining({
        approvalType: "labor_management_conference",
        verificationStatus: "verified",
        evidenceRefStoredAsReferenceOnly: true,
      }),
    });
    expect(getAuditDemoState().logs[0]?.metadataJson).not.toHaveProperty("evidenceRef");
  });

  it("flags missing evidence, expired effective periods, and unfiled local reports", () => {
    expect(
      evaluateWorktimeAgreementReadiness(
        {
          approvalType: "labor_management_conference",
          approvalOnFile: false,
          evidenceRef: null,
          effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
          effectiveTo: new Date("2025-12-31T00:00:00.000Z"),
          monthlyOvertimeLimitMinutes: 46 * 60,
          threeMonthOvertimeLimitMinutes: 138 * 60,
          localAuthorityReportRequired: true,
          localAuthorityReportFiled: false,
          verificationStatus: "unverified",
          verificationNote: null,
        },
        new Date("2026-06-13T00:00:00.000Z"),
      ),
    ).toMatchObject({
      ready: false,
      missing: [
        "labor union or labor-management conference approval evidence",
        "evidence reference",
        "effective period expired",
        "HR verification",
        "local authority filing",
      ],
    });
  });

  it("blocks managers from updating worktime agreement settings", async () => {
    await expect(
      updateWorktimeAgreementSettings(managerSession, {
        approvalOnFile: true,
      }),
    ).rejects.toThrow(/employee:write/);
  });
});
