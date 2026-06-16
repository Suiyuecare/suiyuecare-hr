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

const pilotCsv = `employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo
E026,王小明,QA Engineer,ENG,2026-07-01,E002
E027,鄭小美,HR Specialist,POPS,2026-07-01,E001
E028,林宜庭,Frontend Engineer,ENG,2026-07-01,E002
E029,何建宏,Backend Engineer,ENG,2026-07-01,E002
E030,吳佩珊,Product Designer,ENG,2026-07-01,E002
E031,劉冠廷,Customer Success,POPS,2026-07-01,E001
E032,周庭安,QA Engineer,ENG,2026-07-01,E002
E033,蔡宗翰,DevOps Engineer,ENG,2026-07-01,E002
E034,洪雅雯,People Specialist,POPS,2026-07-01,E001
E035,許哲維,Data Analyst,ENG,2026-07-01,E002
E036,郭品妤,Project Manager,ENG,2026-07-01,E002
E037,謝承恩,Support Specialist,POPS,2026-07-01,E001
E038,方怡君,Content Specialist,POPS,2026-07-01,E001
E039,廖俊廷,Mobile Engineer,ENG,2026-07-01,E002
E040,羅佳穎,Payroll Specialist,POPS,2026-07-01,E001`;

describe("employee imports", () => {
  beforeEach(() => {
    resetEmployeeImportDemoState();
    resetAuditDemoState();
  });

  it("previews valid rows and writes audit logs when confirmed", async () => {
    const preview = await previewEmployeeImport(
      hrSession,
      `employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo
E026,王小明,QA Engineer,ENG,2026-07-01,E002`,
    );

    expect(preview).toMatchObject({
      validCount: 1,
      invalidCount: 0,
      pilotReadiness: {
        status: "ready",
        existingEmployeeCount: 25,
        projectedEmployeeCount: 26,
        managerAssignmentCount: 1,
      },
    });
    expect(preview.rows[0]).toMatchObject({
      employeeNo: "E026",
      departmentName: "Product Engineering",
      status: "valid",
    });

    const result = await confirmEmployeeImport(hrSession, preview.id);
    const workspace = await getEmployeeImportWorkspace(hrSession);

    expect(result).toEqual({ importedCount: 1 });
    expect(workspace.employees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeNo: "E026",
          displayName: "王小明",
        }),
      ]),
    );
    expect(getAuditDemoState().logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "create", entityType: "employee" }),
        expect.objectContaining({
          action: "create",
          entityType: "employee_import",
          metadataJson: expect.objectContaining({
            projectedEmployeeCount: 26,
            managerAssignmentCount: 1,
            pilotReadinessStatus: "ready",
          }),
        }),
      ]),
    );
  });

  it("marks a 20-person pilot import ready when manager lines are provided", async () => {
    const preview = await previewEmployeeImport(hrSession, pilotCsv);

    expect(preview.validCount).toBe(15);
    expect(preview.invalidCount).toBe(0);
    expect(preview.pilotReadiness).toMatchObject({
      status: "ready",
      existingEmployeeCount: 25,
      projectedEmployeeCount: 40,
      managerAssignmentCount: 15,
      issues: [],
    });

    const result = await confirmEmployeeImport(hrSession, preview.id);
    expect(result).toEqual({ importedCount: 15 });
    expect(getAuditDemoState().logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "employee_import",
          metadataJson: expect.objectContaining({
            projectedEmployeeCount: 40,
            managerAssignmentCount: 15,
            pilotReadinessStatus: "ready",
          }),
        }),
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

  it("rejects unknown or self manager employee numbers", async () => {
    const preview = await previewEmployeeImport(
      hrSession,
      `employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo
E026,王小明,QA Engineer,ENG,2026-07-01,E999
E027,鄭小美,HR Specialist,POPS,2026-07-01,E027`,
    );

    expect(preview.invalidCount).toBe(2);
    expect(preview.rows[0].errors).toContain("Manager employee number was not found in existing employees or CSV.");
    expect(preview.rows[1].errors).toContain("Manager cannot be the same employee.");
    await expect(confirmEmployeeImport(hrSession, preview.id)).rejects.toThrow(/Fix invalid rows/);
  });

  it("rejects manager references to invalid CSV rows", async () => {
    const preview = await previewEmployeeImport(
      hrSession,
      `employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo
E026,王小明,QA Engineer,ENG,2026-07-01,E027
E027,,Team Lead,ENG,2026-07-01,E002`,
    );

    expect(preview.invalidCount).toBe(2);
    expect(preview.rows[0].errors).toContain("Manager employee number points to an invalid CSV row.");
    expect(preview.rows[1].errors).toContain("Display name is required.");
  });
});
