import { canViewPayrollRun, canViewPayslip } from "@/server/payroll/service";
import { getDemoAuthRuntimeStatus, type DemoAuthRuntimeStatus } from "./demo-mode";
import { roleKeys, type RoleKey } from "./rbac";
import type { UserAccessWorkspace } from "./access-management";

export type AccessCutoverStatus = "ready" | "action_required" | "blocked";

export type AccessCutoverTask = {
  id:
    | "production_sso_policy"
    | "privileged_sso_identity"
    | "employee_user_link_coverage"
    | "role_coverage"
    | "payroll_salary_boundary"
    | "support_access_governance"
    | "demo_auth_shutdown";
  title: string;
  owner: "Owner" | "HR" | "Owner + HR" | "Engineering";
  status: AccessCutoverStatus;
  signal: string;
  detail: string;
  acceptanceEvidence: string;
  nextStep: string;
  actionLabel: string;
  actionHref: string;
};

export type AccessCutoverMetric = {
  label: string;
  value: string;
  detail: string;
  status: AccessCutoverStatus;
};

export type AccessCutoverSupportGovernance = {
  activeApprovedCount: number;
  activeUnapprovedCount: number;
  expiredStillApprovedCount: number;
};

export type AccessCutoverReport = {
  readyForProduction: boolean;
  status: AccessCutoverStatus;
  summary: string;
  readyCount: number;
  actionRequiredCount: number;
  blockedCount: number;
  topTask: AccessCutoverTask;
  metrics: AccessCutoverMetric[];
  tasks: AccessCutoverTask[];
};

export function buildAccessCutoverReport(
  workspace: UserAccessWorkspace,
  options: {
    supportAccessGovernance?: AccessCutoverSupportGovernance;
    demoAuthRuntime?: DemoAuthRuntimeStatus;
    env?: Record<string, string | undefined>;
  } = {},
): AccessCutoverReport {
  const activeUsers = workspace.users.filter((user) => user.status !== "suspended");
  const activeEmployees = workspace.employees;
  const privilegedUsers = activeUsers.filter((user) => user.roles.some((role) => isPrivilegedRole(role)));
  const privilegedLinkedCount = privilegedUsers.filter((user) => user.externalIdentities.length > 0).length;
  const unlinkedEmployeeCount = activeEmployees.filter((employee) => !employee.userId).length;
  const linkedEmployeeCount = activeEmployees.length - unlinkedEmployeeCount;
  const activeRoleCount = roleKeys.filter((role) =>
    activeUsers.some((user) => user.roles.includes(role)),
  ).length;
  const payrollBoundary = evaluatePayrollBoundary();
  const demoAuthRuntime = options.demoAuthRuntime ?? getDemoAuthRuntimeStatus(options.env);
  const supportGovernance = options.supportAccessGovernance;

  const tasks: AccessCutoverTask[] = [
    {
      id: "production_sso_policy",
      title: "正式 SSO 與 MFA 政策",
      owner: "Owner",
      status: workspace.ssoEnabled &&
        workspace.ssoMetadataConfigured &&
        workspace.adminMfaRequired &&
        workspace.passwordMinLength >= 12 &&
        workspace.allowedEmailDomains.length > 0
        ? "ready"
        : workspace.adminMfaRequired && workspace.passwordMinLength >= 12
          ? "action_required"
          : "blocked",
      signal: workspace.ssoEnabled
        ? workspace.ssoMetadataConfigured
          ? "SSO metadata ready"
          : "SSO metadata 待補"
        : "尚未啟用正式 SSO",
      detail:
        "正式環境需要企業 IdP、管理員 MFA、12 字以上密碼底線與允許網域，避免 demo 帳號或私人信箱進入後台。",
      acceptanceEvidence:
        "SSO provider、issuer、client、JWKS 已設定；admin MFA 已啟用；allowed email domains 不為空。",
      nextStep: workspace.ssoEnabled && workspace.ssoMetadataConfigured
        ? "維持 SSO metadata 與 MFA 設定，接著確認高權限帳號 subject hash 綁定。"
        : "到資安政策工作台啟用正式 SSO，補 provider / issuer / client / JWKS 與允許網域。",
      actionLabel: "設定資安政策",
      actionHref: "/settings/security",
    },
    {
      id: "privileged_sso_identity",
      title: "高權限帳號 SSO 綁定",
      owner: "Owner + HR",
      status: privilegedUsers.length > 0 && privilegedLinkedCount >= privilegedUsers.length
        ? "ready"
        : workspace.ssoEnabled && workspace.ssoMetadataConfigured
          ? "blocked"
          : "action_required",
      signal: `${privilegedLinkedCount}/${privilegedUsers.length} 已綁定`,
      detail:
        "Owner、HR 與主管必須綁定穩定 issuer/subject hash；頁面與 audit log 不保存 raw IdP subject 或 token。",
      acceptanceEvidence: "所有 active Owner/HR/主管帳號都有 external identity subject hash。",
      nextStep: privilegedLinkedCount >= privilegedUsers.length
        ? "高權限 SSO 綁定已覆蓋，定期重跑 access review。"
        : "逐一開啟使用者卡片，補上企業 IdP issuer 與 immutable subject。",
      actionLabel: "補 SSO 綁定",
      actionHref: "#access-users",
    },
    {
      id: "employee_user_link_coverage",
      title: "員工帳號與主檔覆蓋",
      owner: "HR",
      status: activeEmployees.length > 0 && unlinkedEmployeeCount === 0
        ? "ready"
        : activeEmployees.length === 0
          ? "blocked"
          : "action_required",
      signal: `${linkedEmployeeCount}/${activeEmployees.length} 已綁定`,
      detail:
        "員工前台、薪資單 self-only、主管線與通知都依員工主檔綁定判斷；未綁定就不能放心邀請真實員工。",
      acceptanceEvidence: "Active employees 都有 userId 或正式暫緩匯入紀錄。",
      nextStep: unlinkedEmployeeCount === 0
        ? "員工帳號覆蓋已可進入邀請 readiness。"
        : `補齊 ${unlinkedEmployeeCount} 位員工的帳號綁定，或回到匯入預檢補身份 CSV。`,
      actionLabel: "處理員工綁定",
      actionHref: "#access-users",
    },
    {
      id: "role_coverage",
      title: "RBAC 四角色覆蓋",
      owner: "Owner",
      status: activeRoleCount === roleKeys.length ? "ready" : "blocked",
      signal: `${activeRoleCount}/${roleKeys.length} 角色可測`,
      detail:
        "上線前必須能用 Owner、HR、主管、員工四種正式身份跑 smoke flow，否則薪資與前台邊界無法被證明。",
      acceptanceEvidence: "四種角色都有 active 測試帳號，且至少保留一個 active Owner。",
      nextStep: activeRoleCount === roleKeys.length
        ? "角色覆蓋可用；接著跑 preflight access review。"
        : "新增或復用缺少角色的測試帳號，確認最後 active Owner 防呆仍有效。",
      actionLabel: "邀請角色帳號",
      actionHref: "#access-invite",
    },
    {
      id: "payroll_salary_boundary",
      title: "薪資與薪資單防漏",
      owner: "Owner + HR",
      status: payrollBoundary.passed ? "ready" : "blocked",
      signal: payrollBoundary.passed ? "0 個已知漏洞" : "權限矩陣異常",
      detail:
        "Owner/HR 可管理薪資；主管與一般員工不能讀 payroll dashboard；員工薪資單只能 self-only。",
      acceptanceEvidence:
        "canViewPayrollRun / canViewPayslip matrix 與 payroll service guard 通過，未授權薪資存取測試漏洞 = 0。",
      nextStep: payrollBoundary.passed
        ? "到邀請 readiness 跑 preflight access review，保存 hash-only 權限防漏證據。"
        : "立即修正 payroll:manage 與 payslip:self 權限矩陣，再重跑單元與 E2E 權限測試。",
      actionLabel: "跑邀請 Gate",
      actionHref: "/settings/pilot-invite-readiness",
    },
    {
      id: "support_access_governance",
      title: "支援存取人工授權",
      owner: "Owner",
      status: supportGovernance
        ? supportGovernance.activeUnapprovedCount === 0 && supportGovernance.expiredStillApprovedCount === 0
          ? "ready"
          : "blocked"
        : "action_required",
      signal: supportGovernance
        ? `${supportGovernance.activeApprovedCount} active / ${supportGovernance.expiredStillApprovedCount} expired`
        : "待讀取支援狀態",
      detail:
        "工程或客服支援不可變成靜默 impersonation；每次支援都要 ticket、scope、72 小時期限、Owner 核准與撤銷紀錄。",
      acceptanceEvidence: "沒有未核准 active grant，也沒有過期仍 approved 的支援存取。",
      nextStep: supportGovernance &&
        (supportGovernance.activeUnapprovedCount > 0 || supportGovernance.expiredStillApprovedCount > 0)
        ? "撤銷過期或未核准支援存取，再重新檢查 production gate。"
        : "維持支援存取只走 Owner 核准與 audit log，不開放隱性後門。",
      actionLabel: "檢查支援存取",
      actionHref: "/settings/support-access",
    },
    {
      id: "demo_auth_shutdown",
      title: "正式站關閉 Demo Auth",
      owner: "Engineering",
      status: demoAuthRuntime.allowed ? "blocked" : "ready",
      signal: demoAuthRuntime.allowed ? "Demo auth 仍可用" : "Demo auth 已關閉",
      detail:
        "正式站不得依賴角色切換或本機 demo session；要由 OIDC/Supabase session 建立最小化 HttpOnly session cookie。",
      acceptanceEvidence: "HR_ONE_ENV=production 或 HR_ONE_AUTH_SESSION_SOURCE=oidc 時 demo auth runtime status = disabled。",
      nextStep: demoAuthRuntime.allowed
        ? "在 Production 設定 HR_ONE_ENV=production 與正式 session source，重新部署後確認 demo auth 被阻擋。"
        : demoAuthRuntime.reason,
      actionLabel: "查看 production Gate",
      actionHref: "/settings/production-database",
    },
  ];

  const readyCount = tasks.filter((task) => task.status === "ready").length;
  const actionRequiredCount = tasks.filter((task) => task.status === "action_required").length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const status = blockedCount > 0 ? "blocked" : actionRequiredCount > 0 ? "action_required" : "ready";
  const topTask = tasks.find((task) => task.status === "blocked") ??
    tasks.find((task) => task.status === "action_required") ??
    tasks[0]!;

  return {
    readyForProduction: status === "ready",
    status,
    readyCount,
    actionRequiredCount,
    blockedCount,
    topTask,
    metrics: [
      {
        label: "正式登入 Gate",
        value: statusLabel(status),
        detail: `${blockedCount} 阻擋 / ${actionRequiredCount} 待處理`,
        status,
      },
      {
        label: "高權限 SSO",
        value: `${privilegedLinkedCount}/${privilegedUsers.length}`,
        detail: "Owner、HR、主管 issuer/subject hash 覆蓋",
        status: privilegedUsers.length > 0 && privilegedLinkedCount >= privilegedUsers.length ? "ready" : "action_required",
      },
      {
        label: "員工帳號覆蓋",
        value: `${linkedEmployeeCount}/${activeEmployees.length}`,
        detail: "active 員工 userId 綁定",
        status: activeEmployees.length > 0 && unlinkedEmployeeCount === 0 ? "ready" : "action_required",
      },
      {
        label: "薪資防漏",
        value: payrollBoundary.passed ? "0 漏洞" : "需修正",
        detail: "dashboard 與 payslip self-only guard",
        status: payrollBoundary.passed ? "ready" : "blocked",
      },
    ],
    tasks,
    summary: `${readyCount}/${tasks.length} 個正式登入 Gate 已就緒；${blockedCount} 個阻擋，${actionRequiredCount} 個待處理。`,
  };
}

function evaluatePayrollBoundary() {
  const employeeSession = {
    role: "employee" as const,
    tenantId: "access-cutover",
    companyId: "access-cutover",
    user: { id: "employee", displayName: "Employee" },
    employee: { id: "employee", displayName: "Employee" },
  };
  const managerSession = {
    role: "manager" as const,
    tenantId: "access-cutover",
    companyId: "access-cutover",
    user: { id: "manager", displayName: "Manager" },
    employee: { id: "manager", displayName: "Manager" },
  };

  return {
    passed: canViewPayrollRun("owner") &&
      canViewPayrollRun("hr_admin") &&
      !canViewPayrollRun("manager") &&
      !canViewPayrollRun("employee") &&
      canViewPayslip(employeeSession, "employee") &&
      !canViewPayslip(employeeSession, "manager") &&
      !canViewPayslip(managerSession, "employee"),
  };
}

function isPrivilegedRole(role: RoleKey) {
  return role === "owner" || role === "hr_admin" || role === "manager";
}

function statusLabel(status: AccessCutoverStatus) {
  if (status === "ready") return "可切換";
  if (status === "blocked") return "阻擋";
  return "待處理";
}
