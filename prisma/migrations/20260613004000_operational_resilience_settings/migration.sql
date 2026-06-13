CREATE TABLE "CompanyOperationalResilienceSetting" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "backupProvider" TEXT NOT NULL DEFAULT 'not_configured',
  "backupRegion" TEXT,
  "backupSchedule" TEXT NOT NULL DEFAULT 'daily',
  "backupRetentionDays" INTEGER NOT NULL DEFAULT 0,
  "backupEncryptionKeyRef" TEXT,
  "backupEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastBackupCompletedAt" TIMESTAMP(3),
  "restoreDrillTestedAt" TIMESTAMP(3),
  "restoreDrillStatus" TEXT NOT NULL DEFAULT 'not_tested',
  "restoreDrillTicket" TEXT,
  "recoveryTimeObjectiveHours" INTEGER NOT NULL DEFAULT 24,
  "recoveryPointObjectiveHours" INTEGER NOT NULL DEFAULT 24,
  "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
  "verificationNote" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyOperationalResilienceSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyOperationalResilienceSetting_companyId_key" ON "CompanyOperationalResilienceSetting"("companyId");
CREATE INDEX "CompanyOperationalResilienceSetting_tenantId_companyId_idx" ON "CompanyOperationalResilienceSetting"("tenantId", "companyId");
CREATE INDEX "CompanyOperationalResilienceSetting_tenantId_companyId_verificationStatus_idx" ON "CompanyOperationalResilienceSetting"("tenantId", "companyId", "verificationStatus");

ALTER TABLE "CompanyOperationalResilienceSetting"
  ADD CONSTRAINT "CompanyOperationalResilienceSetting_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
