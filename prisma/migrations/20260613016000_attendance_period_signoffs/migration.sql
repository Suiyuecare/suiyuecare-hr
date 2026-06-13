CREATE TABLE "AttendancePeriodSignoff" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "recordCount" INTEGER NOT NULL,
  "exceptionCount" INTEGER NOT NULL,
  "summaryHash" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'employee_self_service',
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttendancePeriodSignoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendancePeriodSignoff_employeeId_periodStart_key" ON "AttendancePeriodSignoff"("employeeId", "periodStart");
CREATE INDEX "AttendancePeriodSignoff_tenantId_companyId_periodStart_idx" ON "AttendancePeriodSignoff"("tenantId", "companyId", "periodStart");
CREATE INDEX "AttendancePeriodSignoff_tenantId_companyId_signedAt_idx" ON "AttendancePeriodSignoff"("tenantId", "companyId", "signedAt");

ALTER TABLE "AttendancePeriodSignoff" ADD CONSTRAINT "AttendancePeriodSignoff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePeriodSignoff" ADD CONSTRAINT "AttendancePeriodSignoff_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
