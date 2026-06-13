-- Payroll payment destination secrets must live in an external token vault.
-- HR One stores only references, verification posture, hashes, and masked profile data.
CREATE TABLE "CompanyPayrollPaymentSecuritySetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenVaultProvider" TEXT NOT NULL DEFAULT 'not_configured',
    "tokenVaultRef" TEXT,
    "kmsKeyRef" TEXT,
    "bankFileFormat" TEXT NOT NULL DEFAULT 'tw_bank_csv_placeholder',
    "bankFormatVersion" TEXT NOT NULL DEFAULT 'v1',
    "bankFormatVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPayrollPaymentSecuritySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyPayrollPaymentSecuritySetting_companyId_key" ON "CompanyPayrollPaymentSecuritySetting"("companyId");
CREATE INDEX "CompanyPayrollPaymentSecuritySetting_tenantId_companyId_idx" ON "CompanyPayrollPaymentSecuritySetting"("tenantId", "companyId");

ALTER TABLE "CompanyPayrollPaymentSecuritySetting"
ADD CONSTRAINT "CompanyPayrollPaymentSecuritySetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
