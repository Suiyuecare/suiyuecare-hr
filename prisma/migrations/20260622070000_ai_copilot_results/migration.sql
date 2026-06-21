-- CreateTable
CREATE TABLE "AiCopilotResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "outputHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCopilotResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCopilotResult_tenantId_companyId_actorUserId_createdAt_idx" ON "AiCopilotResult"("tenantId", "companyId", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCopilotResult_tenantId_companyId_expiresAt_idx" ON "AiCopilotResult"("tenantId", "companyId", "expiresAt");

-- AddForeignKey
ALTER TABLE "AiCopilotResult" ADD CONSTRAINT "AiCopilotResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
