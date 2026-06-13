-- Company-level payroll accounting mappings for export packages.
CREATE TABLE "CompanyPayrollAccountingSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "grossPayrollDebitAccountCode" TEXT NOT NULL,
    "grossPayrollDebitAccountName" TEXT NOT NULL,
    "employerContributionDebitAccountCode" TEXT NOT NULL,
    "employerContributionDebitAccountName" TEXT NOT NULL,
    "deductionCreditAccountCode" TEXT NOT NULL,
    "deductionCreditAccountName" TEXT NOT NULL,
    "netPayableCreditAccountCode" TEXT NOT NULL,
    "netPayableCreditAccountName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPayrollAccountingSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyPayrollAccountingSetting_companyId_key"
    ON "CompanyPayrollAccountingSetting"("companyId");

CREATE INDEX "CompanyPayrollAccountingSetting_tenantId_companyId_idx"
    ON "CompanyPayrollAccountingSetting"("tenantId", "companyId");

ALTER TABLE "CompanyPayrollAccountingSetting"
    ADD CONSTRAINT "CompanyPayrollAccountingSetting_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
