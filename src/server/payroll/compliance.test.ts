import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getPayrollInsuranceGradeReadiness,
  listPayrollComplianceProfiles,
  resetPayrollComplianceDemoState,
  updatePayrollComplianceProfile,
} from "./compliance";

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

describe("payroll compliance profiles", () => {
  beforeEach(() => {
    resetPayrollComplianceDemoState();
    resetAuditDemoState();
  });

  it("allows HR to update employee compliance settings with audit coverage", async () => {
    await updatePayrollComplianceProfile(hrSession, {
      employeeId: "demo-employee-1",
      taxResidency: "resident",
      dependentCount: 2,
      healthInsuranceMonthlyWage: 80200,
      incomeTaxWithholdingMethod: "annualized_progressive",
    });

    const rows = await listPayrollComplianceProfiles(hrSession);
    const updated = rows.find((row) => row.employeeId === "demo-employee-1");

    expect(updated?.profile).toMatchObject({
      dependentCount: 2,
      healthInsuranceMonthlyWage: 80200,
      incomeTaxWithholdingMethod: "annualized_progressive",
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "payroll_compliance_profile",
      entityId: "demo-employee-1",
    });
  });

  it("flags under-insured payroll compliance overrides for HR review", async () => {
    let readiness = await getPayrollInsuranceGradeReadiness(hrSession);
    expect(readiness.ready).toBe(true);

    await updatePayrollComplianceProfile(hrSession, {
      employeeId: "demo-employee-1",
      taxResidency: "resident",
      dependentCount: 1,
      laborInsuranceMonthlyWage: 30000,
      incomeTaxWithholdingMethod: "annualized_progressive",
    });

    readiness = await getPayrollInsuranceGradeReadiness(hrSession);
    expect(readiness.ready).toBe(false);
    expect(readiness.issues[0]).toMatchObject({
      employeeId: "demo-employee-1",
      kind: "labor_insurance",
    });
    expect(readiness.detail).not.toContain("56000");
  });

  it("blocks managers from editing payroll compliance settings", async () => {
    await expect(
      updatePayrollComplianceProfile(managerSession, {
        employeeId: "demo-employee-1",
        taxResidency: "resident",
        dependentCount: 1,
        incomeTaxWithholdingMethod: "annualized_progressive",
      }),
    ).rejects.toThrow(/payroll:manage/);
  });
});
