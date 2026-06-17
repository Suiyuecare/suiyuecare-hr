import { getUserAccessWorkspace } from "@/server/auth/access-management";
import type { RoleKey } from "@/server/auth/rbac";
import { assertPermission } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getCompanyOverview } from "@/server/dashboard/queries";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { getAnnouncementWorkspace } from "@/server/announcements/service";
import { getAttendancePolicySettings } from "@/server/attendance/policies";
import { getLeavePolicySettings } from "@/server/leave/policies";
import {
  evaluatePayrollRecordkeepingReadiness,
  getPayrollRecordkeepingSettings,
} from "@/server/payroll/recordkeeping";
import { getPayrollDashboard } from "@/server/payroll/service";
import { getShiftTemplateSettings } from "@/server/scheduling/shift-templates";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type CompanySetupStepStatus = "complete" | "warning" | "blocked";

export type CompanySetupWizardSnapshot = {
  companyFound: boolean;
  companyName: string | null;
  departmentCount: number;
  activeEmployeeCount: number;
  managerWithDirectReportsCount: number;
  employeesWithoutDepartmentCount: number;
  activeUserCount: number;
  activeLinkedUserCount: number;
  employeeRoleAssignmentCount: number;
  managerRoleAssignmentCount: number;
  ownerRoleAssignmentCount: number;
  hrAdminRoleAssignmentCount: number;
  ssoEnabled: boolean;
  externalIdentityUserCount: number;
  activeShiftTemplateCount: number;
  scheduledEmployeeCount: number;
  activeAttendancePolicyCount: number;
  mobilePunchEnabled: boolean;
  attendanceSelfServiceEnabled: boolean;
  overtimeApprovalRequired: boolean;
  punchCorrectionApprovalRequired: boolean;
  activeLeavePolicyCount: number;
  leaveBalanceEmployeeCount: number;
  publishedAnnouncementCount: number;
  receiptRequiredAnnouncementCount: number;
  payrollRecordkeepingReady: boolean;
  employeePayslipEnabled: boolean;
  releasedPayslipEmployeeCount: number;
  auditLogCount: number;
};

export type CompanySetupWizardStep = {
  id: string;
  title: string;
  owner: "老闆" | "HR" | "HR + 主管" | "HR + 財務";
  status: CompanySetupStepStatus;
  detail: string;
  missing: string[];
  primaryHref: string;
  primaryLabel: string;
};

export type CompanySetupWizardReport = {
  status: CompanySetupStepStatus;
  generatedAt: string;
  companyName: string | null;
  completedStepCount: number;
  blockedStepCount: number;
  warningStepCount: number;
  totalStepCount: number;
  pilotEmployeeRangeReady: boolean;
  steps: CompanySetupWizardStep[];
  nextActions: string[];
  privacyGuardrails: string[];
};

type CompanySetupWizardInput = {
  snapshot: CompanySetupWizardSnapshot;
  generatedAt?: Date;
};

const targetEmployeeMin = 20;
const targetEmployeeMax = 50;

const privacyGuardrails = [
  "導入精靈只顯示彙總數量與狀態，不列出姓名、Email、薪資、銀行帳號、身分證或健康資料。",
  "薪資單檢查只確認員工自助查看是否啟用與是否有釋出演練，不顯示任何薪資金額。",
  "帳號與 SSO 檢查只顯示覆蓋率，不顯示 SSO subject 或登入 token。",
  "真正發邀請前仍要跑試用邀請就緒與 Go/No-Go gate。",
];

export async function getCompanySetupWizardReport(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  return buildCompanySetupWizardReport({
    snapshot: await readCompanySetupWizardSnapshot(session),
  });
}

export async function readCompanySetupWizardSnapshot(
  session: SessionLike,
): Promise<CompanySetupWizardSnapshot> {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    try {
      return await readDbCompanySetupWizardSnapshot(session);
    } catch {
      return readDemoCompanySetupWizardSnapshot(session);
    }
  }
  return readDemoCompanySetupWizardSnapshot(session);
}

export function buildCompanySetupWizardReport(
  input: CompanySetupWizardInput,
): CompanySetupWizardReport {
  const snapshot = input.snapshot;
  const steps = [
    companyStructureStep(snapshot),
    employeeAccessStep(snapshot),
    shiftScheduleStep(snapshot),
    attendancePunchStep(snapshot),
    leaveBalanceStep(snapshot),
    approvalInboxStep(snapshot),
    announcementStep(snapshot),
    payrollPayslipStep(snapshot),
    auditPrivacyStep(snapshot),
  ];
  const completedStepCount = steps.filter((step) => step.status === "complete").length;
  const blockedStepCount = steps.filter((step) => step.status === "blocked").length;
  const warningStepCount = steps.filter((step) => step.status === "warning").length;

  return {
    status: summarizeStatus(steps),
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    companyName: snapshot.companyName,
    completedStepCount,
    blockedStepCount,
    warningStepCount,
    totalStepCount: steps.length,
    pilotEmployeeRangeReady: inPilotEmployeeRange(snapshot.activeEmployeeCount),
    steps,
    nextActions: steps
      .filter((step) => step.status !== "complete")
      .map((step) => `${step.title}: ${step.missing[0] ?? step.detail}`),
    privacyGuardrails,
  };
}

async function readDbCompanySetupWizardSnapshot(
  session: SessionLike & { tenantId: string; companyId: string },
) {
  const db = getDb();
  const today = startOfDay(new Date());
  const windowEnd = addDays(today, 14);
  const company = await db.company.findFirst({
    where: { id: session.companyId, tenantId: session.tenantId },
    select: { id: true, name: true },
  });
  if (!company) return emptySnapshot();

  const activeEmployees = await db.employee.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
      employmentStatus: "active",
    },
    select: {
      id: true,
      userId: true,
      managerId: true,
      departmentId: true,
      user: {
        select: {
          status: true,
          externalIdentities: { select: { id: true } },
          userRoles: {
            where: { companyId: session.companyId },
            select: { role: { select: { key: true } } },
          },
        },
      },
    },
  });
  const activeEmployeeIds = activeEmployees.map((employee) => employee.id);
  const activeEmployeeIdSet = new Set(activeEmployeeIds);
  const managerIds = new Set(
    activeEmployees
      .map((employee) => employee.managerId)
      .filter((managerId): managerId is string => Boolean(managerId && activeEmployeeIdSet.has(managerId))),
  );
  const managerEmployees = activeEmployees.filter((employee) => managerIds.has(employee.id));

  const [
    departmentCount,
    activeUsers,
    activeShiftTemplateCount,
    scheduledEmployees,
    attendancePolicies,
    activeLeavePolicyCount,
    leaveBalanceEmployees,
    publishedAnnouncementCount,
    receiptRequiredAnnouncementCount,
    payrollRecordkeeping,
    releasedPayslips,
    auditLogCount,
  ] = await Promise.all([
    db.department.count({ where: { tenantId: session.tenantId, companyId: session.companyId } }),
    db.user.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: {
        id: true,
        externalIdentities: { select: { id: true } },
        userRoles: {
          where: { companyId: session.companyId },
          select: { role: { select: { key: true } } },
        },
      },
    }),
    db.shiftTemplate.count({
      where: { tenantId: session.tenantId, companyId: session.companyId, status: "active" },
    }),
    db.workSchedule.findMany({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: { in: activeEmployeeIds },
        workDate: { gte: today, lt: windowEnd },
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
    db.attendancePolicy.findMany({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        status: "active",
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    db.leavePolicy.count({
      where: { tenantId: session.tenantId, companyId: session.companyId, status: "active" },
    }),
    db.leaveBalance.findMany({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: { in: activeEmployeeIds },
        leavePolicy: { status: "active" },
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
    db.companyAnnouncement.count({
      where: { tenantId: session.tenantId, companyId: session.companyId, status: "published" },
    }),
    db.companyAnnouncement.count({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        status: "published",
        requireReceipt: true,
      },
    }),
    db.companyPayrollRecordkeepingSetting.findUnique({
      where: { companyId: session.companyId },
    }),
    db.payslip.findMany({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: { in: activeEmployeeIds },
        status: "released",
        payrollRun: { status: "released" },
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
    db.auditLog.count({ where: { tenantId: session.tenantId, companyId: session.companyId } }),
  ]);

  const activeAttendancePolicy = attendancePolicies[0] ?? null;
  const payrollReadiness = evaluatePayrollRecordkeepingReadiness(payrollRecordkeeping ?? undefined);

  return {
    companyFound: true,
    companyName: company.name,
    departmentCount,
    activeEmployeeCount: activeEmployees.length,
    managerWithDirectReportsCount: managerIds.size,
    employeesWithoutDepartmentCount: activeEmployees.filter((employee) => !employee.departmentId).length,
    activeUserCount: activeUsers.length,
    activeLinkedUserCount: activeEmployees.filter((employee) => employee.user?.status === "active").length,
    employeeRoleAssignmentCount: activeEmployees.filter((employee) => employeeHasRole(employee, "employee")).length,
    managerRoleAssignmentCount: managerEmployees.filter((employee) => employeeHasRole(employee, "manager")).length,
    ownerRoleAssignmentCount: activeUsers.filter((user) => userHasRole(user, "owner")).length,
    hrAdminRoleAssignmentCount: activeUsers.filter((user) => userHasRole(user, "hr_admin")).length,
    ssoEnabled: Boolean((await db.companySecuritySetting.findUnique({
      where: { companyId: session.companyId },
      select: { ssoEnabled: true },
    }))?.ssoEnabled),
    externalIdentityUserCount: activeUsers.filter((user) => user.externalIdentities.length > 0).length,
    activeShiftTemplateCount,
    scheduledEmployeeCount: scheduledEmployees.length,
    activeAttendancePolicyCount: attendancePolicies.length,
    mobilePunchEnabled: activeAttendancePolicy?.allowMobilePunch ?? false,
    attendanceSelfServiceEnabled: activeAttendancePolicy?.employeeSelfServiceEnabled ?? false,
    overtimeApprovalRequired: activeAttendancePolicy?.requireOvertimeApproval ?? false,
    punchCorrectionApprovalRequired: activeAttendancePolicy?.requirePunchCorrectionApproval ?? false,
    activeLeavePolicyCount,
    leaveBalanceEmployeeCount: leaveBalanceEmployees.length,
    publishedAnnouncementCount,
    receiptRequiredAnnouncementCount,
    payrollRecordkeepingReady: payrollReadiness.ready,
    employeePayslipEnabled: payrollRecordkeeping?.employeePayslipEnabled ?? true,
    releasedPayslipEmployeeCount: releasedPayslips.length,
    auditLogCount,
  };
}

async function readDemoCompanySetupWizardSnapshot(
  session: SessionLike,
): Promise<CompanySetupWizardSnapshot> {
  const overview = await getCompanyOverview();
  const fallback = getFallbackCompanyOverview();
  const company = overview?.company ?? fallback.company;
  const demoSession = { ...session, tenantId: null, companyId: null };
  const [access, attendancePolicies, shiftTemplates, leavePolicies, announcements, payrollSettings, payrollDashboard] =
    await Promise.all([
      getUserAccessWorkspace(demoSession),
      getAttendancePolicySettings(demoSession),
      getShiftTemplateSettings(demoSession),
      getLeavePolicySettings({ ...demoSession, role: session.role === "owner" ? "hr_admin" : session.role }),
      getAnnouncementWorkspace(demoSession),
      getPayrollRecordkeepingSettings(demoSession),
      getPayrollDashboard({ ...demoSession, employee: demoSession.employee ?? null }),
    ]);
  const activeAttendancePolicy = attendancePolicies.find((policy) => policy.status === "active") ?? null;
  const activeUsers = access.users.filter((user) => user.status === "active");
  const activeEmployees = overview?.employeeCount ?? fallback.employeeCount;
  const managerCount = overview?.managerCount ?? fallback.managerCount;
  const payrollReadiness = evaluatePayrollRecordkeepingReadiness(payrollSettings);

  return {
    companyFound: true,
    companyName: company.name,
    departmentCount: company.departments.length,
    activeEmployeeCount: activeEmployees,
    managerWithDirectReportsCount: managerCount,
    employeesWithoutDepartmentCount: 0,
    activeUserCount: activeUsers.length,
    activeLinkedUserCount: Math.min(activeUsers.length, activeEmployees),
    employeeRoleAssignmentCount: activeUsers.filter((user) => user.roles.includes("employee")).length,
    managerRoleAssignmentCount: activeUsers.filter((user) => user.roles.includes("manager")).length,
    ownerRoleAssignmentCount: activeUsers.filter((user) => user.roles.includes("owner")).length,
    hrAdminRoleAssignmentCount: activeUsers.filter((user) => user.roles.includes("hr_admin")).length,
    ssoEnabled: access.ssoEnabled,
    externalIdentityUserCount: activeUsers.filter((user) => user.externalIdentities.length > 0).length,
    activeShiftTemplateCount: shiftTemplates.filter((template) => template.status === "active").length,
    scheduledEmployeeCount: Math.min(
      activeEmployees,
      shiftTemplates.reduce((sum, template) => sum + template.scheduleCount, 0),
    ),
    activeAttendancePolicyCount: attendancePolicies.filter((policy) => policy.status === "active").length,
    mobilePunchEnabled: activeAttendancePolicy?.allowMobilePunch ?? false,
    attendanceSelfServiceEnabled: activeAttendancePolicy?.employeeSelfServiceEnabled ?? false,
    overtimeApprovalRequired: activeAttendancePolicy?.requireOvertimeApproval ?? false,
    punchCorrectionApprovalRequired: activeAttendancePolicy?.requirePunchCorrectionApproval ?? false,
    activeLeavePolicyCount: leavePolicies.filter((policy) => policy.status === "active").length,
    leaveBalanceEmployeeCount: Math.min(
      activeEmployees,
      Math.max(...leavePolicies.map((policy) => policy.balanceCount), 0),
    ),
    publishedAnnouncementCount: announcements.announcements.filter((announcement) => announcement.status === "published").length,
    receiptRequiredAnnouncementCount: announcements.announcements.filter((announcement) => announcement.requireReceipt).length,
    payrollRecordkeepingReady: payrollReadiness.ready,
    employeePayslipEnabled: payrollSettings.employeePayslipEnabled,
    releasedPayslipEmployeeCount: payrollDashboard.run?.payslips.filter((payslip) => payslip.status === "released").length ?? 0,
    auditLogCount: overview?.auditCount ?? fallback.auditCount,
  };
}

function companyStructureStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    !snapshot.companyFound ? "建立公司資料" : null,
    !inPilotEmployeeRange(snapshot.activeEmployeeCount)
      ? `有效員工需介於 ${targetEmployeeMin}-${targetEmployeeMax} 人，目前 ${snapshot.activeEmployeeCount} 人`
      : null,
    snapshot.departmentCount < 2 ? "至少建立兩個部門，讓 HR 可測試組織與簽核線" : null,
    snapshot.managerWithDirectReportsCount < 1 ? "至少一位主管需有直屬員工" : null,
    snapshot.employeesWithoutDepartmentCount > 0
      ? `${snapshot.employeesWithoutDepartmentCount} 位員工尚未掛部門`
      : null,
  ].filter(isPresent);
  return step({
    id: "company_structure",
    title: "公司、部門與員工名單",
    owner: "HR",
    missing,
    status: missing.some((item) => item.includes("有效員工") || item.includes("建立公司")) ? "blocked" : statusFromMissing(missing),
    detail: `${snapshot.departmentCount} 部門 / ${snapshot.activeEmployeeCount} 有效員工 / ${snapshot.managerWithDirectReportsCount} 位有直屬員工的主管`,
    primaryHref: "/hr/employee-lifecycle",
    primaryLabel: "整理員工",
  });
}

function employeeAccessStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    snapshot.ownerRoleAssignmentCount < 1 ? "至少一位 owner 帳號" : null,
    snapshot.hrAdminRoleAssignmentCount < 1 ? "至少一位 HR admin 帳號" : null,
    snapshot.activeLinkedUserCount < snapshot.activeEmployeeCount
      ? `員工登入帳號覆蓋 ${snapshot.activeLinkedUserCount}/${snapshot.activeEmployeeCount}`
      : null,
    snapshot.employeeRoleAssignmentCount < snapshot.activeEmployeeCount
      ? `employee 角色覆蓋 ${snapshot.employeeRoleAssignmentCount}/${snapshot.activeEmployeeCount}`
      : null,
    !snapshot.ssoEnabled ? "正式試用建議啟用 SSO 或完成替代登入策略" : null,
  ].filter(isPresent);
  const blockers = missing.filter((item) => !item.includes("SSO"));
  return step({
    id: "employee_access",
    title: "登入帳號與 RBAC",
    owner: "老闆",
    missing,
    status: blockers.length ? "blocked" : statusFromMissing(missing),
    detail: `${snapshot.activeUserCount} 個有效帳號；員工角色 ${snapshot.employeeRoleAssignmentCount}/${snapshot.activeEmployeeCount}`,
    primaryHref: "/settings/access",
    primaryLabel: "管理權限",
  });
}

function shiftScheduleStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    snapshot.activeShiftTemplateCount < 1 ? "建立至少一個有效班別" : null,
    snapshot.scheduledEmployeeCount < snapshot.activeEmployeeCount
      ? `前 14 天班表覆蓋 ${snapshot.scheduledEmployeeCount}/${snapshot.activeEmployeeCount}`
      : null,
  ].filter(isPresent);
  return step({
    id: "shift_schedule",
    title: "班別與 14 天班表",
    owner: "HR",
    missing,
    status: statusFromMissing(missing, "blocked"),
    detail: `${snapshot.activeShiftTemplateCount} 個有效班別；${snapshot.scheduledEmployeeCount} 位員工有前 14 天班表`,
    primaryHref: "/hr/shift-templates",
    primaryLabel: "設定排班",
  });
}

function attendancePunchStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    snapshot.activeAttendancePolicyCount < 1 ? "建立有效出勤政策" : null,
    !snapshot.mobilePunchEnabled ? "啟用手機打卡" : null,
    !snapshot.attendanceSelfServiceEnabled ? "啟用員工自助出勤查詢" : null,
    !snapshot.overtimeApprovalRequired ? "加班需簽核" : null,
    !snapshot.punchCorrectionApprovalRequired ? "補打卡需簽核" : null,
  ].filter(isPresent);
  return step({
    id: "attendance_punch",
    title: "打卡與出勤規則",
    owner: "HR",
    missing,
    status: snapshot.activeAttendancePolicyCount < 1 ? "blocked" : statusFromMissing(missing),
    detail: `手機打卡 ${snapshot.mobilePunchEnabled ? "已啟用" : "未啟用"}；補卡簽核 ${snapshot.punchCorrectionApprovalRequired ? "已啟用" : "未啟用"}`,
    primaryHref: "/hr/attendance-policies",
    primaryLabel: "設定打卡",
  });
}

function leaveBalanceStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    snapshot.activeLeavePolicyCount < 1 ? "建立有效假別政策" : null,
    snapshot.leaveBalanceEmployeeCount < snapshot.activeEmployeeCount
      ? `假別餘額覆蓋 ${snapshot.leaveBalanceEmployeeCount}/${snapshot.activeEmployeeCount}`
      : null,
  ].filter(isPresent);
  return step({
    id: "leave_balance",
    title: "請假政策與餘額",
    owner: "HR",
    missing,
    status: statusFromMissing(missing, "blocked"),
    detail: `${snapshot.activeLeavePolicyCount} 個有效假別；${snapshot.leaveBalanceEmployeeCount} 位員工有可用餘額`,
    primaryHref: "/hr/leave-policies",
    primaryLabel: "設定假別",
  });
}

function approvalInboxStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    snapshot.managerWithDirectReportsCount < 1 ? "至少一位主管有直屬員工" : null,
    snapshot.managerRoleAssignmentCount < snapshot.managerWithDirectReportsCount
      ? `主管角色覆蓋 ${snapshot.managerRoleAssignmentCount}/${snapshot.managerWithDirectReportsCount}`
      : null,
  ].filter(isPresent);
  return step({
    id: "approval_inbox",
    title: "主管簽核 Inbox",
    owner: "HR + 主管",
    missing,
    status: statusFromMissing(missing, "blocked"),
    detail: `${snapshot.managerWithDirectReportsCount} 位主管需處理簽核；${snapshot.managerRoleAssignmentCount} 位具 manager 角色`,
    primaryHref: "/manager/inbox",
    primaryLabel: "開啟 Inbox",
  });
}

function announcementStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    snapshot.publishedAnnouncementCount < 1 ? "發布第一則試用公告" : null,
    snapshot.receiptRequiredAnnouncementCount < 1 ? "公告需啟用員工回條" : null,
  ].filter(isPresent);
  return step({
    id: "announcement_receipts",
    title: "公告與回條",
    owner: "HR",
    missing,
    status: statusFromMissing(missing),
    detail: `${snapshot.publishedAnnouncementCount} 則已發布公告；${snapshot.receiptRequiredAnnouncementCount} 則需要回條`,
    primaryHref: "/hr/announcements",
    primaryLabel: "發布公告",
  });
}

function payrollPayslipStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    !snapshot.payrollRecordkeepingReady ? "薪資保存與勞檢匯出設定尚未就緒" : null,
    !snapshot.employeePayslipEnabled ? "啟用員工薪資單自助查看" : null,
    snapshot.releasedPayslipEmployeeCount < snapshot.activeEmployeeCount
      ? `薪資單釋出演練覆蓋 ${snapshot.releasedPayslipEmployeeCount}/${snapshot.activeEmployeeCount}`
      : null,
  ].filter(isPresent);
  const hardBlock = !snapshot.payrollRecordkeepingReady || !snapshot.employeePayslipEnabled;
  return step({
    id: "payroll_payslip",
    title: "HR 月結預演與薪資單",
    owner: "HR + 財務",
    missing,
    status: hardBlock ? "blocked" : statusFromMissing(missing),
    detail: `薪資單自助 ${snapshot.employeePayslipEnabled ? "已啟用" : "未啟用"}；釋出演練 ${snapshot.releasedPayslipEmployeeCount}/${snapshot.activeEmployeeCount}`,
    primaryHref: "/hr",
    primaryLabel: "開啟月結",
  });
}

function auditPrivacyStep(snapshot: CompanySetupWizardSnapshot): CompanySetupWizardStep {
  const missing = [
    snapshot.auditLogCount < 1 ? "尚未產生 audit log，請至少完成一筆安全設定或試用 checkpoint" : null,
  ].filter(isPresent);
  return step({
    id: "audit_privacy",
    title: "Audit 與敏感資料防漏",
    owner: "老闆",
    missing,
    status: statusFromMissing(missing),
    detail: `${snapshot.auditLogCount} 筆 audit log；導入頁僅顯示彙總狀態`,
    primaryHref: "/settings/audit",
    primaryLabel: "查看稽核",
  });
}

function step(input: CompanySetupWizardStep) {
  return input;
}

function statusFromMissing(
  missing: string[],
  missingStatus: CompanySetupStepStatus = "warning",
): CompanySetupStepStatus {
  return missing.length ? missingStatus : "complete";
}

function summarizeStatus(steps: CompanySetupWizardStep[]): CompanySetupStepStatus {
  if (steps.some((step) => step.status === "blocked")) return "blocked";
  if (steps.some((step) => step.status === "warning")) return "warning";
  return "complete";
}

function inPilotEmployeeRange(count: number) {
  return count >= targetEmployeeMin && count <= targetEmployeeMax;
}

function emptySnapshot(): CompanySetupWizardSnapshot {
  return {
    companyFound: false,
    companyName: null,
    departmentCount: 0,
    activeEmployeeCount: 0,
    managerWithDirectReportsCount: 0,
    employeesWithoutDepartmentCount: 0,
    activeUserCount: 0,
    activeLinkedUserCount: 0,
    employeeRoleAssignmentCount: 0,
    managerRoleAssignmentCount: 0,
    ownerRoleAssignmentCount: 0,
    hrAdminRoleAssignmentCount: 0,
    ssoEnabled: false,
    externalIdentityUserCount: 0,
    activeShiftTemplateCount: 0,
    scheduledEmployeeCount: 0,
    activeAttendancePolicyCount: 0,
    mobilePunchEnabled: false,
    attendanceSelfServiceEnabled: false,
    overtimeApprovalRequired: false,
    punchCorrectionApprovalRequired: false,
    activeLeavePolicyCount: 0,
    leaveBalanceEmployeeCount: 0,
    publishedAnnouncementCount: 0,
    receiptRequiredAnnouncementCount: 0,
    payrollRecordkeepingReady: false,
    employeePayslipEnabled: false,
    releasedPayslipEmployeeCount: 0,
    auditLogCount: 0,
  };
}

function employeeHasRole(
  employee: { user?: { userRoles: Array<{ role: { key: string } }> } | null },
  role: RoleKey,
) {
  return Boolean(employee.user?.userRoles.some((item) => item.role.key === role));
}

function userHasRole(user: { userRoles: Array<{ role: { key: string } }> }, role: RoleKey) {
  return user.userRoles.some((item) => item.role.key === role);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isPresent(value: string | null): value is string {
  return Boolean(value);
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
