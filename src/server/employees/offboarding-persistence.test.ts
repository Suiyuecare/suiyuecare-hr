import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

const terminationEvent = {
  id: "event-1",
  employeeId: "employee-1",
  employeeNo: "E001",
  employeeName: "Employee",
  eventType: "termination" as const,
  effectiveDate: new Date("2026-07-01T00:00:00.000Z"),
  reason: "Termination with HR review.",
  previousDepartmentName: "Engineering",
  nextDepartmentName: "Engineering",
  previousJobTitle: "Engineer",
  nextJobTitle: "Engineer",
  previousStatus: "active" as const,
  nextStatus: "terminated" as const,
  terminationCompliance: null,
  terminationOffboarding: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

describe("employee offboarding persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
    vi.doUnmock("./lifecycle");
  });

  it("does not fall back to demo offboarding workspace when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("./lifecycle", () => ({
      getEmployeeLifecycleWorkspace: vi.fn(async () => ({
        employees: [],
        departments: [],
        events: [terminationEvent],
      })),
    }));
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employeeOffboardingTask: {
          findMany: vi.fn(async () => {
            throw new Error("database offboarding workspace failed");
          }),
        },
      }),
    }));

    const { getOffboardingWorkspace } = await import("./offboarding");

    await expect(getOffboardingWorkspace(hrSession)).rejects.toThrow(
      "database offboarding workspace failed",
    );
  });

  it("does not fall back to demo offboarding task updates when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("./lifecycle", () => ({
      getEmployeeLifecycleWorkspace: vi.fn(async () => ({
        employees: [],
        departments: [],
        events: [terminationEvent],
      })),
    }));
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database offboarding write failed");
        }),
        employeeOffboardingTask: {
          findMany: vi.fn(async () => {
            throw new Error("database offboarding workspace failed after write");
          }),
        },
      }),
    }));

    const {
      getOffboardingWorkspace,
      updateOffboardingTask,
    } = await import("./offboarding");

    await expect(
      updateOffboardingTask(hrSession, {
        employeeId: "employee-1",
        lifecycleEventId: "event-1",
        taskType: "final_wage_review",
        status: "completed",
        completedAt: new Date("2026-07-01T00:00:00.000Z"),
        evidenceRef: "ticket://offboarding-private",
        notes: "Private notes",
      }),
    ).rejects.toThrow("database offboarding write failed");

    await expect(getOffboardingWorkspace(hrSession)).rejects.toThrow(
      "database offboarding workspace failed after write",
    );
  });
});
