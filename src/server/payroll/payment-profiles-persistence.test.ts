import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("payment profile persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
    vi.doUnmock("@/server/demo/fallback");
  });

  it("does not fall back to demo payment profiles when database mode fails", async () => {
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
        employeePaymentProfile: {
          findMany: vi.fn(async () => {
            throw new Error("database payment profile read failed");
          }),
        },
      }),
    }));
    vi.doMock("@/server/demo/fallback", () => ({
      getFallbackCompanyOverview: fallbackOverview,
    }));

    const {
      getPaymentProfileCoverage,
      getPaymentProfileWorkspace,
      savePaymentProfile,
    } = await import("./payment-profiles");

    await expect(getPaymentProfileWorkspace(hrSession)).rejects.toThrow("database employee read failed");
    await expect(getPaymentProfileCoverage(hrSession, ["employee-1"])).rejects.toThrow(
      "database payment profile read failed",
    );
    await expect(
      savePaymentProfile(hrSession, {
        employeeId: "employee-1",
        bankCode: "004",
        bankBranchCode: "0123",
        accountName: "Employee One",
        accountNumber: "123456789012",
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("database employee lookup failed");
    expect(fallbackOverview).not.toHaveBeenCalled();
  });
});
