import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTaiwanLaborStandardsConfig } from "./taiwan-labor-standards";

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-owner", displayName: "Owner" },
  employee: null,
};

function activeRuleVersion() {
  return {
    id: "rule-version-1",
    status: "active",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    createdAt: new Date("2026-06-19T00:00:00.000Z"),
    definitionJson: defaultTaiwanLaborStandardsConfig,
  };
}

describe("rule settings persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo labor rules when database reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        ruleVersion: {
          findFirst: vi.fn(async () => {
            throw new Error("database law rule read failed");
          }),
        },
      }),
    }));

    const { getTaiwanLaborStandardsConfig } = await import("./settings");

    await expect(getTaiwanLaborStandardsConfig(ownerSession)).rejects.toThrow(
      "database law rule read failed",
    );
  });

  it("requires an active tenant rule version in database mode", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        ruleVersion: {
          findFirst: vi.fn(async () => null),
        },
      }),
    }));

    const { getTaiwanLaborStandardsConfig } = await import("./settings");

    await expect(getTaiwanLaborStandardsConfig(ownerSession)).rejects.toThrow(
      "Active Taiwan labor rule version is missing",
    );
  });

  it("does not fall back to demo version history when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        ruleVersion: {
          findFirst: vi.fn(async () => activeRuleVersion()),
          findMany: vi.fn(async () => {
            throw new Error("database law rule history failed");
          }),
        },
      }),
    }));

    const { getTaiwanLaborRuleCenter } = await import("./settings");

    await expect(getTaiwanLaborRuleCenter(ownerSession)).rejects.toThrow(
      "database law rule history failed",
    );
  });
});
