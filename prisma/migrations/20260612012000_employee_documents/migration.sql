-- Employee document metadata vault. File bytes stay in external object storage.
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "visibleToEmployee" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeDocument_tenantId_companyId_employeeId_idx"
    ON "EmployeeDocument"("tenantId", "companyId", "employeeId");

CREATE INDEX "EmployeeDocument_tenantId_companyId_category_idx"
    ON "EmployeeDocument"("tenantId", "companyId", "category");

CREATE INDEX "EmployeeDocument_tenantId_companyId_status_idx"
    ON "EmployeeDocument"("tenantId", "companyId", "status");

ALTER TABLE "EmployeeDocument"
    ADD CONSTRAINT "EmployeeDocument_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeDocument"
    ADD CONSTRAINT "EmployeeDocument_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
