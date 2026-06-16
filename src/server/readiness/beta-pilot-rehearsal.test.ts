import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAnnouncementDemoState } from "@/server/announcements/service";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { resetAnnualLeaveSettlementDemoState } from "@/server/leave/annual-leave-settlement-demo-store";
import { resetPayrollDemoState } from "@/server/payroll/demo-store";
import { resetProductTelemetryDemoState } from "@/server/telemetry/product";
import { resetDemoWorkflowState } from "@/server/workflows/demo-store";
import { getBetaPilotCheckpointEvidence } from "./beta-pilot-checkpoints";
import { runBetaPilotRehearsal } from "./beta-pilot-rehearsal";

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

describe("beta pilot rehearsal", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetAuditDemoState();
    resetAnnouncementDemoState();
    resetAnnualLeaveSettlementDemoState();
    resetDemoWorkflowState();
    resetPayrollDemoState();
    resetProductTelemetryDemoState();
  });

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("runs the demo-safe employee, manager, HR, payroll, and payslip trial flow", async () => {
    const report = await runBetaPilotRehearsal(hrSession);

    expect(report).toMatchObject({
      status: "passed",
      stepCount: 6,
      checkpointIds: ["preflight", "day_1", "day_3", "day_7"],
      sensitiveValuesReturned: false,
    });

    const checkpoints = await getBetaPilotCheckpointEvidence(hrSession);
    expect(checkpoints.find((checkpoint) => checkpoint?.checkpointId === "preflight")).toMatchObject({
      status: "verified",
      evidenceType: "access_review",
    });
    expect(checkpoints.find((checkpoint) => checkpoint?.checkpointId === "day_1")).toMatchObject({
      status: "verified",
      evidenceType: "announcement_receipt",
    });
    expect(checkpoints.find((checkpoint) => checkpoint?.checkpointId === "day_3")).toMatchObject({
      status: "verified",
      evidenceType: "approval_flow",
    });
    expect(checkpoints.find((checkpoint) => checkpoint?.checkpointId === "day_7")).toMatchObject({
      status: "verified",
      evidenceType: "payslip_access",
    });

    const auditJson = JSON.stringify(getAuditDemoState().logs);
    expect(auditJson).not.toMatch(/56000|58000|62000|78000|80200/);
    expect(auditJson).not.toContain("Beta pilot rehearsal leave flow.");
    expect(auditJson).not.toContain("本公告不含個資");
  });

  it("blocks employees from running the rehearsal", async () => {
    await expect(runBetaPilotRehearsal(employeeSession)).rejects.toThrow(/pilot:manage/);
    expect(getAuditDemoState().logs).toHaveLength(0);
  });

  it("does not auto-mutate database-backed tenants", async () => {
    process.env.DATABASE_URL = "postgresql://example.invalid/hrone";

    await expect(runBetaPilotRehearsal(hrSession)).rejects.toThrow(/正式資料庫/);
    expect(getAuditDemoState().logs).toHaveLength(0);
  });
});
