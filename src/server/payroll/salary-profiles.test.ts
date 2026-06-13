import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getSalaryProfileWorkspace,
  resetSalaryProfileDemoState,
  saveSalaryProfile,
} from "./salary-profiles";

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

describe("salary profiles", () => {
  beforeEach(() => {
    resetSalaryProfileDemoState();
    resetAuditDemoState();
  });

  it("lets HR create audited effective-dated salary profiles without leaking payroll values in metadata", async () => {
    const profile = await saveSalaryProfile(hrSession, {
      employeeId: "demo-employee-1",
      baseSalary: 61000,
      hourlyWage: null,
      allowanceCode: "meal",
      allowanceName: "Meal allowance",
      allowanceAmount: 2500,
      deductionCode: "welfare",
      deductionName: "Welfare deduction",
      deductionAmount: 1000,
      effectiveFrom: new Date("2026-07-01T00:00:00+08:00"),
    });
    const workspace = await getSalaryProfileWorkspace(hrSession);
    const audit = getAuditDemoState().logs[0];

    expect(profile).toMatchObject({
      employeeId: "demo-employee-1",
      baseSalary: 61000,
      effectiveTo: null,
    });
    expect(workspace.profiles.some((item) => item.id === profile.id)).toBe(true);
    expect(audit).toMatchObject({
      action: "create",
      entityType: "salary_profile",
    });
    expect(JSON.stringify(audit.metadataJson)).not.toContain("61000");
    expect(audit.metadataJson).toMatchObject({
      sensitiveValuesRedacted: true,
    });
  });

  it("blocks managers from reading or changing salary profiles", async () => {
    await expect(getSalaryProfileWorkspace(managerSession)).rejects.toThrow(/payroll:manage/);
    await expect(
      saveSalaryProfile(managerSession, {
        employeeId: "demo-employee-1",
        baseSalary: 61000,
        effectiveFrom: new Date("2026-07-01T00:00:00+08:00"),
      }),
    ).rejects.toThrow(/payroll:manage/);
  });
});
