export const roleKeys = ["owner", "hr_admin", "manager", "employee"] as const;

export type RoleKey = (typeof roleKeys)[number];

export type Permission =
  | "dashboard:owner"
  | "dashboard:hr"
  | "dashboard:manager"
  | "dashboard:employee"
  | "employee:read"
  | "employee:write"
  | "labor_roster:manage"
  | "employment_terms:manage"
  | "employment_terms:self"
  | "approval:read"
  | "approval:act"
  | "attendance:read:self"
  | "attendance:write"
  | "attendance_policy:manage"
  | "leave:write"
  | "overtime:write"
  | "form:manage"
  | "form:submit"
  | "settings:read"
  | "settings:write"
  | "pilot:manage"
  | "audit:read"
  | "privacy:manage"
  | "privacy:self"
  | "work_rule:manage"
  | "work_rule:self"
  | "training:manage"
  | "training:self"
  | "incident:manage"
  | "incident:self"
  | "announcement:manage"
  | "announcement:self"
  | "subscription:manage"
  | "payroll:manage"
  | "payroll_adjustment:approve"
  | "payslip:self"
  | "ai:policy"
  | "ai:form_builder"
  | "ai:payroll_explain"
  | "ai:approval_summary";

const rolePermissions: Record<RoleKey, readonly Permission[]> = {
  owner: [
    "dashboard:owner",
    "dashboard:hr",
    "dashboard:manager",
    "dashboard:employee",
    "employee:read",
    "employee:write",
    "labor_roster:manage",
    "employment_terms:manage",
    "employment_terms:self",
    "attendance:read:self",
    "attendance_policy:manage",
    "form:manage",
    "settings:read",
    "settings:write",
    "pilot:manage",
    "audit:read",
    "privacy:manage",
    "privacy:self",
    "work_rule:manage",
    "work_rule:self",
    "training:manage",
    "training:self",
    "incident:manage",
    "incident:self",
    "announcement:manage",
    "announcement:self",
    "subscription:manage",
    "payroll:manage",
    "payroll_adjustment:approve",
    "ai:policy",
    "ai:form_builder",
    "ai:payroll_explain",
    "ai:approval_summary",
  ],
  hr_admin: [
    "dashboard:hr",
    "dashboard:employee",
    "employee:read",
    "employee:write",
    "labor_roster:manage",
    "employment_terms:manage",
    "employment_terms:self",
    "approval:read",
    "approval:act",
    "attendance:read:self",
    "attendance:write",
    "attendance_policy:manage",
    "leave:write",
    "overtime:write",
    "form:manage",
    "form:submit",
    "settings:read",
    "pilot:manage",
    "audit:read",
    "privacy:manage",
    "privacy:self",
    "work_rule:manage",
    "work_rule:self",
    "training:manage",
    "training:self",
    "incident:manage",
    "incident:self",
    "announcement:manage",
    "announcement:self",
    "payroll:manage",
    "ai:policy",
    "ai:form_builder",
    "ai:payroll_explain",
    "ai:approval_summary",
  ],
  manager: [
    "dashboard:manager",
    "dashboard:employee",
    "employee:read",
    "employment_terms:self",
    "approval:read",
    "approval:act",
    "attendance:read:self",
    "attendance:write",
    "leave:write",
    "overtime:write",
    "form:submit",
    "privacy:self",
    "work_rule:self",
    "training:self",
    "incident:self",
    "announcement:self",
    "ai:approval_summary",
  ],
  employee: [
    "dashboard:employee",
    "payslip:self",
    "employment_terms:self",
    "attendance:read:self",
    "attendance:write",
    "leave:write",
    "overtime:write",
    "form:submit",
    "privacy:self",
    "work_rule:self",
    "training:self",
    "incident:self",
    "announcement:self",
  ],
};

export function hasPermission(role: RoleKey, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function assertPermission(role: RoleKey, permission: Permission) {
  if (!hasPermission(role, permission)) {
    throw new Error(`Role ${role} cannot ${permission}`);
  }
}

export function normalizeRole(value: string | undefined): RoleKey {
  if (value && roleKeys.includes(value as RoleKey)) {
    return value as RoleKey;
  }

  return "employee";
}

export function dashboardPathForRole(role: RoleKey) {
  switch (role) {
    case "owner":
      return "/console";
    case "hr_admin":
      return "/console";
    case "manager":
      return "/manager/inbox";
    case "employee":
      return "/app";
  }
}
