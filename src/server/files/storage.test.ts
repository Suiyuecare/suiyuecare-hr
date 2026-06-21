import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getFileStorageSettings,
  isProductionStorageVerified,
  reserveObjectForUpload,
  resetFileStorageDemoState,
  updateFileStorageSettings,
} from "./storage";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王老闆" },
  employee: null,
};

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("file storage settings", () => {
  beforeEach(() => {
    resetFileStorageDemoState();
    resetAuditDemoState();
  });

  it("updates storage settings with audit trail and no object bytes", async () => {
    const updated = await updateFileStorageSettings(ownerSession, {
      provider: "s3",
      bucketName: "hrone-prod-docs",
      region: "ap-northeast-1",
      basePrefix: "tenant-a/hr",
      kmsKeyRef: "alias/hr-one-documents",
      lifecyclePolicyRef: "s3://hrone-prod-docs?lifecycle=hr-documents-7y",
      malwareScanningRequired: true,
      signedUrlTtlMinutes: 5,
      maxFileSizeMb: 10,
      allowedMimeTypes: ["application/pdf", "image/png", "application/pdf"],
      retentionDays: 3650,
      verificationStatus: "verified",
      verificationNote: "External provider smoke test passed.",
    });
    const settings = await getFileStorageSettings(hrSession);

    expect(updated).toMatchObject({
      provider: "s3",
      bucketName: "hrone-prod-docs",
      basePrefix: "tenant-a/hr",
      lifecyclePolicyRef: "s3://hrone-prod-docs?lifecycle=hr-documents-7y",
      allowedMimeTypes: ["application/pdf", "image/png"],
      verificationStatus: "verified",
      verificationNote: "External provider smoke test passed.",
    });
    expect(updated.lastVerifiedAt).toBeInstanceOf(Date);
    expect(isProductionStorageVerified(updated)).toBe(true);
    expect(settings).toEqual(updated);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "file_storage_settings",
    });
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      objectBytesIncluded: false,
      malwareScanningRequired: true,
      providerChanged: true,
      verificationStatus: "verified",
    });
  });

  it("reserves object keys using configured storage policy", async () => {
    await updateFileStorageSettings(ownerSession, {
      provider: "r2",
      bucketName: "hrone-documents",
      basePrefix: "prod/hr",
      kmsKeyRef: "kms-ref",
      lifecyclePolicyRef: "r2://hrone-documents/lifecycle/hr-documents-30d",
      maxFileSizeMb: 1,
      allowedMimeTypes: ["application/pdf"],
      retentionDays: 30,
    });

    const reservation = await reserveObjectForUpload(hrSession, {
      employeeId: "demo-employee-1",
      category: "contract",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 500000,
    });

    expect(reservation).toMatchObject({
      storageProvider: "r2",
      storageBucket: "hrone-documents",
      malwareScanStatus: "pending",
      encryptionMode: "kms",
      downloadAuditRequired: true,
    });
    expect(reservation.storageKey).toContain("r2://hrone-documents/prod/hr/demo-tenant/demo-company/employees");
    await expect(
      reserveObjectForUpload(hrSession, {
        employeeId: "demo-employee-1",
        category: "contract",
        fileName: "contract.exe",
        mimeType: "application/x-msdownload",
        fileSizeBytes: 500,
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it("blocks managers from storage administration", async () => {
    await expect(
      updateFileStorageSettings(managerSession, {
        provider: "s3",
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
