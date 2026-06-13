import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  confirmEmployeeImport,
  getEmployeeImportWorkspace,
  previewEmployeeImport,
  resetEmployeeImportDemoState,
} from "./imports";

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

describe("employee imports", () => {
  beforeEach(() => {
    resetEmployeeImportDemoState();
    resetAuditDemoState();
  });

  it("previews valid rows and writes audit logs when confirmed", async () => {
    const preview = await previewEmployeeImport(
      hrSession,
      `employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo
E006,王小明,QA Engineer,ENG,2026-07-01,E002`,
    );

    expect(preview).toMatchObject({
      validCount: 1,
      invalidCount: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      employeeNo: "E006",
      departmentName: "Product Engineering",
      status: "valid",
    });

    const result = await confirmEmployeeImport(hrSession, preview.id);
    const workspace = await getEmployeeImportWorkspace(hrSession);

    expect(result).toEqual({ importedCount: 1 });
    expect(workspace.employees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeNo: "E006",
          displayName: "王小明",
        }),
      ]),
    );
    expect(getAuditDemoState().logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "create", entityType: "employee" }),
        expect.objectContaining({ action: "create", entityType: "employee_import" }),
      ]),
    );
  });

  it("blocks invalid rows and manager access", async () => {
    const preview = await previewEmployeeImport(
      hrSession,
      `employeeNo,displayName,jobTitle,departmentCode,hireDate
E001,Duplicate,QA Engineer,NOPE,2026-07-01`,
    );

    expect(preview.invalidCount).toBe(1);
    expect(preview.rows[0].errors).toEqual(
      expect.arrayContaining([
        "Employee number already exists.",
        "Department code was not found.",
      ]),
    );
    await expect(confirmEmployeeImport(hrSession, preview.id)).rejects.toThrow(/Fix invalid rows/);
    await expect(getEmployeeImportWorkspace(managerSession)).rejects.toThrow(/employee:write/);
  });
});
