import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("payroll service persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("./db-store");
    vi.doUnmock("./demo-store");
  });

  it("does not fall back to demo payroll when database mode fails", async () => {
    const createDbPayrollRun = vi.fn(async () => {
      throw new Error("database write failed");
    });
    const createDemoPayrollRun = vi.fn(() => {
      throw new Error("demo fallback should not run");
    });

    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("./db-store", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./db-store")>()),
      createDbPayrollRun,
    }));
    vi.doMock("./demo-store", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./demo-store")>()),
      createDemoPayrollRun,
    }));

    const { createPayrollRun } = await import("./service");

    await expect(createPayrollRun(hrSession)).rejects.toThrow("database write failed");
    expect(createDbPayrollRun).toHaveBeenCalledTimes(1);
    expect(createDemoPayrollRun).not.toHaveBeenCalled();
  });
});
