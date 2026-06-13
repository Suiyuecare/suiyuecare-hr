import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  assignRequiredTraining,
  completeTrainingAssignment,
  evaluateTrainingReadiness,
  getTrainingWorkspace,
  resetTrainingDemoState,
  saveTrainingCourse,
  updateTrainingSettings,
} from "./compliance";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王執行長" },
  employee: null,
};

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr_admin", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("training compliance", () => {
  beforeEach(() => {
    resetTrainingDemoState();
    resetAuditDemoState();
  });

  it("blocks readiness when training is too long, unverified, unassigned, or overdue", () => {
    const readiness = evaluateTrainingReadiness({
      settings: {
        onboardingTrainingRequired: true,
        targetCompletionDays: 7,
        maxFirstWeekMinutes: 10,
        autoAssignNewHires: true,
        verificationStatus: "unverified",
        lastReviewedAt: null,
      },
      courses: [
        {
          id: "course-1",
          title: "Long training",
          category: "Onboarding",
          description: "Too long for the KPI.",
          version: "v1",
          status: "active",
          requiredForOnboarding: true,
          estimatedMinutes: 20,
          sourceRef: null,
          publishedAt: null,
        },
      ],
      assignments: [
        {
          id: "assignment-1",
          employeeId: "employee-1",
          employeeName: "Employee",
          courseId: "course-1",
          courseTitle: "Long training",
          courseVersion: "v1",
          estimatedMinutes: 20,
          status: "assigned",
          dueAt: new Date("2026-06-01T00:00:00.000Z"),
          completedAt: null,
        },
      ],
      activeEmployeeCount: 2,
      now: new Date("2026-06-13T00:00:00.000Z"),
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual([
      "training plan HR/legal review",
      "first-week training under KPI target",
      "required training assigned to active employees",
      "overdue required training",
    ]);
  });

  it("lets HR configure and assign required onboarding training", async () => {
    await updateTrainingSettings(ownerSession, {
      verificationStatus: "verified",
      maxFirstWeekMinutes: 10,
    });
    await saveTrainingCourse(hrSession, {
      title: "Payroll and privacy basics",
      category: "Onboarding",
      description: "A short walkthrough for payroll, attendance, and privacy basics.",
      version: "2026.02",
      estimatedMinutes: 2,
      requiredForOnboarding: true,
      status: "active",
      sourceRef: "policy://training/payroll-privacy",
    });

    const result = await assignRequiredTraining(hrSession);
    const workspace = await getTrainingWorkspace(hrSession);

    expect(result.employeeCount).toBe(5);
    expect(workspace.assignments.length).toBeGreaterThanOrEqual(5);
    expect(getAuditDemoState().logs.map((log) => log.entityType)).toContain("training_assignment_batch");
  });

  it("lets employees complete only their own training assignment", async () => {
    await assignRequiredTraining(hrSession);
    const workspace = await getTrainingWorkspace(employeeSession);
    const assignment = workspace.assignments[0];
    expect(assignment).toBeTruthy();

    const completed = await completeTrainingAssignment(employeeSession, assignment.id);

    expect(completed.status).toBe("completed");
    expect(JSON.stringify(getAuditDemoState().logs)).toContain("employee_training_assignment");
    const refreshed = await getTrainingWorkspace(employeeSession);
    expect(refreshed.assignments.every((item) => item.employeeId === "demo-employee-1")).toBe(true);
  });

  it("blocks employees from managing training controls", async () => {
    await expect(updateTrainingSettings(employeeSession, { verificationStatus: "verified" })).rejects.toThrow(
      "Role employee cannot training:manage",
    );
  });
});
