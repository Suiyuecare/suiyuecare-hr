import { describe, expect, it } from "vitest";
import { dashboardPathForRole, hasPermission, normalizeRole } from "./rbac";

describe("RBAC", () => {
  it("denies employee access to HR-only employee writes", () => {
    expect(hasPermission("employee", "employee:write")).toBe(false);
  });

  it("allows HR admin to write employee records", () => {
    expect(hasPermission("hr_admin", "employee:write")).toBe(true);
  });

  it("allows owners to configure employee and compliance operations", () => {
    expect(hasPermission("owner", "employee:write")).toBe(true);
  });

  it("normalizes unknown demo roles to employee", () => {
    expect(normalizeRole("not-a-role")).toBe("employee");
  });

  it("routes employees to the front stage and management roles to the console", () => {
    expect(dashboardPathForRole("employee")).toBe("/app");
    expect(dashboardPathForRole("manager")).toBe("/console");
    expect(dashboardPathForRole("hr_admin")).toBe("/console");
    expect(dashboardPathForRole("owner")).toBe("/console");
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

  it("lets HR manage attendance policy while blocking managers from policy setup", () => {
    expect(hasPermission("hr_admin", "attendance_policy:manage")).toBe(true);
    expect(hasPermission("owner", "attendance_policy:manage")).toBe(true);
    expect(hasPermission("manager", "attendance_policy:manage")).toBe(false);
  });

  it("lets HR and owners record beta pilot checkpoints while blocking employees", () => {
    expect(hasPermission("owner", "pilot:manage")).toBe(true);
    expect(hasPermission("hr_admin", "pilot:manage")).toBe(true);
    expect(hasPermission("manager", "pilot:manage")).toBe(false);
    expect(hasPermission("employee", "pilot:manage")).toBe(false);
  });
});
