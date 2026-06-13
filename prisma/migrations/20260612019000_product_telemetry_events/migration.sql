CREATE TABLE "ProductTelemetryEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmployeeId" TEXT,
  "eventName" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "durationMs" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductTelemetryEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductTelemetryEvent"
ADD CONSTRAINT "ProductTelemetryEvent_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProductTelemetryEvent_tenantId_companyId_workflow_step_idx"
ON "ProductTelemetryEvent"("tenantId", "companyId", "workflow", "step");

CREATE INDEX "ProductTelemetryEvent_tenantId_companyId_eventName_idx"
ON "ProductTelemetryEvent"("tenantId", "companyId", "eventName");

CREATE INDEX "ProductTelemetryEvent_tenantId_companyId_occurredAt_idx"
ON "ProductTelemetryEvent"("tenantId", "companyId", "occurredAt");
