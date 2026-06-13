-- CreateTable
CREATE TABLE "CompanyPrivacySetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL DEFAULT '2026.01',
    "consentTitle" TEXT NOT NULL,
    "consentBody" TEXT NOT NULL,
    "collectionPurpose" TEXT NOT NULL,
    "requiresEmployeeAcknowledgement" BOOLEAN NOT NULL DEFAULT true,
    "dataRetentionYears" INTEGER NOT NULL DEFAULT 7,
    "dataSubjectRequestResponseDays" INTEGER NOT NULL DEFAULT 30,
    "deletionReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "crossBorderTransferEnabled" BOOLEAN NOT NULL DEFAULT false,
    "subprocessorsJson" JSONB NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "lastReviewedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPrivacySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePrivacyConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentTitle" TEXT NOT NULL,
    "policyHash" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'self_service',
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeePrivacyConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "summary" TEXT NOT NULL,
    "resolutionNote" TEXT,
    "requestedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPrivacySetting_companyId_key" ON "CompanyPrivacySetting"("companyId");

-- CreateIndex
CREATE INDEX "CompanyPrivacySetting_tenantId_companyId_idx" ON "CompanyPrivacySetting"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "CompanyPrivacySetting_tenantId_companyId_verificationStatus_idx" ON "CompanyPrivacySetting"("tenantId", "companyId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePrivacyConsent_employeeId_consentVersion_key" ON "EmployeePrivacyConsent"("employeeId", "consentVersion");

-- CreateIndex
CREATE INDEX "EmployeePrivacyConsent_tenantId_companyId_consentVersion_idx" ON "EmployeePrivacyConsent"("tenantId", "companyId", "consentVersion");

-- CreateIndex
CREATE INDEX "EmployeePrivacyConsent_tenantId_companyId_employeeId_idx" ON "EmployeePrivacyConsent"("tenantId", "companyId", "employeeId");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_tenantId_companyId_status_idx" ON "DataSubjectRequest"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_tenantId_companyId_employeeId_idx" ON "DataSubjectRequest"("tenantId", "companyId", "employeeId");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_tenantId_companyId_dueAt_idx" ON "DataSubjectRequest"("tenantId", "companyId", "dueAt");

-- AddForeignKey
ALTER TABLE "CompanyPrivacySetting" ADD CONSTRAINT "CompanyPrivacySetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePrivacyConsent" ADD CONSTRAINT "EmployeePrivacyConsent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePrivacyConsent" ADD CONSTRAINT "EmployeePrivacyConsent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
