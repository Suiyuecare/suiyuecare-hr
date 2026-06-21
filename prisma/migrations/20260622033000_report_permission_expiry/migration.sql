ALTER TABLE "ReportPermission"
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "ReportPermission_tenantId_companyId_expiresAt_idx"
  ON "ReportPermission"("tenantId", "companyId", "expiresAt");
