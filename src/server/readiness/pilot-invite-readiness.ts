import { getDb } from "@/server/db/client";
import { canViewPayslip } from "@/server/payroll/service";
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
  scheduledEmployeeCount: number;
  leaveBalanceEmployeeCount: number;
  payslipSelfServiceEnabled: boolean;
  payslipVisibilityRuleSafe: boolean;
  releasedPayslipEmployeeCount: number;
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

export type PilotInvitePreparationAreaStatus = "ready" | "warning" | "blocked";

export type PilotInvitePreparationArea = {
  id:
    | "tenant_cohort"
    | "employee_access"
    | "manager_line"
    | "schedule_leave"
    | "payslip_self_service";
  title: string;
  status: PilotInvitePreparationAreaStatus;
  readyCount: number;
  targetLabel: string;
  gapCount: number;
  detail: string;
  nextStep: string;
  href: string;
};

export type PilotInviteReadinessReport = {
  status: PilotInviteReadinessStatus;
  checkedAt: string;
  activeEmployeeCount: number;
  managerWithDirectReportsCount: number;
  scheduledEmployeeCount: number;
  leaveBalanceEmployeeCount: number;
  releasedPayslipEmployeeCount: number;
  blockers: number;
  warnings: number;
  checks: PilotInviteReadinessCheck[];
  preparationAreas: PilotInvitePreparationArea[];
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

  const activeEmployeeIdSet = new Set(activeEmployees.map((employee) => employee.id));
  const activeEmployeeIds = [...activeEmployeeIdSet];
  const managersWithDirectReports = activeEmployees.filter((employee) =>
    employee.managerId && activeEmployeeIdSet.has(employee.managerId),
  );
  const managerIds = new Set(managersWithDirectReports.map((employee) => employee.managerId as string));
  const managerEmployees = activeEmployees.filter((employee) => managerIds.has(employee.id));
  const allowedEmailDomains = parseAllowedEmailDomains(company.securitySettings?.allowedEmailDomainsJson);
  const [scheduledEmployees, leaveBalanceEmployees, payrollRecordkeeping, releasedPayslips] =
    await Promise.all([
      db.workSchedule.findMany({
        where: {
          tenantId: tenant.id,
          companyId: company.id,
          employeeId: { in: activeEmployeeIds },
          workDate: trialWindowFilter(),
        },
        select: { employeeId: true },
        distinct: ["employeeId"],
      }),
      db.leaveBalance.findMany({
        where: {
          tenantId: tenant.id,
          companyId: company.id,
          employeeId: { in: activeEmployeeIds },
          leavePolicy: { status: "active" },
        },
        select: { employeeId: true },
        distinct: ["employeeId"],
      }),
      db.companyPayrollRecordkeepingSetting.findUnique({
        where: { companyId: company.id },
        select: { employeePayslipEnabled: true },
      }),
      db.payslip.findMany({
        where: {
          tenantId: tenant.id,
          companyId: company.id,
          employeeId: { in: activeEmployeeIds },
          status: "released",
          payrollRun: { status: "released" },
        },
        select: { employeeId: true },
        distinct: ["employeeId"],
      }),
    ]);

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
    scheduledEmployeeCount: scheduledEmployees.length,
    leaveBalanceEmployeeCount: leaveBalanceEmployees.length,
    payslipSelfServiceEnabled: payrollRecordkeeping?.employeePayslipEnabled ?? true,
    payslipVisibilityRuleSafe: verifyPayslipVisibilityRule(),
    releasedPayslipEmployeeCount: releasedPayslips.length,
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
    check(
      "14-day schedule coverage",
      snapshot.activeEmployeeCount > 0 &&
        snapshot.scheduledEmployeeCount === snapshot.activeEmployeeCount,
      `${snapshot.scheduledEmployeeCount}/${snapshot.activeEmployeeCount} active employee(s) with work schedules in the first 14 days`,
    ),
    check(
      "leave balance coverage",
      snapshot.activeEmployeeCount > 0 &&
        snapshot.leaveBalanceEmployeeCount === snapshot.activeEmployeeCount,
      `${snapshot.leaveBalanceEmployeeCount}/${snapshot.activeEmployeeCount} active employee(s) with at least one active leave balance`,
    ),
    check(
      "payslip visibility rule",
      snapshot.payslipSelfServiceEnabled && snapshot.payslipVisibilityRuleSafe,
      snapshot.payslipSelfServiceEnabled && snapshot.payslipVisibilityRuleSafe
        ? "employee self-service payslip access is enabled and self-only RBAC is enforced"
        : "employee payslip self-service is disabled or self-only RBAC is not safe",
    ),
    warnIf(
      "released payslip rehearsal coverage",
      snapshot.activeEmployeeCount > 0 &&
        snapshot.releasedPayslipEmployeeCount === snapshot.activeEmployeeCount,
      `${snapshot.releasedPayslipEmployeeCount}/${snapshot.activeEmployeeCount} active employee(s) have released payslip rehearsal evidence`,
      `${snapshot.releasedPayslipEmployeeCount}/${snapshot.activeEmployeeCount} active employee(s) have released payslip rehearsal evidence; complete this before Day 7 payroll rehearsal`,
    ),
  ];
  const blockers = checks.filter((item) => item.status === "block").length;
  const warnings = checks.filter((item) => item.status === "warn").length;
  const preparationAreas = buildPreparationAreas(snapshot);

  return {
    status: blockers > 0 ? "blocked" : warnings > 0 ? "action_required" : "ready",
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
    activeEmployeeCount: snapshot.activeEmployeeCount,
    managerWithDirectReportsCount: snapshot.managerWithDirectReportsCount,
    scheduledEmployeeCount: snapshot.scheduledEmployeeCount,
    leaveBalanceEmployeeCount: snapshot.leaveBalanceEmployeeCount,
    releasedPayslipEmployeeCount: snapshot.releasedPayslipEmployeeCount,
    blockers,
    warnings,
    checks: checks.map((item) => ({
      ...item,
      detail: redactInviteDetail(item.detail),
    })),
    preparationAreas,
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
    `Coverage: ${report.scheduledEmployeeCount} scheduled / ${report.leaveBalanceEmployeeCount} leave balance / ${report.releasedPayslipEmployeeCount} released payslip rehearsal`,
    `Result: ${report.blockers} blocker(s), ${report.warnings} warning(s)`,
    "",
    "## Checks",
    "",
    ...report.checks.map((item) => `- [${item.status.toUpperCase()}] ${item.name}: ${redactInviteDetail(item.detail)}`),
    "",
    "## Preparation Areas",
    "",
    ...report.preparationAreas.map((area) => [
      `- [${area.status.toUpperCase()}] ${area.title}`,
      `  - Coverage: ${area.readyCount} (${area.targetLabel}), gap ${area.gapCount}`,
      `  - Detail: ${redactInviteDetail(area.detail)}`,
      `  - Next step: ${redactInviteDetail(area.nextStep)}`,
    ].join("\n")),
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
    scheduledEmployeeCount: 0,
    leaveBalanceEmployeeCount: 0,
    payslipSelfServiceEnabled: false,
    payslipVisibilityRuleSafe: false,
    releasedPayslipEmployeeCount: 0,
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

function buildPreparationAreas(snapshot: PilotInviteReadinessSnapshot): PilotInvitePreparationArea[] {
  const activeTotal = snapshot.activeEmployeeCount;
  const employeeAccessReadyCount = Math.min(
    snapshot.activeLinkedUserCount,
    snapshot.employeeRoleAssignmentCount,
    snapshot.ssoEnabled ? snapshot.externalIdentityEmployeeCount : activeTotal,
  );
  const managerReadyCount = Math.min(
    snapshot.managerLinkedUserCount,
    snapshot.managerRoleAssignmentCount,
  );
  const scheduleLeaveReadyCount = Math.min(
    snapshot.scheduledEmployeeCount,
    snapshot.leaveBalanceEmployeeCount,
  );
  const cohortGap =
    !snapshot.tenantFound || !snapshot.companyFound
      ? targetEmployeeMin
      : activeTotal < targetEmployeeMin
        ? targetEmployeeMin - activeTotal
        : activeTotal > targetEmployeeMax
          ? activeTotal - targetEmployeeMax
          : 0;
  const employeeAccessBlocked =
    activeTotal === 0 ||
    snapshot.linkedUserCount < activeTotal ||
    snapshot.activeLinkedUserCount < activeTotal ||
    snapshot.employeeRoleAssignmentCount < activeTotal ||
    (snapshot.ssoEnabled && snapshot.externalIdentityEmployeeCount < activeTotal) ||
    snapshot.emailDomainViolationCount > 0;
  const employeeAccessWarning =
    !employeeAccessBlocked &&
    (!snapshot.ssoEnabled || snapshot.allowedEmailDomainCount === 0);
  const managerBlocked =
    snapshot.managerWithDirectReportsCount < 1 ||
    managerReadyCount < snapshot.managerWithDirectReportsCount;
  const scheduleLeaveBlocked =
    activeTotal === 0 ||
    snapshot.scheduledEmployeeCount < activeTotal ||
    snapshot.leaveBalanceEmployeeCount < activeTotal;
  const scheduleLeaveWarning =
    !scheduleLeaveBlocked && snapshot.employeesWithoutDepartmentCount > 0;
  const payslipBlocked =
    activeTotal === 0 ||
    !snapshot.payslipSelfServiceEnabled ||
    !snapshot.payslipVisibilityRuleSafe;
  const payslipWarning =
    !payslipBlocked && snapshot.releasedPayslipEmployeeCount < activeTotal;

  return [
    {
      id: "tenant_cohort",
      title: "20-50 人試用名單",
      status: cohortGap > 0 ? "blocked" : "ready",
      readyCount: activeTotal,
      targetLabel: `目標 ${targetEmployeeMin}-${targetEmployeeMax} 人`,
      gapCount: cohortGap,
      detail: snapshot.tenantFound && snapshot.companyFound
        ? `${activeTotal} 位有效員工；只顯示總數，不列出姓名、Email 或員工編號。`
        : "正式客戶 tenant 或公司尚未建立；不能用 demo tenant 發邀請。",
      nextStep: cohortGap > 0
        ? "匯入正式試用名單，讓有效員工數落在 20-50 人。"
        : "名單人數已落在試用範圍，接著確認帳號與主管線。",
      href: "/hr/employee-import",
    },
    {
      id: "employee_access",
      title: "登入、角色與 SSO",
      status: employeeAccessBlocked ? "blocked" : employeeAccessWarning ? "warning" : "ready",
      readyCount: Math.max(employeeAccessReadyCount, 0),
      targetLabel: `${activeTotal} 位員工`,
      gapCount: Math.max(activeTotal - employeeAccessReadyCount, snapshot.emailDomainViolationCount, 0),
      detail: `${Math.max(employeeAccessReadyCount, 0)}/${activeTotal} 位員工具備有效登入、employee 角色${snapshot.ssoEnabled ? "與 SSO 身分" : "；正式試用建議啟用 SSO"}。`,
      nextStep: employeeAccessBlocked
        ? "補齊員工帳號、employee 角色、SSO 身分或公司 Email 網域限制。"
        : employeeAccessWarning
          ? "正式發邀請前，請確認 SSO 與公司 Email 網域策略。"
          : "員工登入與角色已就緒。",
      href: "/settings/access",
    },
    {
      id: "manager_line",
      title: "主管簽核線",
      status: managerBlocked ? "blocked" : "ready",
      readyCount: Math.max(managerReadyCount, 0),
      targetLabel: `${snapshot.managerWithDirectReportsCount} 位主管`,
      gapCount: Math.max(snapshot.managerWithDirectReportsCount - managerReadyCount, snapshot.managerWithDirectReportsCount < 1 ? 1 : 0, 0),
      detail: `${snapshot.managerWithDirectReportsCount} 位主管有直屬員工，${Math.max(managerReadyCount, 0)} 位主管具備有效帳號與 manager 角色。`,
      nextStep: managerBlocked
        ? "匯入 managerEmployeeNo 主管線，並替有直屬員工的主管補上帳號與 manager 角色。"
        : "主管簽核線已可支援統一 Inbox。",
      href: "/hr/employee-import",
    },
    {
      id: "schedule_leave",
      title: "班表與假勤",
      status: scheduleLeaveBlocked ? "blocked" : scheduleLeaveWarning ? "warning" : "ready",
      readyCount: Math.max(scheduleLeaveReadyCount, 0),
      targetLabel: `${activeTotal} 位員工`,
      gapCount: Math.max(activeTotal - scheduleLeaveReadyCount, snapshot.employeesWithoutDepartmentCount, 0),
      detail: `${snapshot.scheduledEmployeeCount}/${activeTotal} 位有前 14 天班表，${snapshot.leaveBalanceEmployeeCount}/${activeTotal} 位有有效假額。`,
      nextStep: scheduleLeaveBlocked
        ? "發邀請前先發布 14 天班表並建立每位員工至少一筆有效假別餘額。"
        : scheduleLeaveWarning
          ? "仍有員工缺部門，請補齊以免後台篩選與主管責任不清。"
          : "班表與假勤可支援員工第一週打卡與請假。",
      href: "/settings/company-setup",
    },
    {
      id: "payslip_self_service",
      title: "薪資單與權限",
      status: payslipBlocked ? "blocked" : payslipWarning ? "warning" : "ready",
      readyCount: snapshot.payslipSelfServiceEnabled && snapshot.payslipVisibilityRuleSafe
        ? snapshot.releasedPayslipEmployeeCount
        : 0,
      targetLabel: `${activeTotal} 位員工`,
      gapCount: payslipBlocked
        ? activeTotal
        : Math.max(activeTotal - snapshot.releasedPayslipEmployeeCount, 0),
      detail: snapshot.payslipSelfServiceEnabled && snapshot.payslipVisibilityRuleSafe
        ? `${snapshot.releasedPayslipEmployeeCount}/${activeTotal} 位已有薪資單釋出演練，self-only 規則通過。`
        : "員工薪資單自助查看或 self-only RBAC 規則尚未安全。",
      nextStep: payslipBlocked
        ? "先啟用薪資單自助查看並確認員工只能看本人薪資單，主管預設不能看部屬薪資。"
        : payslipWarning
          ? "第 7 天月結預演前，替每位試用員工完成薪資單釋出演練證據。"
          : "薪資單自助查看與演練證據已就緒。",
      href: "/hr",
    },
  ];
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
    case "14-day schedule coverage":
      return "Publish work schedules for every active pilot employee covering the first 14 trial days.";
    case "leave balance coverage":
      return "Create at least one active leave balance for every active pilot employee.";
    case "payslip visibility rule":
      return "Enable employee payslip self-service and keep the self-only payslip RBAC rule enforced.";
    case "released payslip rehearsal coverage":
      return "Complete a payroll release rehearsal so every active pilot employee has released payslip evidence before Day 7.";
    default:
      return `Fix invite readiness check: ${name}.`;
  }
}

function trialWindowFilter() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 14);
  return {
    gte: start,
    lt: end,
  };
}

function verifyPayslipVisibilityRule() {
  const employee = {
    role: "employee" as const,
    tenantId: "readiness-tenant",
    companyId: "readiness-company",
    user: { id: "readiness-employee-user", displayName: "Readiness Employee" },
    employee: { id: "readiness-employee", displayName: "Readiness Employee" },
  };
  const manager = {
    role: "manager" as const,
    tenantId: "readiness-tenant",
    companyId: "readiness-company",
    user: { id: "readiness-manager-user", displayName: "Readiness Manager" },
    employee: { id: "readiness-manager", displayName: "Readiness Manager" },
  };
  return (
    canViewPayslip(employee, "readiness-employee") &&
    !canViewPayslip(employee, "readiness-other-employee") &&
    !canViewPayslip(manager, "readiness-employee")
  );
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
