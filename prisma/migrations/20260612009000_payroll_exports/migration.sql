-- Audited payroll export packages for bank transfer and accounting close outputs.
CREATE TABLE "PayrollExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "fileName" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "totalAmountHash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "previewJson" JSONB NOT NULL,
    "generatedByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollExport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollExport_tenantId_companyId_payrollRunId_idx"
    ON "PayrollExport"("tenantId", "companyId", "payrollRunId");

CREATE INDEX "PayrollExport_tenantId_companyId_exportType_idx"
    ON "PayrollExport"("tenantId", "companyId", "exportType");

ALTER TABLE "PayrollExport"
    ADD CONSTRAINT "PayrollExport_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollExport"
    ADD CONSTRAINT "PayrollExport_payrollRunId_fkey"
    FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
