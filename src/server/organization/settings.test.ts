import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getOrganizationSettings,
  resetOrganizationSettingsDemoState,
  updateOrganizationCompanySettings,
  upsertOrganizationDepartment,
  upsertOrganizationJobLevel,
  upsertOrganizationJobPosition,
} from "./settings";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王老闆" },
  employee: null,
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("organization settings", () => {
  beforeEach(() => {
    resetOrganizationSettingsDemoState();
    resetAuditDemoState();
  });

  it("summarizes company, departments, job titles, managers, and readiness", async () => {
    const settings = await getOrganizationSettings(ownerSession);

    expect(settings.company).toMatchObject({
      name: "和睿科技",
      timezone: "Asia/Taipei",
      currency: "TWD",
    });
    expect(settings.departments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ENG", employeeCount: expect.any(Number) }),
        expect.objectContaining({ code: "POPS", employeeCount: expect.any(Number) }),
      ]),
    );
    expect(settings.jobLevels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "L1", positionCount: expect.any(Number) }),
        expect.objectContaining({ code: "M1", positionCount: expect.any(Number) }),
      ]),
    );
    expect(settings.jobPositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Engineering Manager", employeeCount: expect.any(Number) }),
      ]),
    );
    expect(settings.jobTitles.length).toBeGreaterThan(0);
    expect(settings.managerLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: "陳主管", directReportCount: expect.any(Number) }),
      ]),
    );
    expect(settings.auditScope).toContain("部門建立與更新");
    expect(settings.readiness.nextActions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("標準職務/職等"),
      ]),
    );
  });

  it("updates company profile with an audit trail", async () => {
    const updated = await updateOrganizationCompanySettings(ownerSession, {
      name: "歲月照護",
      legalName: "歲月照護股份有限公司",
      taxId: "12345678",
      timezone: "Asia/Taipei",
      currency: "TWD",
    });
    const settings = await getOrganizationSettings(ownerSession);

    expect(updated).toMatchObject({
      name: "歲月照護",
      legalName: "歲月照護股份有限公司",
      taxId: "12345678",
    });
    expect(settings.company.name).toBe("歲月照護");
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "company_profile",
    });
  });

  it("creates and updates departments with audited metadata", async () => {
    const created = await upsertOrganizationDepartment(ownerSession, {
      code: "ADM",
      name: "行政管理部",
    });
    const updated = await upsertOrganizationDepartment(ownerSession, {
      id: created.id,
      code: "ADM",
      name: "行政營運部",
    });
    const settings = await getOrganizationSettings(ownerSession);

    expect(created.code).toBe("ADM");
    expect(updated.name).toBe("行政營運部");
    expect(settings.departments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ADM", name: "行政營運部" }),
      ]),
    );
    expect(getAuditDemoState().logs.map((log) => log.entityType)).toEqual([
      "department",
      "department",
    ]);
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      code: "ADM",
    });
  });

  it("rejects duplicate department codes", async () => {
    await expect(
      upsertOrganizationDepartment(ownerSession, {
        code: "ENG",
        name: "重複工程部",
      }),
    ).rejects.toThrow(/部門代碼已存在/);
  });

  it("creates and updates job levels with audit logs", async () => {
    const created = await upsertOrganizationJobLevel(ownerSession, {
      code: "L3",
      name: "主任 / Lead",
      rank: 3,
    });
    const updated = await upsertOrganizationJobLevel(ownerSession, {
      id: created.id,
      code: "L3",
      name: "主任級 / Lead",
      rank: 4,
      status: "inactive",
      description: "Demo level for organization settings tests.",
    });
    const settings = await getOrganizationSettings(ownerSession);

    expect(updated).toMatchObject({
      code: "L3",
      name: "主任級 / Lead",
      rank: 4,
      status: "inactive",
    });
    expect(settings.jobLevels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "L3", name: "主任級 / Lead", positionCount: 0 }),
      ]),
    );
    expect(getAuditDemoState().logs.map((log) => log.entityType)).toEqual([
      "job_level",
      "job_level",
    ]);
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      code: "L3",
      rank: 4,
      status: "inactive",
    });
  });

  it("creates and updates job positions with department and level references", async () => {
    const initial = await getOrganizationSettings(ownerSession);
    const department = initial.departments.find((item) => item.code === "POPS") ?? initial.departments[0];
    const level = initial.jobLevels.find((item) => item.code === "L2") ?? initial.jobLevels[0];

    const created = await upsertOrganizationJobPosition(ownerSession, {
      code: "ADM-LEAD",
      title: "行政主任",
      family: "Administration",
      departmentId: department.id,
      levelId: level.id,
    });
    const updated = await upsertOrganizationJobPosition(ownerSession, {
      id: created.id,
      code: "ADM-LEAD",
      title: "行政管理主任",
      family: "Administration",
      departmentId: department.id,
      levelId: level.id,
      status: "active",
    });
    const settings = await getOrganizationSettings(ownerSession);

    expect(updated).toMatchObject({
      code: "ADM-LEAD",
      title: "行政管理主任",
      family: "Administration",
    });
    expect(settings.jobPositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ADM-LEAD",
          departmentName: department.name,
          levelCode: level.code,
          employeeCount: 0,
        }),
      ]),
    );
    expect(getAuditDemoState().logs.map((log) => log.entityType)).toEqual([
      "job_position",
      "job_position",
    ]);
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      code: "ADM-LEAD",
      family: "Administration",
      status: "active",
    });
  });

  it("rejects duplicate job level and job position codes", async () => {
    const settings = await getOrganizationSettings(ownerSession);
    const existingPosition = settings.jobPositions[0];

    await expect(
      upsertOrganizationJobLevel(ownerSession, {
        code: "L1",
        name: "重複職等",
        rank: 1,
      }),
    ).rejects.toThrow(/職等代碼已存在/);

    await expect(
      upsertOrganizationJobPosition(ownerSession, {
        code: existingPosition.code,
        title: "重複主管職務",
        family: "Engineering",
      }),
    ).rejects.toThrow(/職務代碼已存在/);
  });

  it("blocks managers from changing organization settings", async () => {
    await expect(
      upsertOrganizationDepartment(managerSession, {
        code: "OPS",
        name: "營運部",
      }),
    ).rejects.toThrow(/settings:write/);
    await expect(
      upsertOrganizationJobLevel(managerSession, {
        code: "L9",
        name: "主管級",
        rank: 9,
      }),
    ).rejects.toThrow(/settings:write/);
    await expect(
      upsertOrganizationJobPosition(managerSession, {
        code: "OPS-MGR",
        title: "營運主管",
        family: "Operations",
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
