-- HR-reviewed unused annual leave settlement drafts for payroll close.
ALTER TABLE "LeaveBalance"
    ADD COLUMN "settledUnits" DECIMAL(8,2) NOT NULL DEFAULT 0;

ALTER TABLE "LeaveBalance"
    ADD COLUMN "carryoverUnits" DECIMAL(8,2) NOT NULL DEFAULT 0,
    ADD COLUMN "carryoverUsedUnits" DECIMAL(8,2) NOT NULL DEFAULT 0,
    ADD COLUMN "currentYearUnits" DECIMAL(8,2) NOT NULL DEFAULT 0,
    ADD COLUMN "currentYearUsedUnits" DECIMAL(8,2) NOT NULL DEFAULT 0;

CREATE TABLE "AnnualLeaveSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveBalanceId" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'year_end',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "unusedUnits" DECIMAL(8,2) NOT NULL,
    "dailyRegularWage" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "carriedFromPreviousYear" BOOLEAN NOT NULL DEFAULT false,
    "sourceYearStart" TIMESTAMP(3),
    "sourceYearEnd" TIMESTAMP(3),
    "sourceRuleIdsJson" JSONB NOT NULL,
    "preparedByUserId" TEXT,
    "includedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualLeaveSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnnualLeaveSettlement_payrollRunId_employeeId_reason_key"
    ON "AnnualLeaveSettlement"("payrollRunId", "employeeId", "reason");

CREATE INDEX "AnnualLeaveSettlement_tenantId_companyId_payrollRunId_status_idx"
    ON "AnnualLeaveSettlement"("tenantId", "companyId", "payrollRunId", "status");

CREATE INDEX "AnnualLeaveSettlement_tenantId_companyId_employeeId_idx"
    ON "AnnualLeaveSettlement"("tenantId", "companyId", "employeeId");

ALTER TABLE "AnnualLeaveSettlement"
    ADD CONSTRAINT "AnnualLeaveSettlement_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualLeaveSettlement"
    ADD CONSTRAINT "AnnualLeaveSettlement_payrollRunId_fkey"
    FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualLeaveSettlement"
    ADD CONSTRAINT "AnnualLeaveSettlement_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualLeaveSettlement"
    ADD CONSTRAINT "AnnualLeaveSettlement_leaveBalanceId_fkey"
    FOREIGN KEY ("leaveBalanceId") REFERENCES "LeaveBalance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
