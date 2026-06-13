-- CreateTable
CREATE TABLE "AuditEvidencePackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageType" TEXT NOT NULL DEFAULT 'labor_inspection',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "recordCount" INTEGER NOT NULL,
    "coveredEntityTypes" JSONB NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "warningsJson" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "generatedByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvidencePackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvidencePackage_tenantId_companyId_packageType_generatedAt_idx" ON "AuditEvidencePackage"("tenantId", "companyId", "packageType", "generatedAt");

-- CreateIndex
CREATE INDEX "AuditEvidencePackage_tenantId_companyId_periodStart_periodEnd_idx" ON "AuditEvidencePackage"("tenantId", "companyId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "AuditEvidencePackage" ADD CONSTRAINT "AuditEvidencePackage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
