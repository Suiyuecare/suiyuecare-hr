import { describe, expect, it } from "vitest";
import {
  filterConsoleModules,
  getConsoleModuleDetail,
  getConsoleModules,
  getConsoleReadinessRadar,
  hasConsoleModuleDefinition,
} from "./modules";

describe("console modules", () => {
  it("keeps employee role out of management console modules", () => {
    expect(getConsoleModules("employee")).toHaveLength(0);
  });

  it("shows HR payroll entries and supports keyword search", () => {
    const modules = getConsoleModules("hr_admin");
    const results = filterConsoleModules(modules, "薪資");

    expect(results.some((module) => module.title === "薪資管理")).toBe(true);
    expect(results.some((module) => module.title === "公告中心")).toBe(false);
    expect(results.flatMap((module) => module.sections).some((section) => section.title === "薪資作業")).toBe(true);
  });

  it("surfaces pilot operation pages for HR admins", () => {
    const modules = getConsoleModules("hr_admin");
    const companyModule = modules.find((module) => module.id === "company");

    expect(companyModule?.sections.flatMap((section) => section.links)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "組織圖", href: "/settings/organization" }),
        expect.objectContaining({ label: "公司導入精靈", href: "/settings/company-setup" }),
        expect.objectContaining({ label: "正式環境資料庫 Gate", href: "/settings/production-database" }),
        expect.objectContaining({ label: "試用批次控制台", href: "/settings/pilot-trial-run" }),
        expect.objectContaining({ label: "試用 CSV 預檢", href: "/settings/pilot-import-preflight" }),
        expect.objectContaining({ label: "試用邀請就緒", href: "/settings/pilot-invite-readiness" }),
        expect.objectContaining({ label: "試用每日戰情", href: "/settings/pilot-operations" }),
        expect.objectContaining({ label: "試用 Go/No-Go", href: "/settings/pilot-go-no-go" }),
        expect.objectContaining({ label: "試用結案檢查", href: "/settings/pilot-completion" }),
        expect.objectContaining({ label: "試用證據包", href: "/settings/pilot-evidence" }),
      ]),
    );
    expect(filterConsoleModules(modules, "戰情").flatMap((module) => module.pinned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "試用每日戰情", href: "/settings/pilot-operations" }),
      ]),
    );
    expect(filterConsoleModules(modules, "批次").flatMap((module) => module.pinned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "試用批次控制台", href: "/settings/pilot-trial-run" }),
      ]),
    );
    expect(filterConsoleModules(modules, "資料庫").flatMap((module) => module.pinned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "正式環境資料庫 Gate", href: "/settings/production-database" }),
      ]),
    );
    expect(filterConsoleModules(modules, "CSV").flatMap((module) => module.pinned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "試用 CSV 預檢", href: "/settings/pilot-import-preflight" }),
      ]),
    );
    expect(filterConsoleModules(modules, "Go").flatMap((module) => module.pinned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "試用 Go/No-Go", href: "/settings/pilot-go-no-go" }),
      ]),
    );
    expect(filterConsoleModules(modules, "結案").flatMap((module) => module.pinned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "試用結案檢查", href: "/settings/pilot-completion" }),
      ]),
    );
    expect(filterConsoleModules(modules, "證據").flatMap((module) => module.pinned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "試用證據包", href: "/settings/pilot-evidence" }),
      ]),
    );
  });

  it("hides payroll management from managers by default", () => {
    const modules = getConsoleModules("manager");

    expect(modules.some((module) => module.title === "薪資管理")).toBe(false);
    expect(filterConsoleModules(modules, "薪資")).toHaveLength(0);
  });

  it("builds module detail pages from role-filtered console modules", () => {
    const payrollDetail = getConsoleModuleDetail("hr_admin", "payroll");
    const managerPayrollDetail = getConsoleModuleDetail("manager", "payroll");
    const attendanceDetail = getConsoleModuleDetail("manager", "attendance");

    expect(hasConsoleModuleDefinition("payroll")).toBe(true);
    expect(payrollDetail?.module.title).toBe("薪資管理");
    expect(payrollDetail?.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "跑薪資月結安全流程" }),
        expect.objectContaining({ href: "/settings/law-rules" }),
      ]),
    );
    expect(payrollDetail?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "薪資資料最小可見", tone: "danger" }),
      ]),
    );
    expect(payrollDetail?.setupLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "薪資主檔", href: "/hr/salary-profiles" }),
      ]),
    );
    expect(managerPayrollDetail).toBeNull();
    expect(attendanceDetail?.module.title).toBe("出勤管理");
    expect(attendanceDetail?.setupLinks.some((link) => link.label === "工時合規")).toBe(true);
  });

  it("builds a role-filtered sale-ready radar without leaking restricted payroll modules", () => {
    const hrRadar = getConsoleReadinessRadar("hr_admin");
    const managerRadar = getConsoleReadinessRadar("manager");
    const employeeRadar = getConsoleReadinessRadar("employee");

    expect(hrRadar.totalModules).toBeGreaterThan(0);
    expect(hrRadar.blockerModules).toBeGreaterThan(0);
    expect(hrRadar.blockerSignals).toBeGreaterThan(0);
    expect(hrRadar.nextAction?.tone).toBe("danger");
    expect(hrRadar.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: "company",
          title: "公司管理",
          topRisks: expect.arrayContaining(["檢查正式環境資料庫 Gate"]),
        }),
        expect.objectContaining({
          moduleId: "payroll",
          title: "薪資管理",
        }),
      ]),
    );

    expect(managerRadar.items.some((item) => item.moduleId === "payroll")).toBe(false);
    expect(managerRadar.items.some((item) => item.moduleId === "attendance")).toBe(true);
    expect(employeeRadar.totalModules).toBe(0);
    expect(employeeRadar.nextAction).toBeNull();
  });
});
