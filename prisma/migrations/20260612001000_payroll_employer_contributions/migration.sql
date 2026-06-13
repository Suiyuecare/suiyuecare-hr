-- Add employer-side statutory payroll cost items without affecting employee net pay.
ALTER TYPE "PayrollItemKind" ADD VALUE IF NOT EXISTS 'employer_contribution';
