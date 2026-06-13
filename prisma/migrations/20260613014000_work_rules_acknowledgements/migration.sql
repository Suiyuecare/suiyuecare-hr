CREATE TABLE "CompanyWorkRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending_review',
  "sourceRef" TEXT,
  "contentHash" TEXT NOT NULL,
  "acknowledgementRequired" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyWorkRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeWorkRuleAcknowledgement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workRuleId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "acknowledgementHash" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'employee_self_service',
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeWorkRuleAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyWorkRule_tenantId_companyId_status_idx" ON "CompanyWorkRule"("tenantId", "companyId", "status");
CREATE INDEX "CompanyWorkRule_tenantId_companyId_reviewStatus_idx" ON "CompanyWorkRule"("tenantId", "companyId", "reviewStatus");
CREATE INDEX "CompanyWorkRule_tenantId_companyId_acknowledgementRequired_idx" ON "CompanyWorkRule"("tenantId", "companyId", "acknowledgementRequired");

CREATE UNIQUE INDEX "EmployeeWorkRuleAcknowledgement_employeeId_workRuleId_key" ON "EmployeeWorkRuleAcknowledgement"("employeeId", "workRuleId");
CREATE INDEX "EmployeeWorkRuleAcknowledgement_tenantId_companyId_employeeId_idx" ON "EmployeeWorkRuleAcknowledgement"("tenantId", "companyId", "employeeId");
CREATE INDEX "EmployeeWorkRuleAcknowledgement_tenantId_companyId_workRuleId_idx" ON "EmployeeWorkRuleAcknowledgement"("tenantId", "companyId", "workRuleId");

ALTER TABLE "CompanyWorkRule" ADD CONSTRAINT "CompanyWorkRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkRuleAcknowledgement" ADD CONSTRAINT "EmployeeWorkRuleAcknowledgement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkRuleAcknowledgement" ADD CONSTRAINT "EmployeeWorkRuleAcknowledgement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkRuleAcknowledgement" ADD CONSTRAINT "EmployeeWorkRuleAcknowledgement_workRuleId_fkey" FOREIGN KEY ("workRuleId") REFERENCES "CompanyWorkRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
