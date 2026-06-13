CREATE TABLE "EmployeeEmploymentTerm" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "jobTitle" TEXT NOT NULL,
  "workLocation" TEXT NOT NULL,
  "regularWorkSchedule" TEXT NOT NULL,
  "wagePaymentDay" TEXT NOT NULL,
  "wageBasisSummaryHash" TEXT NOT NULL,
  "benefitsSummary" TEXT NOT NULL,
  "sourceRef" TEXT,
  "acknowledgementRequired" BOOLEAN NOT NULL DEFAULT true,
  "acknowledgementHash" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeEmploymentTerm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeEmploymentTerm_employeeId_version_key" ON "EmployeeEmploymentTerm"("employeeId", "version");
CREATE INDEX "EmployeeEmploymentTerm_tenantId_companyId_status_idx" ON "EmployeeEmploymentTerm"("tenantId", "companyId", "status");
CREATE INDEX "EmployeeEmploymentTerm_tenantId_companyId_employeeId_idx" ON "EmployeeEmploymentTerm"("tenantId", "companyId", "employeeId");
CREATE INDEX "EmployeeEmploymentTerm_tenantId_companyId_acknowledgedAt_idx" ON "EmployeeEmploymentTerm"("tenantId", "companyId", "acknowledgedAt");

ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
