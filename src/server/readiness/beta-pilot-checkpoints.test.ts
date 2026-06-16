import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getBetaPilotCheckpointEvidence,
  recordBetaPilotCheckpoint,
} from "./beta-pilot-checkpoints";

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

describe("beta pilot checkpoints", () => {
  beforeEach(() => {
    resetAuditDemoState();
  });

  it("records checkpoint evidence as redacted audit metadata", async () => {
    const result = await recordBetaPilotCheckpoint(hrSession, {
      checkpointId: "day_7",
      status: "verified",
      evidenceType: "payroll_rehearsal",
      evidenceRef: "PAYROLL-SMOKE-001",
      reviewerNote: "月結預演完成，沒有放薪資明細。",
      nextStep: "DAY14-REVIEW",
    });

    expect(result).toMatchObject({
      checkpointId: "day_7",
      status: "verified",
      evidenceType: "payroll_rehearsal",
    });
    const audit = getAuditDemoState().logs[0];
    expect(audit).toMatchObject({
      action: "update",
      entityType: "beta_pilot_checkpoint",
      entityId: "day_7",
      metadataJson: expect.objectContaining({
        checkpointId: "day_7",
        checkpointStatus: "verified",
        evidenceType: "payroll_rehearsal",
        hasEvidenceRef: true,
        hasReviewerNote: true,
      }),
    });
    expect(JSON.stringify(audit.metadataJson)).not.toContain("PAYROLL-SMOKE-001");
    expect(JSON.stringify(audit.metadataJson)).not.toContain("月結預演完成");
  });

  it("returns latest checkpoint evidence and blocks employees from writing", async () => {
    await recordBetaPilotCheckpoint(hrSession, {
      checkpointId: "day_1",
      status: "in_progress",
      evidenceType: "announcement_receipt",
      evidenceRef: "ANN-1",
    });
    await recordBetaPilotCheckpoint(hrSession, {
      checkpointId: "day_1",
      status: "verified",
      evidenceType: "announcement_receipt",
      evidenceRef: "ANN-2",
    });

    const evidence = await getBetaPilotCheckpointEvidence(hrSession);
    expect(evidence.find((checkpoint) => checkpoint?.checkpointId === "day_1")).toMatchObject({
      status: "verified",
      evidenceType: "announcement_receipt",
    });
    await expect(recordBetaPilotCheckpoint(employeeSession, {
      checkpointId: "day_1",
      status: "verified",
      evidenceType: "announcement_receipt",
    })).rejects.toThrow(/pilot:manage/);
  });
});
