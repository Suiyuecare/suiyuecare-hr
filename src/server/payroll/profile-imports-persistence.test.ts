import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("payroll profile imports persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo employees when database employee reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findMany: vi.fn(async () => {
            throw new Error("database payroll profile employee read failed");
          }),
        },
      }),
    }));

    const { getPayrollProfileImportWorkspace, previewPayrollProfileImport } = await import("./profile-imports");

    await expect(getPayrollProfileImportWorkspace(hrSession)).rejects.toThrow(
      "database payroll profile employee read failed",
    );
    await expect(previewPayrollProfileImport(
      hrSession,
      `employeeNo,baseSalary,taxResidency,dependentCount,bankCode,accountName,accountNumber,effectiveFrom
E003,56000,resident,1,004,Account,123456789012,2026-07-01`,
    )).rejects.toThrow("database payroll profile employee read failed");
  });
});
