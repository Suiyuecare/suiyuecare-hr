import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("employee imports persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo workspace when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        department: {
          findMany: vi.fn(async () => {
            throw new Error("database employee import workspace failed");
          }),
        },
        employee: {
          findMany: vi.fn(async () => []),
        },
      }),
    }));

    const { getEmployeeImportWorkspace } = await import("./imports");

    await expect(getEmployeeImportWorkspace(hrSession)).rejects.toThrow(
      "database employee import workspace failed",
    );
  });

  it("does not fall back to demo employee import when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        department: {
          findMany: vi.fn(async () => [
            { id: "department-1", code: "ENG", name: "Engineering" },
          ]),
        },
        employee: {
          findMany: vi.fn(async () => []),
        },
        $transaction: vi.fn(async () => {
          throw new Error("database employee import write failed");
        }),
      }),
    }));

    const {
      confirmEmployeeImport,
      getEmployeeImportWorkspace,
      previewEmployeeImport,
    } = await import("./imports");

    const preview = await previewEmployeeImport(
      hrSession,
      `employeeNo,displayName,jobTitle,departmentCode,hireDate
E100,New Hire,Engineer,ENG,2026-07-01`,
    );

    await expect(confirmEmployeeImport(hrSession, preview.id)).rejects.toThrow(
      "database employee import write failed",
    );

    const workspace = await getEmployeeImportWorkspace(hrSession);
    expect(workspace.employees).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employeeNo: "E100" }),
      ]),
    );
  });
});
