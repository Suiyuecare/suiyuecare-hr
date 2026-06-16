import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState, getAuditDemoState } from "@/server/audit/demo-store";
import { resetPayrollDemoState } from "@/server/payroll/demo-store";
import { resetDemoWorkflowState } from "@/server/workflows/demo-store";
import { getBetaPilotCheckpointEvidence } from "./beta-pilot-checkpoints";
import { runBetaPilotFinalReview } from "./beta-pilot-final-review";

const originalDatabaseUrl = process.env.DATABASE_URL;

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

describe("beta pilot final review", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetAuditDemoState();
    resetDemoWorkflowState();
    resetPayrollDemoState();
  });

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("records a day 14 blocked checkpoint with aggregate-only evidence when gates remain open", async () => {
    const report = await runBetaPilotFinalReview(hrSession);

    expect(report).toMatchObject({
      status: "blocked",
      checkpointStatus: "blocked",
      readyForPilot: false,
    });
    expect(report.blockedCount).toBeGreaterThan(0);
    expect(report.openItems.map((item) => item.id)).toContain("tenant_auth");

    const checkpoint = getAuditDemoState().logs[0];
    expect(checkpoint).toMatchObject({
      entityType: "beta_pilot_checkpoint",
      entityId: "day_14",
      metadataJson: expect.objectContaining({
        source: "beta_pilot_automated_evidence",
        checkpointStatus: "blocked",
        evidenceType: "audit_export",
        rawSensitiveDataRead: false,
        amountValuesRead: false,
        destinationValuesRead: false,
        identityNumberValuesRead: false,
        wellnessValuesRead: false,
        privateHrNotesRead: false,
      }),
    });

    const evidence = await getBetaPilotCheckpointEvidence(hrSession);
    expect(evidence.find((item) => item?.checkpointId === "day_14")).toMatchObject({
      status: "blocked",
      evidenceType: "audit_export",
    });

    expect(JSON.stringify(getAuditDemoState().logs)).not.toMatch(/56000|58000|62000|78000|80200/);
    expect(JSON.stringify(checkpoint.metadataJson)).not.toContain("林人資");
    expect(JSON.stringify(checkpoint.metadataJson)).not.toContain("張小安");
  });

  it("blocks employees from running the day 14 final review", async () => {
    await expect(runBetaPilotFinalReview(employeeSession)).rejects.toThrow(/pilot:manage/);
    expect(getAuditDemoState().logs).toHaveLength(0);
  });
});
