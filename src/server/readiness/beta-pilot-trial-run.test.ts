import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAnnouncementDemoState } from "@/server/announcements/service";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { resetAnnualLeaveSettlementDemoState } from "@/server/leave/annual-leave-settlement-demo-store";
import { resetPayrollDemoState } from "@/server/payroll/demo-store";
import { resetProductTelemetryDemoState } from "@/server/telemetry/product";
import { resetDemoWorkflowState } from "@/server/workflows/demo-store";
import {
  getBetaPilotTrialWorkspace,
  resetBetaPilotTrialDemoState,
  upsertBetaPilotTrialRun,
} from "./beta-pilot-trial-run";

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

describe("beta pilot trial run", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetAuditDemoState();
    resetAnnouncementDemoState();
    resetAnnualLeaveSettlementDemoState();
    resetBetaPilotTrialDemoState();
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

  it("creates an audited 20-50 person trial run snapshot without raw sensitive evidence", async () => {
    const run = await upsertBetaPilotTrialRun(hrSession, {
      startsAt: new Date("2026-06-17T00:00:00+08:00"),
      notes: "PILOT-2026-06 private setup note",
    });

    expect(run).toMatchObject({
      status: "blocked",
      expectedEmployeeCount: 25,
      managerCount: 1,
      latestReadinessStatus: "blocked",
      eventCount: 1,
    });
    expect(run.evidenceSummaryHash).toEqual(expect.any(String));

    const workspace = await getBetaPilotTrialWorkspace(hrSession);
    expect(workspace.trialRun?.id).toBe(run.id);
    expect(workspace.employeeCount).toBe(25);
    expect(workspace.managerCount).toBe(1);
    expect(workspace.openBlockedCount).toBeGreaterThan(0);

    const audit = getAuditDemoState().logs[0];
    expect(audit).toMatchObject({
      action: "create",
      entityType: "beta_pilot_trial_run",
      entityId: run.id,
      metadataJson: expect.objectContaining({
        readyForPilot: false,
        rawSensitiveDataIncluded: false,
        amountValuesIncluded: false,
        destinationValuesIncluded: false,
        identityNumberValuesIncluded: false,
        wellnessValuesIncluded: false,
      }),
    });
    expect(JSON.stringify(audit.metadataJson)).not.toContain("PILOT-2026-06 private setup note");
    expect(JSON.stringify(audit.metadataJson)).not.toContain("林人資");
    expect(JSON.stringify(getAuditDemoState().logs)).not.toMatch(/56000|58000|62000|78000|80200/);
  });

  it("updates the active trial run and appends another evidence event", async () => {
    const created = await upsertBetaPilotTrialRun(hrSession);
    const updated = await upsertBetaPilotTrialRun(hrSession);

    expect(updated.id).toBe(created.id);
    expect(updated.eventCount).toBe(2);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "beta_pilot_trial_run",
      entityId: created.id,
    });
  });

  it("blocks employees from creating or viewing trial run management data", async () => {
    await expect(upsertBetaPilotTrialRun(employeeSession)).rejects.toThrow(/pilot:manage/);
    await expect(getBetaPilotTrialWorkspace(employeeSession)).rejects.toThrow(/settings:read/);
    expect(getAuditDemoState().logs).toHaveLength(0);
  });
});
