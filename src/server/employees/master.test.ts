import { describe, expect, it } from "vitest";
import { getEmployeeMasterWorkspace } from "./master";

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

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("employee master workspace", () => {
  it("shows HR an aggregate company master view without salary values", async () => {
    const workspace = await getEmployeeMasterWorkspace(hrSession);
    const serialized = JSON.stringify(workspace);

    expect(workspace.scopeLabel).toBe("全公司 HR 視圖");
    expect(workspace.summary.visibleEmployeeCount).toBeGreaterThanOrEqual(25);
    expect(workspace.summary.missingLoginCount).toBeGreaterThan(0);
    expect(workspace.summary.laborRosterGapCount).toBeGreaterThan(0);
    expect(workspace.employees[0]).toMatchObject({
      employeeNo: "E001",
      displayName: "林人資",
    });
    expect(serialized).not.toContain("baseSalary");
    expect(serialized).not.toContain("accountNumber");
    expect(serialized).not.toContain("nationalId");
  });

  it("limits managers to their own team view", async () => {
    const workspace = await getEmployeeMasterWorkspace(managerSession);
    const employeeIds = workspace.employees.map((employee) => employee.id);

    expect(workspace.scopeLabel).toBe("主管團隊視圖");
    expect(employeeIds).toContain("demo-manager-employee");
    expect(employeeIds).toContain("demo-employee-1");
    expect(employeeIds).not.toContain("demo-hr-employee");
  });

  it("blocks normal employees from the HR master workspace", async () => {
    await expect(getEmployeeMasterWorkspace(employeeSession)).rejects.toThrow(/employee:read/);
  });
});
