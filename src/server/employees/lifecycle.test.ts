import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getEmployeeLifecycleWorkspace,
  recordLifecycleEvent,
  resetEmployeeLifecycleDemoState,
} from "./lifecycle";

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

describe("employee lifecycle", () => {
  beforeEach(() => {
    resetEmployeeLifecycleDemoState();
    resetAuditDemoState();
  });

  it("records an audited lifecycle event and updates employee status", async () => {
    const event = await recordLifecycleEvent(hrSession, {
      employeeId: "demo-employee-2",
      eventType: "leave",
      effectiveDate: new Date("2026-07-01T00:00:00.000Z"),
      reason: "Approved parental leave",
    });
    const workspace = await getEmployeeLifecycleWorkspace(hrSession);
    const employee = workspace.employees.find((item) => item.id === "demo-employee-2");

    expect(event).toMatchObject({
      employeeId: "demo-employee-2",
      eventType: "leave",
      nextStatus: "on_leave",
      reason: "Approved parental leave",
    });
    expect(employee?.employmentStatus).toBe("on_leave");
    expect(workspace.events).toHaveLength(1);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "employee_lifecycle_event",
    });
  });

  it("blocks managers from lifecycle mutations", async () => {
    await expect(getEmployeeLifecycleWorkspace(managerSession)).rejects.toThrow(/employee:write/);
    await expect(
      recordLifecycleEvent(managerSession, {
        employeeId: "demo-employee-2",
        eventType: "termination",
        effectiveDate: new Date("2026-07-01T00:00:00.000Z"),
        reason: "Manager cannot do this",
      }),
    ).rejects.toThrow(/employee:write/);
  });

  it("captures Taiwan termination compliance snapshot with redacted audit metadata", async () => {
    const event = await recordLifecycleEvent(hrSession, {
      employeeId: "demo-employee-2",
      eventType: "termination",
      effectiveDate: new Date("2026-07-01T00:00:00.000Z"),
      reason: "Business unit restructuring approved by HR.",
      terminationReasonCategory: "layoff",
      pensionScheme: "labor_pension_new",
      averageMonthlyWage: 60_000,
    });
    const auditLog = getAuditDemoState().logs[0];

    expect(event?.terminationCompliance).toMatchObject({
      appliesStatutorySeverance: true,
      reasonCategory: "layoff",
      pensionScheme: "labor_pension_new",
      requiredAdvanceNoticeDays: 20,
      averageMonthlyWageProvided: true,
      requiresHumanReview: true,
    });
    expect(event?.terminationCompliance?.severancePayEstimate).toBeGreaterThan(0);
    expect(auditLog).toMatchObject({
      action: "update",
      entityType: "employee_lifecycle_event",
        metadataJson: expect.objectContaining({
        terminationComplianceCaptured: true,
        terminationRequiresHumanReview: true,
        sensitiveValuesRedacted: true,
      }),
    });
    expect(JSON.stringify(auditLog.metadataJson)).not.toContain("60000");
  });
});
