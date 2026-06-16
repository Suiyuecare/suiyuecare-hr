import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { runBetaPilotAccessReview } from "./beta-pilot-access-review";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("beta pilot access review", () => {
  beforeEach(() => {
    resetAuditDemoState();
  });

  it("records a preflight access review checkpoint without salary values", async () => {
    const report = await runBetaPilotAccessReview(hrSession);

    expect(report).toMatchObject({
      status: "passed",
      checkCount: 9,
      failedCount: 0,
    });
    expect(report.checks.map((check) => check.status)).toEqual(Array.from({ length: 9 }, () => "passed"));

    const checkpoint = getAuditDemoState().logs[0];
    expect(checkpoint).toMatchObject({
      entityType: "beta_pilot_checkpoint",
      entityId: "preflight",
      metadataJson: expect.objectContaining({
        source: "beta_pilot_automated_evidence",
        checkpointStatus: "verified",
        evidenceType: "access_review",
        checkCount: 9,
        passedCount: 9,
        failedCount: 0,
        rawSensitiveDataRead: false,
        amountValuesRead: false,
        destinationValuesRead: false,
        identityNumberValuesRead: false,
        wellnessValuesRead: false,
      }),
    });
    expect(JSON.stringify(getAuditDemoState().logs)).not.toMatch(/56000|58000|62000|78000/);
  });

  it("blocks employees from running the preflight access review", async () => {
    await expect(runBetaPilotAccessReview(employeeSession)).rejects.toThrow(/pilot:manage/);
    expect(getAuditDemoState().logs).toHaveLength(0);
  });
});
