import { describe, expect, it } from "vitest";
import { filterConsoleModules, getConsoleModules } from "./modules";

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
        expect.objectContaining({ label: "公司導入精靈", href: "/settings/company-setup" }),
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
});
