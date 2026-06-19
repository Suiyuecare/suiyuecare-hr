import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("statutory insurance persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo insurance records when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findMany: vi.fn(async () => {
            throw new Error("database statutory insurance workspace failed");
          }),
        },
        statutoryInsuranceRecord: {
          findMany: vi.fn(async () => []),
        },
        ruleVersion: {
          findFirst: vi.fn(async () => null),
        },
      }),
    }));

    const { getStatutoryInsuranceWorkspace } = await import("./statutory");

    await expect(getStatutoryInsuranceWorkspace(hrSession)).rejects.toThrow(
      "database statutory insurance workspace failed",
    );
  });

  it("does not fall back to demo insurance records when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database statutory insurance write failed");
        }),
      }),
    }));

    const { updateStatutoryInsuranceRecord } = await import("./statutory");

    await expect(
      updateStatutoryInsuranceRecord(hrSession, {
        employeeId: "employee-1",
        insuranceType: "labor_insurance",
        status: "enrolled",
      }),
    ).rejects.toThrow("database statutory insurance write failed");
  });
});
