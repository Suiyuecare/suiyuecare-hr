import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

const policyInput = {
  code: "family-care",
  name: "Family care leave",
  annualUnits: 7,
  unit: "day",
  attachmentRequired: true,
  status: "active" as const,
  statutoryCategory: "family_care" as const,
  eligibilityRule: "caregiver" as const,
  payRatePercent: 0,
  annualLimitNote: "Company-reviewed family care policy.",
  requiresLegalReview: false,
  accrualMethod: "annual_grant" as const,
  minNoticeDays: 1,
  carryoverLimitUnits: 0,
  paid: false,
  syncBalancesOnUpdate: true,
};

describe("leave policy persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo leave policies when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        leavePolicy: {
          findMany: vi.fn(async () => {
            throw new Error("database leave policy read failed");
          }),
        },
      }),
    }));

    const { getLeavePolicySettings } = await import("./policies");

    await expect(getLeavePolicySettings(hrSession)).rejects.toThrow(
      "database leave policy read failed",
    );
  });

  it("does not fall back to demo leave policy saves when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database leave policy write failed");
        }),
      }),
    }));

    const { saveLeavePolicySettings } = await import("./policies");

    await expect(saveLeavePolicySettings(hrSession, policyInput)).rejects.toThrow(
      "database leave policy write failed",
    );
  });
});
