-- Employee termination offboarding task evidence.
CREATE TABLE "EmployeeOffboardingTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "lifecycleEventId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "evidenceRef" TEXT,
    "evidenceHash" TEXT,
    "notesHash" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeOffboardingTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeOffboardingTask_companyId_lifecycleEventId_taskType_key" ON "EmployeeOffboardingTask"("companyId", "lifecycleEventId", "taskType");
CREATE INDEX "EmployeeOffboardingTask_tenantId_companyId_status_idx" ON "EmployeeOffboardingTask"("tenantId", "companyId", "status");
CREATE INDEX "EmployeeOffboardingTask_tenantId_companyId_dueDate_idx" ON "EmployeeOffboardingTask"("tenantId", "companyId", "dueDate");
CREATE INDEX "EmployeeOffboardingTask_tenantId_companyId_employeeId_idx" ON "EmployeeOffboardingTask"("tenantId", "companyId", "employeeId");

ALTER TABLE "EmployeeOffboardingTask" ADD CONSTRAINT "EmployeeOffboardingTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeOffboardingTask" ADD CONSTRAINT "EmployeeOffboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeOffboardingTask" ADD CONSTRAINT "EmployeeOffboardingTask_lifecycleEventId_fkey" FOREIGN KEY ("lifecycleEventId") REFERENCES "EmployeeLifecycleEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
