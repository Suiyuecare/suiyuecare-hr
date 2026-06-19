CREATE TABLE "JobLevel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLevel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobPosition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT,
    "levelId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "family" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'active',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosition_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee" ADD COLUMN "jobPositionId" TEXT;

CREATE UNIQUE INDEX "JobLevel_companyId_code_key" ON "JobLevel"("companyId", "code");
CREATE INDEX "JobLevel_tenantId_companyId_idx" ON "JobLevel"("tenantId", "companyId");
CREATE INDEX "JobLevel_tenantId_companyId_status_idx" ON "JobLevel"("tenantId", "companyId", "status");

CREATE UNIQUE INDEX "JobPosition_companyId_code_key" ON "JobPosition"("companyId", "code");
CREATE INDEX "JobPosition_tenantId_companyId_idx" ON "JobPosition"("tenantId", "companyId");
CREATE INDEX "JobPosition_tenantId_companyId_status_idx" ON "JobPosition"("tenantId", "companyId", "status");
CREATE INDEX "JobPosition_departmentId_idx" ON "JobPosition"("departmentId");
CREATE INDEX "JobPosition_levelId_idx" ON "JobPosition"("levelId");

CREATE INDEX "Employee_jobPositionId_idx" ON "Employee"("jobPositionId");

ALTER TABLE "JobLevel" ADD CONSTRAINT "JobLevel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPosition" ADD CONSTRAINT "JobPosition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPosition" ADD CONSTRAINT "JobPosition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobPosition" ADD CONSTRAINT "JobPosition_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "JobLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobPositionId_fkey" FOREIGN KEY ("jobPositionId") REFERENCES "JobPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
