import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("employee lifecycle persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo lifecycle workspace when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findMany: vi.fn(async () => {
            throw new Error("database lifecycle workspace failed");
          }),
        },
        department: {
          findMany: vi.fn(async () => []),
        },
        employeeLifecycleEvent: {
          findMany: vi.fn(async () => []),
        },
      }),
    }));

    const { getEmployeeLifecycleWorkspace } = await import("./lifecycle");

    await expect(getEmployeeLifecycleWorkspace(hrSession)).rejects.toThrow(
      "database lifecycle workspace failed",
    );
  });

  it("does not fall back to demo lifecycle mutations when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findFirst: vi.fn(async () => {
            throw new Error("database lifecycle mutation failed");
          }),
        },
      }),
    }));

    const {
      getEmployeeLifecycleWorkspace,
      recordLifecycleEvent,
    } = await import("./lifecycle");

    await expect(
      recordLifecycleEvent(hrSession, {
        employeeId: "employee-1",
        eventType: "leave",
        effectiveDate: new Date("2026-07-01T00:00:00.000Z"),
        reason: "Approved leave of absence",
      }),
    ).rejects.toThrow("database lifecycle mutation failed");

    await expect(getEmployeeLifecycleWorkspace(hrSession)).rejects.toThrow();
  });
});
