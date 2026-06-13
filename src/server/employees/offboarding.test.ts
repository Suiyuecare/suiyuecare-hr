import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { recordLifecycleEvent, resetEmployeeLifecycleDemoState } from "./lifecycle";
import {
  evaluateOffboardingReadiness,
  getOffboardingWorkspace,
  resetOffboardingDemoState,
  updateOffboardingTask,
  type OffboardingTaskView,
} from "./offboarding";

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

describe("employee offboarding", () => {
  beforeEach(() => {
    resetEmployeeLifecycleDemoState();
    resetOffboardingDemoState();
    resetAuditDemoState();
  });

  it("expands termination lifecycle events into offboarding tasks", async () => {
    await recordLifecycleEvent(hrSession, {
      employeeId: "demo-employee-2",
      eventType: "termination",
      effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
      reason: "Layoff with HR/legal review.",
      terminationReasonCategory: "layoff",
      pensionScheme: "labor_pension_new",
      averageMonthlyWage: 54000,
      finalPayPrepared: true,
      unusedLeaveSettlementPrepared: false,
      insuranceWithdrawalPrepared: false,
      accessRevocationPrepared: true,
      documentRetentionPrepared: false,
      employeeCertificatePrepared: false,
    });

    const workspace = await getOffboardingWorkspace(hrSession);

    expect(workspace.tasks).toHaveLength(6);
    expect(workspace.readiness).toMatchObject({
      ready: false,
      readyCount: 2,
      pendingCount: 4,
    });
    expect(workspace.tasks.map((task) => task.taskType)).toContain("statutory_insurance_withdrawal");
  });

  it("updates task evidence with redacted audit metadata", async () => {
    const event = await recordLifecycleEvent(hrSession, {
      employeeId: "demo-employee-2",
      eventType: "termination",
      effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
      reason: "Contract ended.",
      terminationReasonCategory: "contract_end",
      pensionScheme: "labor_pension_new",
      finalPayPrepared: false,
      unusedLeaveSettlementPrepared: false,
      insuranceWithdrawalPrepared: false,
      accessRevocationPrepared: false,
      documentRetentionPrepared: false,
      employeeCertificatePrepared: false,
    });

    await updateOffboardingTask(hrSession, {
      employeeId: "demo-employee-2",
      lifecycleEventId: event!.id,
      taskType: "employment_certificate",
      status: "completed",
      completedAt: new Date("2026-06-02T00:00:00.000Z"),
      evidenceRef: "certificate://private-ref",
      notes: "Private offboarding note.",
    });

    const workspace = await getOffboardingWorkspace(hrSession);
    const task = workspace.tasks.find((item) => item.taskType === "employment_certificate");
    expect(task).toMatchObject({
      status: "completed",
      evidenceHash: expect.any(String),
    });
    const auditText = JSON.stringify(getAuditDemoState().logs);
    expect(auditText).toContain("employee_offboarding_task");
    expect(auditText).toContain("evidenceRefHash");
    expect(auditText).not.toContain("certificate://private-ref");
    expect(auditText).not.toContain("Private offboarding note.");
  });

  it("evaluates overdue pending tasks", () => {
    const tasks: OffboardingTaskView[] = [
      {
        id: "task-1",
        employeeId: "employee-1",
        employeeNo: "E001",
        employeeName: "Employee",
        lifecycleEventId: "event-1",
        effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
        taskType: "final_wage_review",
        status: "pending",
        dueDate: new Date("2026-01-01T00:00:00.000Z"),
        completedAt: null,
        evidenceHash: null,
        overdue: false,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];

    expect(evaluateOffboardingReadiness(tasks, new Date("2026-06-13T00:00:00.000Z"))).toMatchObject({
      ready: false,
      pendingCount: 1,
      overdueCount: 1,
    });
  });

  it("blocks managers from changing offboarding tasks", async () => {
    await expect(
      updateOffboardingTask(managerSession, {
        employeeId: "demo-employee-2",
        lifecycleEventId: "event-1",
        taskType: "final_wage_review",
        status: "completed",
      }),
    ).rejects.toThrow(/employee:write/);
  });
});
