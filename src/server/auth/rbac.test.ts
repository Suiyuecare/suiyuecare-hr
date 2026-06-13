import { describe, expect, it } from "vitest";
import { dashboardPathForRole, hasPermission, normalizeRole } from "./rbac";

describe("RBAC", () => {
  it("denies employee access to HR-only employee writes", () => {
    expect(hasPermission("employee", "employee:write")).toBe(false);
  });

  it("allows HR admin to write employee records", () => {
    expect(hasPermission("hr_admin", "employee:write")).toBe(true);
  });

  it("normalizes unknown demo roles to employee", () => {
    expect(normalizeRole("not-a-role")).toBe("employee");
  });

  it("routes each role to a distinct dashboard", () => {
    expect(dashboardPathForRole("employee")).toBe("/app");
    expect(dashboardPathForRole("manager")).toBe("/manager/inbox");
    expect(dashboardPathForRole("hr_admin")).toBe("/hr");
    expect(dashboardPathForRole("owner")).toBe("/settings");
  });

  it("keeps managers out of salary data by default", () => {
    expect(hasPermission("manager", "payroll:manage")).toBe(false);
    expect(hasPermission("manager", "payslip:self")).toBe(false);
  });

  it("allows HR to manage payroll and employees to view own payslip", () => {
    expect(hasPermission("hr_admin", "payroll:manage")).toBe(true);
    expect(hasPermission("employee", "payslip:self")).toBe(true);
  });

  it("keeps employees from managing payroll runs", () => {
    expect(hasPermission("employee", "payroll:manage")).toBe(false);
  });

  it("allows HR review approvals while blocking employee approvals", () => {
    expect(hasPermission("hr_admin", "approval:act")).toBe(true);
    expect(hasPermission("employee", "approval:act")).toBe(false);
  });
});
