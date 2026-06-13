CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "regularDailyMinutes" INTEGER NOT NULL DEFAULT 540,
    "overtimeWarningDailyMinutes" INTEGER NOT NULL DEFAULT 720,
    "clockInGraceMinutes" INTEGER NOT NULL DEFAULT 5,
    "clockOutGraceMinutes" INTEGER NOT NULL DEFAULT 5,
    "requireOvertimeApproval" BOOLEAN NOT NULL DEFAULT true,
    "requirePunchCorrectionApproval" BOOLEAN NOT NULL DEFAULT true,
    "allowMobilePunch" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendancePolicy_tenantId_companyId_status_idx" ON "AttendancePolicy"("tenantId", "companyId", "status");
CREATE INDEX "AttendancePolicy_tenantId_companyId_effectiveFrom_idx" ON "AttendancePolicy"("tenantId", "companyId", "effectiveFrom");

ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
