ALTER TABLE "EmployeeLaborRosterProfile"
ADD COLUMN "hometown" TEXT,
ADD COLUMN "wageInfoHash" TEXT,
ADD COLUMN "laborInsuranceEnrollmentDate" TIMESTAMP(3),
ADD COLUMN "rewardDisciplineSummaryHash" TEXT,
ADD COLUMN "injurySicknessSummaryHash" TEXT,
ADD COLUMN "otherNecessaryItemsHash" TEXT;

UPDATE "EmployeeLaborRosterProfile"
SET
  "status" = 'incomplete',
  "missingFieldsJson" = (
    COALESCE("missingFieldsJson", '[]'::jsonb)
    || '["hometown","wage_info","labor_insurance_enrollment_date","reward_discipline_summary","injury_sickness_summary","other_necessary_items"]'::jsonb
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'complete';
