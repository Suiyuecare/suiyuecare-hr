-- Effective-dated employee lifecycle events for transfers, promotions, leave, return, and termination.
CREATE TABLE "EmployeeLifecycleEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "previousDepartmentId" TEXT,
    "nextDepartmentId" TEXT,
    "previousJobTitle" TEXT,
    "nextJobTitle" TEXT,
    "previousStatus" "EmploymentStatus",
    "nextStatus" "EmploymentStatus",
    "metadataJson" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeLifecycleEvent_tenantId_companyId_employeeId_idx"
    ON "EmployeeLifecycleEvent"("tenantId", "companyId", "employeeId");

CREATE INDEX "EmployeeLifecycleEvent_tenantId_companyId_eventType_idx"
    ON "EmployeeLifecycleEvent"("tenantId", "companyId", "eventType");

CREATE INDEX "EmployeeLifecycleEvent_tenantId_companyId_effectiveDate_idx"
    ON "EmployeeLifecycleEvent"("tenantId", "companyId", "effectiveDate");

ALTER TABLE "EmployeeLifecycleEvent"
    ADD CONSTRAINT "EmployeeLifecycleEvent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeLifecycleEvent"
    ADD CONSTRAINT "EmployeeLifecycleEvent_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
