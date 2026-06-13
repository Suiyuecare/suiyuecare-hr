-- Sensitive employee payment destination profiles.
-- Account numbers are represented by hash and last four digits only until a KMS/token vault is introduced.
CREATE TABLE "EmployeePaymentProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'bank_transfer',
    "bankCode" TEXT NOT NULL,
    "bankBranchCode" TEXT,
    "accountName" TEXT NOT NULL,
    "accountNumberHash" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePaymentProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeePaymentProfile_tenantId_companyId_employeeId_idx"
    ON "EmployeePaymentProfile"("tenantId", "companyId", "employeeId");

CREATE INDEX "EmployeePaymentProfile_tenantId_companyId_status_idx"
    ON "EmployeePaymentProfile"("tenantId", "companyId", "status");

ALTER TABLE "EmployeePaymentProfile"
    ADD CONSTRAINT "EmployeePaymentProfile_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeePaymentProfile"
    ADD CONSTRAINT "EmployeePaymentProfile_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
