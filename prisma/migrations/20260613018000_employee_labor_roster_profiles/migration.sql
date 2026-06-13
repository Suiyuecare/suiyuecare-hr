CREATE TABLE "EmployeeLaborRosterProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "legalNameHash" TEXT,
    "nationalIdHash" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "nationality" TEXT,
    "registeredAddressHash" TEXT,
    "emergencyContactHash" TEXT,
    "educationSummary" TEXT,
    "workExperienceSummary" TEXT,
    "rosterSourceRef" TEXT,
    "requiredFieldsJson" JSONB NOT NULL,
    "missingFieldsJson" JSONB NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "lastReviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLaborRosterProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeLaborRosterProfile_employeeId_key" ON "EmployeeLaborRosterProfile"("employeeId");
CREATE INDEX "EmployeeLaborRosterProfile_tenantId_companyId_status_idx" ON "EmployeeLaborRosterProfile"("tenantId", "companyId", "status");
CREATE INDEX "EmployeeLaborRosterProfile_tenantId_companyId_verificationStatus_idx" ON "EmployeeLaborRosterProfile"("tenantId", "companyId", "verificationStatus");
CREATE INDEX "EmployeeLaborRosterProfile_tenantId_companyId_employeeId_idx" ON "EmployeeLaborRosterProfile"("tenantId", "companyId", "employeeId");

ALTER TABLE "EmployeeLaborRosterProfile" ADD CONSTRAINT "EmployeeLaborRosterProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeLaborRosterProfile" ADD CONSTRAINT "EmployeeLaborRosterProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
