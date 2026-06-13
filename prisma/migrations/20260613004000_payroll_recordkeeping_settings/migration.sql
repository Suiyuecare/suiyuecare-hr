CREATE TABLE "CompanyPayrollRecordkeepingSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "wageRosterRetentionDays" INTEGER NOT NULL DEFAULT 1825,
    "employeePayslipEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wageCalculationDetailsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "laborInspectionExportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPayrollRecordkeepingSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyPayrollRecordkeepingSetting_companyId_key"
    ON "CompanyPayrollRecordkeepingSetting"("companyId");

CREATE INDEX "CompanyPayrollRecordkeepingSetting_tenantId_companyId_idx"
    ON "CompanyPayrollRecordkeepingSetting"("tenantId", "companyId");

ALTER TABLE "CompanyPayrollRecordkeepingSetting"
    ADD CONSTRAINT "CompanyPayrollRecordkeepingSetting_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
