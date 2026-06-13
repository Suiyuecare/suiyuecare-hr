-- CreateTable
CREATE TABLE "CompanyPolicyDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" TEXT NOT NULL DEFAULT 'v1',
    "sourceRef" TEXT,
    "excerpt" TEXT NOT NULL,
    "keywordsJson" JSONB NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyPolicyDocument_tenantId_companyId_status_idx" ON "CompanyPolicyDocument"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "CompanyPolicyDocument_tenantId_companyId_category_idx" ON "CompanyPolicyDocument"("tenantId", "companyId", "category");

-- AddForeignKey
ALTER TABLE "CompanyPolicyDocument" ADD CONSTRAINT "CompanyPolicyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
