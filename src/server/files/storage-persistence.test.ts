import { afterEach, describe, expect, it, vi } from "vitest";

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-owner", displayName: "Owner" },
  employee: null,
};

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("file storage settings persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo storage when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyFileStorageSetting: {
          findUnique: vi.fn(async () => {
            throw new Error("database file storage settings read failed");
          }),
        },
      }),
    }));

    const {
      getFileStorageSettings,
      reserveObjectForUpload,
      updateFileStorageSettings,
    } = await import("./storage");

    await expect(getFileStorageSettings(hrSession)).rejects.toThrow(
      "database file storage settings read failed",
    );
    await expect(
      updateFileStorageSettings(ownerSession, {
        provider: "s3",
      }),
    ).rejects.toThrow("database file storage settings read failed");
    await expect(
      reserveObjectForUpload(hrSession, {
        employeeId: "employee-1",
        fileName: "contract.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        category: "contract",
      }),
    ).rejects.toThrow("database file storage settings read failed");
  });
});
