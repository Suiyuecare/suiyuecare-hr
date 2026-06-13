-- Company file storage settings and secure object metadata for HR documents.
CREATE TABLE "CompanyFileStorageSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "region" TEXT,
    "basePrefix" TEXT NOT NULL,
    "kmsKeyRef" TEXT,
    "malwareScanningRequired" BOOLEAN NOT NULL DEFAULT true,
    "signedUrlTtlMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxFileSizeMb" INTEGER NOT NULL DEFAULT 25,
    "allowedMimeTypesJson" JSONB NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 2555,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFileStorageSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyFileStorageSetting_companyId_key"
    ON "CompanyFileStorageSetting"("companyId");

CREATE INDEX "CompanyFileStorageSetting_tenantId_companyId_idx"
    ON "CompanyFileStorageSetting"("tenantId", "companyId");

ALTER TABLE "CompanyFileStorageSetting"
    ADD CONSTRAINT "CompanyFileStorageSetting_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeDocument"
    ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'demo_object_storage',
    ADD COLUMN "storageBucket" TEXT,
    ADD COLUMN "objectKey" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "checksumSha256" TEXT,
    ADD COLUMN "malwareScanStatus" TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN "encryptionMode" TEXT NOT NULL DEFAULT 'provider_managed',
    ADD COLUMN "retentionUntil" TIMESTAMP(3),
    ADD COLUMN "downloadAuditRequired" BOOLEAN NOT NULL DEFAULT true;

UPDATE "EmployeeDocument"
SET "objectKey" = "storageKey"
WHERE "objectKey" = '';
