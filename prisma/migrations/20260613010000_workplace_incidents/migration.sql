-- CreateTable
CREATE TABLE "CompanyIncidentSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "anonymousReportingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "severeIncidentNotifyHours" INTEGER NOT NULL DEFAULT 8,
    "investigationTargetDays" INTEGER NOT NULL DEFAULT 7,
    "harassmentPolicyVersion" TEXT NOT NULL DEFAULT '2026.01',
    "safetyPolicyVersion" TEXT NOT NULL DEFAULT '2026.01',
    "authorityReportRequired" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "lastReviewedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyIncidentSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkplaceIncident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reporterEmployeeId" TEXT,
    "incidentType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "location" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "authorityReportNeeded" BOOLEAN NOT NULL DEFAULT false,
    "authorityReportDueAt" TIMESTAMP(3),
    "authorityReportedAt" TIMESTAMP(3),
    "investigationDueAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "correctiveAction" TEXT,
    "reportedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkplaceIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyIncidentSetting_companyId_key" ON "CompanyIncidentSetting"("companyId");

-- CreateIndex
CREATE INDEX "CompanyIncidentSetting_tenantId_companyId_idx" ON "CompanyIncidentSetting"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "CompanyIncidentSetting_tenantId_companyId_verificationStatus_idx" ON "CompanyIncidentSetting"("tenantId", "companyId", "verificationStatus");

-- CreateIndex
CREATE INDEX "WorkplaceIncident_tenantId_companyId_status_idx" ON "WorkplaceIncident"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "WorkplaceIncident_tenantId_companyId_incidentType_idx" ON "WorkplaceIncident"("tenantId", "companyId", "incidentType");

-- CreateIndex
CREATE INDEX "WorkplaceIncident_tenantId_companyId_investigationDueAt_idx" ON "WorkplaceIncident"("tenantId", "companyId", "investigationDueAt");

-- CreateIndex
CREATE INDEX "WorkplaceIncident_tenantId_companyId_authorityReportDueAt_idx" ON "WorkplaceIncident"("tenantId", "companyId", "authorityReportDueAt");

-- AddForeignKey
ALTER TABLE "CompanyIncidentSetting" ADD CONSTRAINT "CompanyIncidentSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkplaceIncident" ADD CONSTRAINT "WorkplaceIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkplaceIncident" ADD CONSTRAINT "WorkplaceIncident_reporterEmployeeId_fkey" FOREIGN KEY ("reporterEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
