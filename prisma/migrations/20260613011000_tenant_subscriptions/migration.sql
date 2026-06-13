-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'demo',
    "status" TEXT NOT NULL DEFAULT 'trial',
    "seatLimit" INTEGER NOT NULL DEFAULT 10,
    "activeSeatCount" INTEGER NOT NULL DEFAULT 0,
    "trialEndsAt" TIMESTAMP(3),
    "contractStartsAt" TIMESTAMP(3),
    "contractEndsAt" TIMESTAMP(3),
    "renewalNoticeDays" INTEGER NOT NULL DEFAULT 30,
    "billingContactEmail" TEXT,
    "contractRef" TEXT,
    "contractHash" TEXT,
    "paymentCollectionMode" TEXT NOT NULL DEFAULT 'manual_invoice',
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "lastReviewedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "TenantSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSubscription_tenantId_status_idx" ON "TenantSubscription"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantSubscription_tenantId_plan_idx" ON "TenantSubscription"("tenantId", "plan");

-- CreateIndex
CREATE INDEX "TenantSubscription_tenantId_contractEndsAt_idx" ON "TenantSubscription"("tenantId", "contractEndsAt");

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
