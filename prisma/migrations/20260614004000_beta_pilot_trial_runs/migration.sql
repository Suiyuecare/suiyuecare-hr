CREATE TABLE "BetaPilotTrialRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "targetEmployeeMin" INTEGER NOT NULL DEFAULT 20,
  "targetEmployeeMax" INTEGER NOT NULL DEFAULT 50,
  "expectedEmployeeCount" INTEGER NOT NULL,
  "managerCount" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "completedByUserId" TEXT,
  "latestReadinessStatus" TEXT NOT NULL DEFAULT 'not_started',
  "openBlockedCount" INTEGER NOT NULL DEFAULT 0,
  "openActionRequiredCount" INTEGER NOT NULL DEFAULT 0,
  "evidenceSummaryHash" TEXT,
  "notesHash" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BetaPilotTrialRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BetaPilotTrialEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "trialRunId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "checkpointId" TEXT,
  "status" TEXT NOT NULL,
  "dayNumber" INTEGER,
  "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidenceRefHash" TEXT,
  "summaryHash" TEXT,
  "metadataJson" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BetaPilotTrialEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BetaPilotTrialRun_tenantId_companyId_status_idx"
  ON "BetaPilotTrialRun"("tenantId", "companyId", "status");

CREATE INDEX "BetaPilotTrialRun_tenantId_companyId_startsAt_idx"
  ON "BetaPilotTrialRun"("tenantId", "companyId", "startsAt");

CREATE INDEX "BetaPilotTrialRun_tenantId_companyId_endsAt_idx"
  ON "BetaPilotTrialRun"("tenantId", "companyId", "endsAt");

CREATE INDEX "BetaPilotTrialEvent_tenantId_companyId_trialRunId_idx"
  ON "BetaPilotTrialEvent"("tenantId", "companyId", "trialRunId");

CREATE INDEX "BetaPilotTrialEvent_tenantId_companyId_checkpointId_idx"
  ON "BetaPilotTrialEvent"("tenantId", "companyId", "checkpointId");

CREATE INDEX "BetaPilotTrialEvent_tenantId_companyId_eventType_idx"
  ON "BetaPilotTrialEvent"("tenantId", "companyId", "eventType");

CREATE INDEX "BetaPilotTrialEvent_tenantId_companyId_eventAt_idx"
  ON "BetaPilotTrialEvent"("tenantId", "companyId", "eventAt");

ALTER TABLE "BetaPilotTrialRun"
  ADD CONSTRAINT "BetaPilotTrialRun_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BetaPilotTrialEvent"
  ADD CONSTRAINT "BetaPilotTrialEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BetaPilotTrialEvent"
  ADD CONSTRAINT "BetaPilotTrialEvent_trialRunId_fkey"
  FOREIGN KEY ("trialRunId") REFERENCES "BetaPilotTrialRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
