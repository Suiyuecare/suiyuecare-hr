import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { resetDemoWorkflowState } from "@/server/workflows/demo-store";
import { createOvertimeRequest, getManagerInbox } from "@/server/workflows/service";
import {
  getAttendancePolicySettings,
  resetAttendancePolicyDemoState,
  saveAttendancePolicySettings,
} from "./policies";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王老闆" },
  employee: { id: "demo-owner-employee", displayName: "王老闆" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安", managerId: "demo-manager-employee" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("attendance policy settings", () => {
  beforeEach(() => {
    resetAttendancePolicyDemoState();
    resetDemoWorkflowState();
    resetAuditDemoState();
  });

  it("lets owners configure audited attendance thresholds", async () => {
    const policy = await saveAttendancePolicySettings(ownerSession, {
      name: "Flexible office policy",
      status: "active",
      regularDailyMinutes: 480,
      overtimeWarningDailyMinutes: 600,
      clockInGraceMinutes: 10,
      clockOutGraceMinutes: 10,
      requireOvertimeApproval: true,
      requirePunchCorrectionApproval: true,
      allowMobilePunch: true,
      effectiveFrom: new Date("2026-01-01T00:00:00+08:00"),
    });

    const policies = await getAttendancePolicySettings(ownerSession);

    expect(policy).toMatchObject({
      regularDailyMinutes: 480,
      overtimeWarningDailyMinutes: 600,
      clockInGraceMinutes: 10,
    });
    expect(policies).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Flexible office policy" })]));
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "create",
      entityType: "attendance_policy",
    });
  });

  it("uses the active policy for overtime warning risk summaries", async () => {
    await saveAttendancePolicySettings(ownerSession, {
      name: "Strict overtime warning",
      status: "active",
      regularDailyMinutes: 480,
      overtimeWarningDailyMinutes: 540,
      clockInGraceMinutes: 5,
      clockOutGraceMinutes: 5,
      requireOvertimeApproval: true,
      requirePunchCorrectionApproval: true,
      allowMobilePunch: true,
      effectiveFrom: new Date("2026-01-01T00:00:00+08:00"),
    });

    await createOvertimeRequest(employeeSession, {
      startAt: new Date("2026-06-12T18:00:00+08:00"),
      endAt: new Date("2026-06-12T20:00:00+08:00"),
      reason: "Release support",
    });

    const inbox = await getManagerInbox(managerSession);

    expect(inbox.pending[0].riskSummary).toContain("above configured 9 hour threshold");
  });

  it("blocks managers from changing attendance policies", async () => {
    await expect(
      saveAttendancePolicySettings(managerSession, {
        name: "Manager policy",
        status: "active",
        regularDailyMinutes: 480,
        overtimeWarningDailyMinutes: 600,
        clockInGraceMinutes: 5,
        clockOutGraceMinutes: 5,
        requireOvertimeApproval: true,
        requirePunchCorrectionApproval: true,
        allowMobilePunch: true,
        effectiveFrom: new Date("2026-01-01T00:00:00+08:00"),
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
