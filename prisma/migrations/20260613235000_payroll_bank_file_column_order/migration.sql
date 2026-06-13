-- Store customer bank transfer column templates without storing bank account values.
ALTER TABLE "CompanyPayrollPaymentSecuritySetting"
ADD COLUMN "bankFileColumnOrder" TEXT NOT NULL DEFAULT 'employee_no,bank_code,branch_code,account_token_ref,amount,currency';
