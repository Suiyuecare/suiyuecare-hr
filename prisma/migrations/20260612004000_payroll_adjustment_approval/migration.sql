ALTER TABLE "PayrollAdjustment" ALTER COLUMN "status" SET DEFAULT 'pending';

ALTER TABLE "PayrollAdjustment" ADD COLUMN "decidedByUserId" TEXT;
ALTER TABLE "PayrollAdjustment" ADD COLUMN "decidedAt" TIMESTAMP(3);
ALTER TABLE "PayrollAdjustment" ADD COLUMN "decisionComment" TEXT;
