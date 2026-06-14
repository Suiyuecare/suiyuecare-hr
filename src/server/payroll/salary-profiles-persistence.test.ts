import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("salary profile persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
    vi.doUnmock("@/server/demo/fallback");
    vi.doUnmock("@/server/rules/settings");
  });

  it("does not fall back to demo salary profiles when database mode fails", async () => {
    const fallbackOverview = vi.fn(() => {
      throw new Error("demo fallback should not run");
    });

    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findMany: vi.fn(async () => {
            throw new Error("database employee read failed");
          }),
          findFirst: vi.fn(async () => {
            throw new Error("database employee lookup failed");
          }),
        },
        salaryProfile: {
          findMany: vi.fn(async () => {
            throw new Error("database salary profile read failed");
          }),
        },
      }),
    }));
    vi.doMock("@/server/demo/fallback", () => ({
      getFallbackCompanyOverview: fallbackOverview,
    }));
    vi.doMock("@/server/rules/settings", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/server/rules/settings")>()),
      getTaiwanLaborStandardsConfig: vi.fn(async () => defaultTaiwanLaborStandardsConfig),
    }));

    const { getSalaryProfileWorkspace, saveSalaryProfile } = await import("./salary-profiles");

    await expect(getSalaryProfileWorkspace(hrSession)).rejects.toThrow("database employee read failed");
    await expect(
      saveSalaryProfile(hrSession, {
        employeeId: "employee-1",
        baseSalary: 60_000,
        hourlyWage: null,
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("database employee lookup failed");
    expect(fallbackOverview).not.toHaveBeenCalled();
  });
});
