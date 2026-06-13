-- Stable OIDC identity bindings. Tokens are never stored; issuer + subject map
-- external identity providers to HR One users.
CREATE TABLE "UserExternalIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "emailAtLink" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserExternalIdentity_tenantId_issuer_subject_key" ON "UserExternalIdentity"("tenantId", "issuer", "subject");
CREATE INDEX "UserExternalIdentity_tenantId_userId_idx" ON "UserExternalIdentity"("tenantId", "userId");

ALTER TABLE "UserExternalIdentity" ADD CONSTRAINT "UserExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
