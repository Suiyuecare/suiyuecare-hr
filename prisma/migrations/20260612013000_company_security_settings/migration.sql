-- Company-level authentication and session security policy settings.
CREATE TABLE "CompanySecuritySetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "mfaRequiredForAdmins" BOOLEAN NOT NULL DEFAULT true,
    "mfaRequiredForEmployees" BOOLEAN NOT NULL DEFAULT false,
    "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ssoProvider" TEXT,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 12,
    "passwordRequiresNumber" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequiresSymbol" BOOLEAN NOT NULL DEFAULT true,
    "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 480,
    "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 60,
    "allowedEmailDomainsJson" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySecuritySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanySecuritySetting_companyId_key"
    ON "CompanySecuritySetting"("companyId");

CREATE INDEX "CompanySecuritySetting_tenantId_companyId_idx"
    ON "CompanySecuritySetting"("tenantId", "companyId");

ALTER TABLE "CompanySecuritySetting"
    ADD CONSTRAINT "CompanySecuritySetting_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
