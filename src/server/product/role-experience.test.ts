import { describe, expect, it } from "vitest";
import { getRoleExperienceCommandCenter, roleExperienceLanes } from "./role-experience";

describe("role experience command center", () => {
  it("keeps employees in the mobile-first frontstage", () => {
    const commandCenter = getRoleExperienceCommandCenter("employee");

    expect(commandCenter.visibleLanes.map((lane) => lane.id)).toEqual(["employee-frontstage"]);
    expect(commandCenter.frontstageCount).toBe(1);
    expect(commandCenter.backstageCount).toBe(0);
    expect(commandCenter.hiddenLaneTitles).toContain("HR 營運後台");
    expect(commandCenter.visibleLanes.every((lane) => lane.sensitiveScope === "self_only")).toBe(true);
  });

  it("lets managers approve without gaining payroll administration scope", () => {
    const commandCenter = getRoleExperienceCommandCenter("manager");

    expect(commandCenter.visibleLanes.map((lane) => lane.id)).toEqual([
      "employee-frontstage",
      "manager-inbox",
    ]);
    expect(commandCenter.visibleLanes.some((lane) => lane.sensitiveScope === "hr_restricted")).toBe(false);
    expect(commandCenter.visibleLanes.some((lane) => lane.sensitiveScope === "owner_restricted")).toBe(false);
    expect(commandCenter.hiddenLaneTitles).toContain("執行長控制台");
  });

  it("shows HR the operational backend and executive sale gates", () => {
    const commandCenter = getRoleExperienceCommandCenter("hr_admin");

    expect(commandCenter.visibleLanes.map((lane) => lane.id)).toEqual([
      "employee-frontstage",
      "manager-inbox",
      "hr-operations",
      "executive-control",
    ]);
    expect(commandCenter.backstageCount).toBe(3);
    expect(commandCenter.visibleLanes.map((lane) => lane.primary.href)).toContain("/hr");
    expect(commandCenter.visibleLanes.map((lane) => lane.primary.href)).toContain("/settings/readiness");
  });

  it("keeps every lane tied to a KPI, task, and guardrail", () => {
    for (const lane of roleExperienceLanes) {
      expect(lane.kpi.length).toBeGreaterThan(0);
      expect(lane.tasks.length).toBeGreaterThan(0);
      expect(lane.guardrails.length).toBeGreaterThan(0);
      expect(lane.primary.href).toMatch(/^\//);
      expect(lane.secondary.href).toMatch(/^\//);
    }
  });
});
