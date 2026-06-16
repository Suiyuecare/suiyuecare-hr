import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  clockAttendance,
  createLeaveRequest,
  decideApproval,
} from "./service";
import {
  getDemoManagerInbox,
  resetDemoWorkflowState,
} from "./demo-store";

const employeeSession = {
  role: "employee",
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安", managerId: "demo-manager-employee" },
};

const managerSession = {
  role: "manager",
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("workflow beta pilot evidence", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "";
    resetAuditDemoState();
    resetDemoWorkflowState();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("verifies day 3 only after clock-out and leave approval evidence are both present", async () => {
    await clockAttendance(employeeSession, { direction: "in", source: "mobile" });
    await clockAttendance(employeeSession, { direction: "out", source: "mobile" });

    expect(getAuditDemoState().logs[0]).toMatchObject({
      entityType: "beta_pilot_checkpoint",
      entityId: "day_3",
      metadataJson: expect.objectContaining({
        checkpointStatus: "in_progress",
        evidenceType: "smoke_test",
        missingEvidenceTypes: ["approval_flow"],
      }),
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const leaveEnd = new Date(tomorrow);
    leaveEnd.setHours(18, 0, 0, 0);

    await createLeaveRequest(employeeSession, {
      startAt: tomorrow,
      endAt: leaveEnd,
      units: 1,
      reason: "私人請假原因",
    });
    const leaveRequest = getDemoManagerInbox("manager", "demo-manager-employee").pending
      .find((request) => request.type === "leave");
    expect(leaveRequest).toBeDefined();

    await decideApproval(managerSession, {
      requestId: leaveRequest!.id,
      action: "approve",
      comment: "已確認班表",
    });

    const latest = getAuditDemoState().logs[0];
    expect(latest).toMatchObject({
      entityType: "beta_pilot_checkpoint",
      entityId: "day_3",
      metadataJson: expect.objectContaining({
        checkpointStatus: "verified",
        evidenceType: "approval_flow",
        fulfilledEvidenceTypes: ["smoke_test", "approval_flow"],
        missingEvidenceTypes: [],
      }),
    });
    expect(JSON.stringify(getAuditDemoState().logs)).not.toContain("私人請假原因");
    expect(JSON.stringify(getAuditDemoState().logs)).not.toContain("已確認班表");
  });
});
