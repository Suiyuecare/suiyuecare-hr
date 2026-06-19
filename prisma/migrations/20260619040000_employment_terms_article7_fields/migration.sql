ALTER TABLE "EmployeeEmploymentTerm"
ADD COLUMN "contractLifecycleSummaryHash" TEXT,
ADD COLUMN "severancePensionBonusSummaryHash" TEXT,
ADD COLUMN "mealLodgingToolCostSummaryHash" TEXT,
ADD COLUMN "safetyHealthSummaryHash" TEXT,
ADD COLUMN "trainingSummaryHash" TEXT,
ADD COLUMN "disasterCompensationSicknessSummaryHash" TEXT,
ADD COLUMN "disciplineSummaryHash" TEXT,
ADD COLUMN "rewardDisciplineSummaryHash" TEXT,
ADD COLUMN "rightsObligationsSummaryHash" TEXT;

UPDATE "EmployeeEmploymentTerm"
SET
  "status" = 'draft',
  "acknowledgementHash" = NULL,
  "acknowledgedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'active';
