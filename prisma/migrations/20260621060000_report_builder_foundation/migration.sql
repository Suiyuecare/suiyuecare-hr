CREATE TABLE "ReportDataset" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportDataset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportField" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "valueType" TEXT NOT NULL DEFAULT 'string',
  "sensitivity" TEXT NOT NULL DEFAULT 'internal',
  "maskingMode" TEXT NOT NULL DEFAULT 'none',
  "exportable" BOOLEAN NOT NULL DEFAULT true,
  "sourceRef" TEXT,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportPermission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "datasetId" TEXT,
  "fieldId" TEXT,
  "roleKey" "RoleKey" NOT NULL,
  "accessLevel" TEXT NOT NULL DEFAULT 'summary',
  "maskingMode" TEXT NOT NULL DEFAULT 'masked',
  "exportAllowed" BOOLEAN NOT NULL DEFAULT false,
  "requiresReason" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'generated',
  "format" TEXT NOT NULL DEFAULT 'csv',
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "selectedFieldKeysJson" JSONB NOT NULL,
  "filterSummaryHash" TEXT,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "maskedFieldCount" INTEGER NOT NULL DEFAULT 0,
  "contentHash" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "metadataJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportExportArchive" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reportJobId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'csv',
  "status" TEXT NOT NULL DEFAULT 'generated',
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "contentHash" TEXT NOT NULL,
  "downloadExpiresAt" TIMESTAMP(3) NOT NULL,
  "downloadedAt" TIMESTAMP(3),
  "generatedByUserId" TEXT,
  "metadataJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportExportArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportDataset_companyId_code_key"
  ON "ReportDataset"("companyId", "code");

CREATE INDEX "ReportDataset_tenantId_companyId_idx"
  ON "ReportDataset"("tenantId", "companyId");

CREATE INDEX "ReportDataset_tenantId_companyId_status_idx"
  ON "ReportDataset"("tenantId", "companyId", "status");

CREATE UNIQUE INDEX "ReportField_datasetId_key_key"
  ON "ReportField"("datasetId", "key");

CREATE INDEX "ReportField_tenantId_companyId_idx"
  ON "ReportField"("tenantId", "companyId");

CREATE INDEX "ReportField_tenantId_companyId_sensitivity_idx"
  ON "ReportField"("tenantId", "companyId", "sensitivity");

CREATE INDEX "ReportField_tenantId_companyId_status_idx"
  ON "ReportField"("tenantId", "companyId", "status");

CREATE INDEX "ReportPermission_tenantId_companyId_roleKey_idx"
  ON "ReportPermission"("tenantId", "companyId", "roleKey");

CREATE INDEX "ReportPermission_tenantId_companyId_datasetId_idx"
  ON "ReportPermission"("tenantId", "companyId", "datasetId");

CREATE INDEX "ReportPermission_tenantId_companyId_fieldId_idx"
  ON "ReportPermission"("tenantId", "companyId", "fieldId");

CREATE INDEX "ReportJob_tenantId_companyId_status_idx"
  ON "ReportJob"("tenantId", "companyId", "status");

CREATE INDEX "ReportJob_tenantId_companyId_datasetId_idx"
  ON "ReportJob"("tenantId", "companyId", "datasetId");

CREATE INDEX "ReportJob_tenantId_companyId_createdAt_idx"
  ON "ReportJob"("tenantId", "companyId", "createdAt");

CREATE INDEX "ReportExportArchive_tenantId_companyId_status_idx"
  ON "ReportExportArchive"("tenantId", "companyId", "status");

CREATE INDEX "ReportExportArchive_tenantId_companyId_reportJobId_idx"
  ON "ReportExportArchive"("tenantId", "companyId", "reportJobId");

CREATE INDEX "ReportExportArchive_tenantId_companyId_downloadExpiresAt_idx"
  ON "ReportExportArchive"("tenantId", "companyId", "downloadExpiresAt");

ALTER TABLE "ReportDataset"
  ADD CONSTRAINT "ReportDataset_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportField"
  ADD CONSTRAINT "ReportField_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportField"
  ADD CONSTRAINT "ReportField_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "ReportDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportPermission"
  ADD CONSTRAINT "ReportPermission_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportPermission"
  ADD CONSTRAINT "ReportPermission_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "ReportDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportPermission"
  ADD CONSTRAINT "ReportPermission_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "ReportField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportJob"
  ADD CONSTRAINT "ReportJob_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportJob"
  ADD CONSTRAINT "ReportJob_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "ReportDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportExportArchive"
  ADD CONSTRAINT "ReportExportArchive_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportExportArchive"
  ADD CONSTRAINT "ReportExportArchive_reportJobId_fkey"
  FOREIGN KEY ("reportJobId") REFERENCES "ReportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
