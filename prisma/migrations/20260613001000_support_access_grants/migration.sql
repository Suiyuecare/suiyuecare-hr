-- Support access must be customer-approved, time-bound, scoped, and audited.
CREATE TABLE "SupportAccessGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supportPrincipalEmail" TEXT NOT NULL,
    "supportPrincipalName" TEXT,
    "ticketId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scopeJson" JSONB NOT NULL,
    "dataAccessLevel" TEXT NOT NULL DEFAULT 'metadata_only',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportAccessGrant_tenantId_companyId_status_idx" ON "SupportAccessGrant"("tenantId", "companyId", "status");
CREATE INDEX "SupportAccessGrant_tenantId_companyId_supportPrincipalEmail_idx" ON "SupportAccessGrant"("tenantId", "companyId", "supportPrincipalEmail");
CREATE INDEX "SupportAccessGrant_tenantId_companyId_expiresAt_idx" ON "SupportAccessGrant"("tenantId", "companyId", "expiresAt");

ALTER TABLE "SupportAccessGrant"
ADD CONSTRAINT "SupportAccessGrant_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
