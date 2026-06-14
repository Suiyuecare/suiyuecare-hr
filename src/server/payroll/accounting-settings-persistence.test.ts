import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("payroll accounting settings persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo accounting settings when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyPayrollAccountingSetting: {
          findUnique: vi.fn(async () => {
            throw new Error("database accounting settings read failed");
          }),
        },
      }),
    }));

    const {
      getPayrollAccountingSettings,
      updatePayrollAccountingSettings,
    } = await import("./accounting-settings");

    await expect(getPayrollAccountingSettings(hrSession)).rejects.toThrow(
      "database accounting settings read failed",
    );
    await expect(
      updatePayrollAccountingSettings(hrSession, {
        grossPayrollDebitAccountCode: "6001",
      }),
    ).rejects.toThrow("database accounting settings read failed");
  });
});
