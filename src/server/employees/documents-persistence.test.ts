import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-employee", displayName: "Employee" },
  employee: { id: "employee-1", displayName: "Employee" },
};

const reservation = {
  storageKey: "s3://hrone-documents/prod/hr/tenant-1/company-1/employees/employee-1/contract/doc-id/contract.pdf",
  storageProvider: "s3" as const,
  storageBucket: "hrone-documents",
  objectKey: "prod/hr/tenant-1/company-1/employees/employee-1/contract/doc-id/contract.pdf",
  checksumSha256: null,
  malwareScanStatus: "pending" as const,
  encryptionMode: "kms" as const,
  retentionUntil: new Date("2030-01-01T00:00:00.000Z"),
  downloadAuditRequired: true,
};

describe("employee documents persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
    vi.doUnmock("@/server/files/storage");
  });

  it("does not fall back to demo documents when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/files/storage", () => ({
      getFileStorageSettings: vi.fn(async () => ({
        provider: "s3",
        bucketName: "hrone-documents",
        region: "ap-northeast-1",
        basePrefix: "prod/hr",
        kmsKeyRef: "alias/hr-one-documents",
        malwareScanningRequired: true,
        signedUrlTtlMinutes: 5,
        maxFileSizeMb: 25,
        allowedMimeTypes: ["application/pdf"],
        retentionDays: 2555,
        verificationStatus: "verified",
        lastVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        verificationNote: "verified",
      })),
      reserveObjectForUpload: vi.fn(async () => reservation),
    }));
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findMany: vi.fn(async () => {
            throw new Error("database employee document read failed");
          }),
          findFirst: vi.fn(async () => {
            throw new Error("database employee document create failed");
          }),
        },
        employeeDocument: {
          findMany: vi.fn(async () => {
            throw new Error("database employee document read failed");
          }),
        },
      }),
    }));

    const {
      createEmployeeDocument,
      getEmployeeDocumentWorkspace,
      getOwnEmployeeDocuments,
    } = await import("./documents");

    await expect(getEmployeeDocumentWorkspace(hrSession)).rejects.toThrow(
      "database employee document read failed",
    );
    await expect(getOwnEmployeeDocuments(employeeSession)).rejects.toThrow(
      "database employee document read failed",
    );
    await expect(
      createEmployeeDocument(hrSession, {
        employeeId: "employee-1",
        category: "contract",
        title: "Employment contract",
        fileName: "contract.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        visibleToEmployee: true,
      }),
    ).rejects.toThrow("database employee document create failed");
  });
});
