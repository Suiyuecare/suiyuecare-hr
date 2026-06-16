import { getDb } from "@/server/db/client";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotInviteReadinessStatus = "ready" | "action_required" | "blocked";

export type PilotInviteReadinessSnapshot = {
  tenantFound: boolean;
  companyFound: boolean;
  tenantSlug: string | null;
  companyId: string | null;
  ssoEnabled: boolean;
  allowedEmailDomainCount: number;
  activeEmployeeCount: number;
  linkedUserCount: number;
  activeLinkedUserCount: number;
  employeeRoleAssignmentCount: number;
  externalIdentityEmployeeCount: number;
  emailDomainViolationCount: number;
  managerWithDirectReportsCount: number;
  managerLinkedUserCount: number;
  managerRoleAssignmentCount: number;
  employeesWithoutManagerCount: number;
  employeesWithoutDepartmentCount: number;
};

export type PilotInviteReadinessInput = {
  snapshot: PilotInviteReadinessSnapshot;
  checkedAt?: Date;
};

export type PilotInviteReadinessCheck = {
  name: string;
  status: "pass" | "warn" | "block";
  detail: string;
};

export type PilotInviteReadinessReport = {
  status: PilotInviteReadinessStatus;
  checkedAt: string;
  activeEmployeeCount: number;
  managerWithDirectReportsCount: number;
  blockers: number;
  warnings: number;
  checks: PilotInviteReadinessCheck[];
  nextActions: string[];
};

export type PilotInviteReadinessDatabaseOptions = {
  tenantSlug: string;
  companyId?: string | null;
};

const targetEmployeeMin = 20;
const targetEmployeeMax = 50;

export async function readPilotInviteReadinessSnapshotFromDatabase(
  options: PilotInviteReadinessDatabaseOptions,
): Promise<PilotInviteReadinessSnapshot> {
  const tenantSlug = options.tenantSlug.trim();
  if (!tenantSlug || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("REPLACE_WITH_")) {
    return unknownSnapshot(tenantSlug || null, options.companyId ?? null);
  }

  const db = getDb();
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      companies: options.companyId
        ? {
            where: { id: options.companyId },
            include: { securitySettings: true },
          }
        : {
            take: 1,
            include: { securitySettings: true },
          },
    },
  });
  const company = tenant?.companies[0] ?? null;
  if (!tenant || !company) {
    return unknownSnapshot(tenant?.slug ?? tenantSlug, options.companyId ?? null, Boolean(tenant));
  }

  const activeEmployees = await db.employee.findMany({
    where: {
      tenantId: tenant.id,
      companyId: company.id,
      employmentStatus: "active",
    },
    select: {
      id: true,
      userId: true,
      managerId: true,
      departmentId: true,
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          externalIdentities: { select: { id: true } },
          userRoles: {
            where: { companyId: company.id },
            select: { role: { select: { key: true } } },
          },
        },
      },
    },
  });

  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
  const managersWithDirectReports = activeEmployees.filter((employee) =>
    employee.managerId && activeEmployeeIds.has(employee.managerId),
  );
  const managerIds = new Set(managersWithDirectReports.map((employee) => employee.managerId as string));
  const managerEmployees = activeEmployees.filter((employee) => managerIds.has(employee.id));
  const allowedEmailDomains = parseAllowedEmailDomains(company.securitySettings?.allowedEmailDomainsJson);

  return {
    tenantFound: true,
    companyFound: true,
    tenantSlug: tenant.slug,
    companyId: company.id,
    ssoEnabled: Boolean(company.securitySettings?.ssoEnabled),
    allowedEmailDomainCount: allowedEmailDomains.length,
    activeEmployeeCount: activeEmployees.length,
    linkedUserCount: activeEmployees.filter((employee) => Boolean(employee.userId && employee.user)).length,
    activeLinkedUserCount: activeEmployees.filter((employee) => employee.user?.status === "active").length,
    employeeRoleAssignmentCount: activeEmployees.filter((employee) => hasRole(employee, "employee")).length,
    externalIdentityEmployeeCount: activeEmployees.filter((employee) => (employee.user?.externalIdentities.length ?? 0) > 0).length,
    emailDomainViolationCount: countEmailDomainViolations(activeEmployees, allowedEmailDomains),
    managerWithDirectReportsCount: managerIds.size,
    managerLinkedUserCount: managerEmployees.filter((employee) => employee.user?.status === "active").length,
    managerRoleAssignmentCount: managerEmployees.filter((employee) => hasRole(employee, "manager")).length,
    employeesWithoutManagerCount: activeEmployees.filter((employee) => !employee.managerId).length,
    employeesWithoutDepartmentCount: activeEmployees.filter((employee) => !employee.departmentId).length,
  };
}

export function buildPilotInviteReadinessReport(
  input: PilotInviteReadinessInput,
): PilotInviteReadinessReport {
  const snapshot = input.snapshot;
  const checks = [
    check(
      "tenant and company",
      snapshot.tenantFound && snapshot.companyFound,
      snapshot.companyFound ? "tenant and company found" : "tenant or company missing",
    ),
    check(
      "20-50 active employees",
      snapshot.activeEmployeeCount >= targetEmployeeMin && snapshot.activeEmployeeCount <= targetEmployeeMax,
      `${snapshot.activeEmployeeCount} active employee(s)`,
    ),
    check(
      "active user link for every employee",
      snapshot.activeEmployeeCount > 0 &&
        snapshot.linkedUserCount === snapshot.activeEmployeeCount &&
        snapshot.activeLinkedUserCount === snapshot.activeEmployeeCount,
      `${snapshot.activeLinkedUserCount}/${snapshot.activeEmployeeCount} active linked user(s)`,
    ),
    check(
      "employee role coverage",
      snapshot.activeEmployeeCount > 0 &&
        snapshot.employeeRoleAssignmentCount === snapshot.activeEmployeeCount,
      `${snapshot.employeeRoleAssignmentCount}/${snapshot.activeEmployeeCount} employee role assignment(s)`,
    ),
    check(
      "manager reporting line",
      snapshot.managerWithDirectReportsCount >= 1,
      `${snapshot.managerWithDirectReportsCount} manager(s) with direct reports`,
    ),
    check(
      "manager login and role coverage",
      snapshot.managerWithDirectReportsCount >= 1 &&
        snapshot.managerLinkedUserCount === snapshot.managerWithDirectReportsCount &&
        snapshot.managerRoleAssignmentCount === snapshot.managerWithDirectReportsCount,
      `${snapshot.managerLinkedUserCount}/${snapshot.managerWithDirectReportsCount} manager user(s), ${snapshot.managerRoleAssignmentCount}/${snapshot.managerWithDirectReportsCount} manager role assignment(s)`,
    ),
    buildSsoCheck(snapshot),
    buildAllowedDomainCheck(snapshot),
    warnIf(
      "department coverage",
      snapshot.employeesWithoutDepartmentCount === 0,
      "every active employee has a department",
      `${snapshot.employeesWithoutDepartmentCount} active employee(s) without department`,
    ),
  ];
  const blockers = checks.filter((item) => item.status === "block").length;
  const warnings = checks.filter((item) => item.status === "warn").length;

  return {
    status: blockers > 0 ? "blocked" : warnings > 0 ? "action_required" : "ready",
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
    activeEmployeeCount: snapshot.activeEmployeeCount,
    managerWithDirectReportsCount: snapshot.managerWithDirectReportsCount,
    blockers,
    warnings,
    checks: checks.map((item) => ({
      ...item,
      detail: redactInviteDetail(item.detail),
    })),
    nextActions: buildNextActions(checks),
  };
}

export function pilotInviteReadinessPassed(report: PilotInviteReadinessReport) {
  return report.status === "ready";
}

export function formatPilotInviteReadinessMarkdown(report: PilotInviteReadinessReport) {
  return [
    "# HR One Pilot Invite Readiness",
    "",
    `Checked at: ${report.checkedAt}`,
    `Status: ${report.status}`,
    `Cohort: ${report.activeEmployeeCount} active employee(s), ${report.managerWithDirectReportsCount} manager(s) with direct reports`,
    `Result: ${report.blockers} blocker(s), ${report.warnings} warning(s)`,
    "",
    "## Checks",
    "",
    ...report.checks.map((item) => `- [${item.status.toUpperCase()}] ${item.name}: ${redactInviteDetail(item.detail)}`),
    "",
    "## Next Actions",
    "",
    ...formatList(report.nextActions, "No invite readiness actions required."),
    "",
    "## Privacy",
    "",
    "- This report intentionally excludes employee names, emails, SSO subjects, salary amounts, bank accounts, national IDs, health data, and private HR notes.",
    "- Keep invitation lists and identity-provider exports in approved secure storage only.",
    "",
  ].join("\n");
}

export function unknownSnapshot(
  tenantSlug: string | null = null,
  companyId: string | null = null,
  tenantFound = false,
): PilotInviteReadinessSnapshot {
  return {
    tenantFound,
    companyFound: false,
    tenantSlug,
    companyId,
    ssoEnabled: false,
    allowedEmailDomainCount: 0,
    activeEmployeeCount: 0,
    linkedUserCount: 0,
    activeLinkedUserCount: 0,
    employeeRoleAssignmentCount: 0,
    externalIdentityEmployeeCount: 0,
    emailDomainViolationCount: 0,
    managerWithDirectReportsCount: 0,
    managerLinkedUserCount: 0,
    managerRoleAssignmentCount: 0,
    employeesWithoutManagerCount: 0,
    employeesWithoutDepartmentCount: 0,
  };
}

type EmployeeWithUser = {
  user?: {
    email: string;
    status: string;
    externalIdentities: Array<{ id: string }>;
    userRoles: Array<{ role: { key: string } }>;
  } | null;
};

function buildSsoCheck(snapshot: PilotInviteReadinessSnapshot): PilotInviteReadinessCheck {
  if (!snapshot.ssoEnabled) {
    return warnIf(
      "SSO identity coverage",
      false,
      "SSO enabled",
      "company SSO is not enabled; production pilot should use SSO identity binding",
    );
  }
  return check(
    "SSO identity coverage",
    snapshot.externalIdentityEmployeeCount === snapshot.activeEmployeeCount && snapshot.activeEmployeeCount > 0,
    `${snapshot.externalIdentityEmployeeCount}/${snapshot.activeEmployeeCount} active employee(s) with linked external identity`,
  );
}

function buildAllowedDomainCheck(snapshot: PilotInviteReadinessSnapshot): PilotInviteReadinessCheck {
  if (snapshot.allowedEmailDomainCount === 0) {
    return warnIf(
      "allowed email domain",
      false,
      "allowed email domain configured",
      "no allowed email domain configured for pilot invitations",
    );
  }
  return check(
    "allowed email domain",
    snapshot.emailDomainViolationCount === 0,
    snapshot.emailDomainViolationCount === 0
      ? `${snapshot.allowedEmailDomainCount} allowed domain(s); no violation`
      : `${snapshot.emailDomainViolationCount} linked user email(s) outside allowed domains`,
  );
}

function check(name: string, passed: boolean, detail: string): PilotInviteReadinessCheck {
  return {
    name,
    status: passed ? "pass" : "block",
    detail,
  };
}

function warnIf(
  name: string,
  passed: boolean,
  passDetail: string,
  warningDetail: string,
): PilotInviteReadinessCheck {
  return {
    name,
    status: passed ? "pass" : "warn",
    detail: passed ? passDetail : warningDetail,
  };
}

function buildNextActions(checks: PilotInviteReadinessCheck[]) {
  const actions = checks
    .filter((checkItem) => checkItem.status !== "pass")
    .map((checkItem) => nextActionForCheck(checkItem.name));
  return [...new Set(actions.map(redactInviteDetail))];
}

function nextActionForCheck(name: string) {
  switch (name) {
    case "tenant and company":
      return "Provision the real customer tenant and company before preparing invitations.";
    case "20-50 active employees":
      return "Import the real pilot cohort so there are 20-50 active employees.";
    case "active user link for every employee":
      return "Create or link one active user account for every active employee before sending invitations.";
    case "employee role coverage":
      return "Assign the employee role to every active employee user.";
    case "manager reporting line":
      return "Import managerEmployeeNo reporting lines so at least one manager has direct reports.";
    case "manager login and role coverage":
      return "Make every manager with direct reports an active linked user with the manager role.";
    case "SSO identity coverage":
      return "Enable production SSO and link external identities for every pilot employee user.";
    case "allowed email domain":
      return "Configure allowed company email domains and fix linked user emails outside those domains.";
    case "department coverage":
      return "Assign every active employee to a department before the first invitation.";
    default:
      return `Fix invite readiness check: ${name}.`;
  }
}

function hasRole(employee: EmployeeWithUser, roleKey: string) {
  return Boolean(employee.user?.userRoles.some((assignment) => assignment.role.key === roleKey));
}

function countEmailDomainViolations(
  employees: EmployeeWithUser[],
  allowedDomains: string[],
) {
  if (allowedDomains.length === 0) return 0;
  return employees.filter((employee) => {
    const email = employee.user?.email ?? "";
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return !domain || !allowedDomains.includes(domain);
  }).length;
}

function parseAllowedEmailDomains(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [];
}

function redactInviteDetail(value: string) {
  return redactSensitiveDetail(value)
    .replace(/[A-Z][12]\d{8}/gi, "[REDACTED]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]");
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactInviteDetail(item)}`);
}
