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
        expect.objectContaining({ label: "試用邀請就緒", href: "/settings/pilot-invite-readiness" }),
        expect.objectContaining({ label: "試用每日戰情", href: "/settings/pilot-operations" }),
      ]),
    );
    expect(filterConsoleModules(modules, "戰情").flatMap((module) => module.pinned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "試用每日戰情", href: "/settings/pilot-operations" }),
      ]),
    );
  });

  it("hides payroll management from managers by default", () => {
    const modules = getConsoleModules("manager");

    expect(modules.some((module) => module.title === "薪資管理")).toBe(false);
    expect(filterConsoleModules(modules, "薪資")).toHaveLength(0);
  });
});
