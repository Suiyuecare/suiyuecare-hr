import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("payroll compliance persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
    vi.doUnmock("@/server/rules/settings");
  });

  it("does not fall back to demo compliance rows when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findMany: vi.fn(async () => {
            throw new Error("database compliance read failed");
          }),
        },
      }),
    }));
    vi.doMock("@/server/rules/settings", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/server/rules/settings")>()),
      getTaiwanLaborStandardsConfig: vi.fn(async () => defaultTaiwanLaborStandardsConfig),
    }));

    const { getPayrollInsuranceGradeReadiness, listPayrollComplianceProfiles } = await import("./compliance");

    await expect(listPayrollComplianceProfiles(hrSession)).rejects.toThrow("database compliance read failed");
    await expect(getPayrollInsuranceGradeReadiness(hrSession)).rejects.toThrow("database compliance read failed");
  });
});
