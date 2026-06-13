-- Store employee-specific payroll compliance settings separately from salary amounts.
CREATE TABLE "PayrollComplianceProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxResidency" TEXT NOT NULL DEFAULT 'resident',
    "dependentCount" INTEGER NOT NULL DEFAULT 0,
    "laborInsuranceMonthlyWage" DECIMAL(12,2),
    "healthInsuranceMonthlyWage" DECIMAL(12,2),
    "laborPensionMonthlyWage" DECIMAL(12,2),
    "incomeTaxWithholdingMethod" TEXT NOT NULL DEFAULT 'annualized_progressive',
    "nonResidentWithholdingRate" DECIMAL(5,4),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollComplianceProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollComplianceProfile_tenantId_companyId_employeeId_idx"
    ON "PayrollComplianceProfile"("tenantId", "companyId", "employeeId");

CREATE INDEX "PayrollComplianceProfile_tenantId_companyId_taxResidency_idx"
    ON "PayrollComplianceProfile"("tenantId", "companyId", "taxResidency");

ALTER TABLE "PayrollComplianceProfile"
    ADD CONSTRAINT "PayrollComplianceProfile_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollComplianceProfile"
    ADD CONSTRAINT "PayrollComplianceProfile_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
