import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("report builder persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo report jobs when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        reportDataset: {
          findUnique: vi.fn(async () => {
            throw new Error("database report catalog read failed");
          }),
        },
      }),
    }));

    const { createCustomReportJob, getReportAdminWorkspace } = await import("./builder");

    await expect(getReportAdminWorkspace(hrSession)).rejects.toThrow(
      "database report catalog read failed",
    );
    await expect(
      createCustomReportJob(hrSession, {
        datasetCode: "people_readiness",
        selectedFieldKeys: ["employee_no"],
      }),
    ).rejects.toThrow("database report catalog read failed");
  });
});
