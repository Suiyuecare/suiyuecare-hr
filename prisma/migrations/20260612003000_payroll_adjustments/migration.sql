-- Explicit adjustment flow for locked/released payroll runs.
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "appliedItemId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollAdjustment_tenantId_companyId_payrollRunId_idx"
    ON "PayrollAdjustment"("tenantId", "companyId", "payrollRunId");

CREATE INDEX "PayrollAdjustment_tenantId_companyId_employeeId_idx"
    ON "PayrollAdjustment"("tenantId", "companyId", "employeeId");

CREATE INDEX "PayrollAdjustment_tenantId_companyId_status_idx"
    ON "PayrollAdjustment"("tenantId", "companyId", "status");

ALTER TABLE "PayrollAdjustment"
    ADD CONSTRAINT "PayrollAdjustment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollAdjustment"
    ADD CONSTRAINT "PayrollAdjustment_payrollRunId_fkey"
    FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollAdjustment"
    ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
