import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { resetSalaryProfileDemoState } from "@/server/payroll/salary-profiles";
import { resetPaymentProfileDemoState } from "@/server/payroll/payment-profiles";
import { resetPayrollComplianceDemoState } from "@/server/payroll/compliance";
import {
  confirmPayrollProfileImport,
  getPayrollProfileImportWorkspace,
  previewPayrollProfileImport,
  resetPayrollProfileImportDemoState,
} from "@/server/payroll/profile-imports";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("payroll profile imports", () => {
  beforeEach(() => {
    resetAuditDemoState();
    resetSalaryProfileDemoState();
    resetPaymentProfileDemoState();
    resetPayrollComplianceDemoState();
    resetPayrollProfileImportDemoState();
  });

  it("previews and imports salary, compliance, and payment profiles with redacted audit coverage", async () => {
    const preview = await previewPayrollProfileImport(
      hrSession,
      `employeeNo,baseSalary,hourlyWage,allowanceCode,allowanceName,allowanceAmount,deductionCode,deductionName,deductionAmount,taxResidency,dependentCount,laborInsuranceMonthlyWage,healthInsuranceMonthlyWage,laborPensionMonthlyWage,nonResidentWithholdingRatePercent,bankCode,bankBranchCode,accountName,accountNumber,effectiveFrom
E003,56000,,meal,Meal allowance,2000,welfare,Welfare deduction,1000,resident,1,,,,,004,0123,張小安,123456789012,2026-07-01`,
    );

    expect(preview).toMatchObject({
      validCount: 1,
      invalidCount: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      employeeNo: "E003",
      employeeName: "張小安",
      accountNumberLast4: "9012",
      status: "valid",
    });

    const result = await confirmPayrollProfileImport(hrSession, preview.id);
    const auditText = JSON.stringify(getAuditDemoState().logs);

    expect(result).toEqual({
      importedCount: 1,
      salaryProfilesCreated: 1,
      payrollComplianceProfilesUpdated: 1,
      paymentProfilesCreated: 1,
    });
    expect(getAuditDemoState().logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "salary_profile" }),
        expect.objectContaining({ entityType: "payroll_compliance_profile" }),
        expect.objectContaining({ entityType: "employee_payment_profile" }),
        expect.objectContaining({
          entityType: "payroll_profile_import",
          metadataJson: expect.objectContaining({
            importedCount: 1,
            sensitiveValuesRedacted: true,
          }),
        }),
      ]),
    );
    expect(auditText).not.toContain("123456789012");
  });

  it("blocks invalid rows and manager access", async () => {
    const preview = await previewPayrollProfileImport(
      hrSession,
      `employeeNo,baseSalary,taxResidency,dependentCount,bankCode,accountName,accountNumber,effectiveFrom
NOPE,-1,non_resident,0,4,A,12,20260701`,
    );

    expect(preview.invalidCount).toBe(1);
    expect(preview.rows[0].errors).toEqual(
      expect.arrayContaining([
        "Employee number was not found.",
        "Base salary must be zero or greater.",
        "Bank code must be 3 to 7 digits.",
        "Account number must be 6 to 20 digits.",
        "Effective date must be YYYY-MM-DD.",
        "Non-resident withholding rate percent is required for non-residents.",
      ]),
    );
    await expect(confirmPayrollProfileImport(hrSession, preview.id)).rejects.toThrow(/Fix invalid rows/);
    await expect(getPayrollProfileImportWorkspace(managerSession)).rejects.toThrow(/payroll:manage/);
  });
});
