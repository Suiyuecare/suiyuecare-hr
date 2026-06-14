import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("payroll payment security persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo payment security settings when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyPayrollPaymentSecuritySetting: {
          findUnique: vi.fn(async () => {
            throw new Error("database payment security read failed");
          }),
        },
      }),
    }));

    const {
      getPayrollPaymentSecurityReadiness,
      updatePayrollPaymentSecuritySettings,
    } = await import("./payment-security");

    await expect(getPayrollPaymentSecurityReadiness(hrSession)).rejects.toThrow(
      "database payment security read failed",
    );
    await expect(
      updatePayrollPaymentSecuritySettings(hrSession, {
        tokenVaultProvider: "aws_secrets_manager",
      }),
    ).rejects.toThrow("database payment security read failed");
  });
});
