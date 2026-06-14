import { afterEach, describe, expect, it, vi } from "vitest";

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-owner", displayName: "Owner" },
  employee: null,
};

describe("company security settings persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo security settings when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companySecuritySetting: {
          findUnique: vi.fn(async () => {
            throw new Error("database security settings read failed");
          }),
        },
      }),
    }));

    const {
      getCompanySecuritySettings,
      updateCompanySecuritySettings,
    } = await import("./security");

    await expect(getCompanySecuritySettings(ownerSession)).rejects.toThrow(
      "database security settings read failed",
    );
    await expect(
      updateCompanySecuritySettings(ownerSession, {
        idleTimeoutMinutes: 30,
      }),
    ).rejects.toThrow("database security settings read failed");
  });
});
