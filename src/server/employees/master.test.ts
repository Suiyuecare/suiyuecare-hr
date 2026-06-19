import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getEmployeeMasterWorkspace,
  resetEmployeeMasterDemoState,
  updateEmployeeMasterProfile,
} from "./master";

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
  beforeEach(() => {
    resetEmployeeMasterDemoState();
    resetAuditDemoState();
  });

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

  it("lets HR update organization master fields with redacted audit metadata", async () => {
    await updateEmployeeMasterProfile(hrSession, {
      employeeId: "demo-employee-23",
      departmentId: "demo-dept-people",
      managerId: "demo-hr-employee",
      jobPositionId: "demo-position-frontend-engineer",
      jobTitle: "Frontend Engineer",
      changeReason: "私人匯入備註：主管線與標準職務補正",
    });

    const workspace = await getEmployeeMasterWorkspace(hrSession);
    const employee = workspace.employees.find((row) => row.id === "demo-employee-23");
    const auditLog = getAuditDemoState().logs[0];

    expect(employee).toMatchObject({
      departmentId: "demo-dept-people",
      managerId: "demo-hr-employee",
      jobPositionId: "demo-position-frontend-engineer",
      jobPositionTitle: "Frontend Engineer",
      managerName: "林人資",
    });
    expect(auditLog).toMatchObject({
      action: "update",
      entityType: "employee_master_profile",
      entityId: "demo-employee-23",
      metadataJson: expect.objectContaining({
        source: "employee_master_workspace",
        changeReasonProvided: true,
        rawSensitiveValuesStored: false,
      }),
    });
    expect(auditLog.metadataJson.changedFields).toEqual(expect.arrayContaining([
      "departmentId",
      "managerId",
      "jobPositionId",
    ]));
    expect(JSON.stringify(auditLog.metadataJson)).not.toContain("私人匯入備註");
  });

  it("blocks managers from master profile mutations", async () => {
    await expect(
      updateEmployeeMasterProfile(managerSession, {
        employeeId: "demo-employee-1",
        departmentId: "demo-dept-product",
        managerId: "demo-manager-employee",
        jobPositionId: "demo-position-frontend-engineer",
        jobTitle: "Frontend Engineer",
      }),
    ).rejects.toThrow(/employee:write/);
  });

  it("prevents reporting cycles", async () => {
    await expect(
      updateEmployeeMasterProfile(hrSession, {
        employeeId: "demo-manager-employee",
        departmentId: "demo-dept-product",
        managerId: "demo-employee-1",
        jobPositionId: "demo-position-engineering-manager",
        jobTitle: "Engineering Manager",
      }),
    ).rejects.toThrow(/reporting cycle/);
  });
});
