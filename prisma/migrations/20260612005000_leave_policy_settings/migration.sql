ALTER TABLE "LeavePolicy" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "LeavePolicy" ADD COLUMN "accrualMethod" TEXT NOT NULL DEFAULT 'annual_grant';
ALTER TABLE "LeavePolicy" ADD COLUMN "minNoticeDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeavePolicy" ADD COLUMN "carryoverLimitUnits" DECIMAL(8,2);
ALTER TABLE "LeavePolicy" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeavePolicy" ADD COLUMN "syncBalancesOnUpdate" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "LeavePolicy_tenantId_companyId_status_idx" ON "LeavePolicy"("tenantId", "companyId", "status");
