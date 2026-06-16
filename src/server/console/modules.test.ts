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

  it("hides payroll management from managers by default", () => {
    const modules = getConsoleModules("manager");

    expect(modules.some((module) => module.title === "薪資管理")).toBe(false);
    expect(filterConsoleModules(modules, "薪資")).toHaveLength(0);
  });
});
