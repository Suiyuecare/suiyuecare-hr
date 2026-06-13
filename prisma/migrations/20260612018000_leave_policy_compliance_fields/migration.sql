ALTER TABLE "LeavePolicy"
ADD COLUMN "statutoryCategory" TEXT NOT NULL DEFAULT 'company',
ADD COLUMN "eligibilityRule" TEXT NOT NULL DEFAULT 'all_employees',
ADD COLUMN "payRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
ADD COLUMN "annualLimitNote" TEXT,
ADD COLUMN "requiresLegalReview" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "LeavePolicy_tenantId_companyId_statutoryCategory_idx"
ON "LeavePolicy"("tenantId", "companyId", "statutoryCategory");
