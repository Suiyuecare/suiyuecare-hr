import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getOrganizationSettings,
  resetOrganizationSettingsDemoState,
  updateOrganizationCompanySettings,
  upsertOrganizationDepartment,
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
    expect(settings.jobTitles.length).toBeGreaterThan(0);
    expect(settings.managerLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: "陳主管", directReportCount: expect.any(Number) }),
      ]),
    );
    expect(settings.auditScope).toContain("部門建立與更新");
    expect(settings.readiness.nextActions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("職務/職等資料表"),
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

  it("blocks managers from changing organization settings", async () => {
    await expect(
      upsertOrganizationDepartment(managerSession, {
        code: "OPS",
        name: "營運部",
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
