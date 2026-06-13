-- Statutory insurance enrollment and withdrawal evidence.
CREATE TABLE "StatutoryInsuranceRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "insuranceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "enrolledAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "evidenceRef" TEXT,
    "evidenceHash" TEXT,
    "exemptionReason" TEXT,
    "notesHash" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatutoryInsuranceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StatutoryInsuranceRecord_companyId_employeeId_insuranceType_key" ON "StatutoryInsuranceRecord"("companyId", "employeeId", "insuranceType");
CREATE INDEX "StatutoryInsuranceRecord_tenantId_companyId_status_idx" ON "StatutoryInsuranceRecord"("tenantId", "companyId", "status");
CREATE INDEX "StatutoryInsuranceRecord_tenantId_companyId_dueDate_idx" ON "StatutoryInsuranceRecord"("tenantId", "companyId", "dueDate");
CREATE INDEX "StatutoryInsuranceRecord_tenantId_companyId_employeeId_idx" ON "StatutoryInsuranceRecord"("tenantId", "companyId", "employeeId");

ALTER TABLE "StatutoryInsuranceRecord" ADD CONSTRAINT "StatutoryInsuranceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatutoryInsuranceRecord" ADD CONSTRAINT "StatutoryInsuranceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
