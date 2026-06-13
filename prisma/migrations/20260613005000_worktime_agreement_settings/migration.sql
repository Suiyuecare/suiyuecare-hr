-- CreateTable
CREATE TABLE "CompanyWorktimeAgreementSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "approvalType" TEXT NOT NULL DEFAULT 'labor_management_conference',
    "approvalOnFile" BOOLEAN NOT NULL DEFAULT false,
    "evidenceRef" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "monthlyOvertimeLimitMinutes" INTEGER NOT NULL DEFAULT 2760,
    "threeMonthOvertimeLimitMinutes" INTEGER NOT NULL DEFAULT 8280,
    "localAuthorityReportRequired" BOOLEAN NOT NULL DEFAULT false,
    "localAuthorityReportFiled" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "verificationNote" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyWorktimeAgreementSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyWorktimeAgreementSetting_companyId_key" ON "CompanyWorktimeAgreementSetting"("companyId");

-- CreateIndex
CREATE INDEX "CompanyWorktimeAgreementSetting_tenantId_companyId_idx" ON "CompanyWorktimeAgreementSetting"("tenantId", "companyId");

-- AddForeignKey
ALTER TABLE "CompanyWorktimeAgreementSetting" ADD CONSTRAINT "CompanyWorktimeAgreementSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
