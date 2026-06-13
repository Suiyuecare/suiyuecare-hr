ALTER TABLE "AttendanceException"
  ADD COLUMN "resolutionCode" TEXT,
  ADD COLUMN "resolutionEvidenceHash" TEXT,
  ADD COLUMN "resolvedByUserId" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "AttendanceException_tenantId_companyId_resolvedAt_idx" ON "AttendanceException"("tenantId", "companyId", "resolvedAt");
