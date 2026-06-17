import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type Permission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import {
  getAnnouncementWorkspace,
  publishAnnouncement,
} from "@/server/announcements/service";
import {
  getLeavePolicySettings,
  saveLeavePolicySettings,
  type LeavePolicyInput,
  type LeavePolicyView,
} from "@/server/leave/policies";
import {
  confirmPayrollRun,
  createPayrollRun,
  getPayrollDashboard,
  lockPayrollRun,
  recalculatePayrollRun,
  releasePayrollPayslips,
  resolvePayrollBlockers,
} from "@/server/payroll/service";
import type { PayrollRunView } from "@/server/payroll/types";
import {
  generateSchedulesFromShiftTemplate,
  getShiftTemplateSettings,
} from "@/server/scheduling/shift-templates";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export const companySetupActionLabels = {
  generate_14_day_schedules: "補 14 天班表",
  sync_leave_balances: "同步假別餘額",
  publish_trial_announcement: "建立試用公告",
  run_payroll_rehearsal: "跑月結演練",
} as const;

export type CompanySetupActionId = keyof typeof companySetupActionLabels;

export type CompanySetupActionResult = {
  actionId: CompanySetupActionId;
  status: "completed" | "needs_review" | "skipped";
  affectedCount: number;
  message: string;
  metadata?: Record<string, unknown>;
};

const actionPermissions: Record<CompanySetupActionId, Permission> = {
  generate_14_day_schedules: "settings:write",
  sync_leave_balances: "employee:write",
  publish_trial_announcement: "announcement:manage",
  run_payroll_rehearsal: "payroll:manage",
};

const trialAnnouncementTitle = "HR One 兩週試用開始通知";

export function isCompanySetupActionId(value: string): value is CompanySetupActionId {
  return value in companySetupActionLabels;
}

export function companySetupActionPermission(actionId: CompanySetupActionId) {
  return actionPermissions[actionId];
}

export async function runCompanySetupAction(
  session: SessionLike,
  actionId: CompanySetupActionId,
): Promise<CompanySetupActionResult> {
  assertPermission(session.role, "settings:read");
  assertPermission(session.role, actionPermissions[actionId]);

  const result = await runAction(session, actionId);
  await writeCompanySetupActionAudit(session, result);
  return result;
}

async function runAction(session: SessionLike, actionId: CompanySetupActionId) {
  if (actionId === "generate_14_day_schedules") return generateFourteenDaySchedules(session);
  if (actionId === "sync_leave_balances") return syncLeaveBalances(session);
  if (actionId === "publish_trial_announcement") return publishTrialAnnouncement(session);
  return runPayrollRehearsal(session);
}

async function generateFourteenDaySchedules(session: SessionLike): Promise<CompanySetupActionResult> {
  const templates = await getShiftTemplateSettings(session);
  const template = templates.find((item) => item.status === "active");
  if (!template) {
    throw new Error("請先建立一個啟用中的班別，再產生 14 天班表。");
  }

  const workDates = nextFourteenDates().filter((date) => {
    if (!template.eligibleWeekdays.length) return true;
    return template.eligibleWeekdays.includes(date.getDay());
  });
  if (!workDates.length) {
    throw new Error("啟用中的班別沒有可套用的星期設定。");
  }

  let affectedCount = 0;
  for (const workDate of workDates) {
    const result = await generateSchedulesFromShiftTemplate(session, {
      shiftTemplateId: template.id,
      workDate,
      overwriteExisting: false,
    });
    affectedCount += result.affectedCount;
  }

  return {
    actionId: "generate_14_day_schedules",
    status: affectedCount > 0 ? "completed" : "skipped",
    affectedCount,
    message:
      affectedCount > 0
        ? `已用「${template.name}」產生未來 14 天可套用工作日班表。`
        : "未來 14 天班表已存在，未覆蓋現有排班。",
    metadata: {
      shiftTemplateId: template.id,
      generatedWorkDateCount: workDates.length,
      overwriteExisting: false,
    },
  };
}

async function syncLeaveBalances(session: SessionLike): Promise<CompanySetupActionResult> {
  const policies = await getLeavePolicySettings(session);
  const activePolicies = policies.filter((policy) => policy.status === "active");
  if (!activePolicies.length) {
    throw new Error("請先建立至少一個啟用中的假別政策。");
  }

  let maxBalanceCount = 0;
  for (const policy of activePolicies) {
    const saved = await saveLeavePolicySettings(session, {
      ...leavePolicyToInput(policy),
      syncBalancesOnUpdate: true,
    });
    maxBalanceCount = Math.max(maxBalanceCount, saved.balanceCount);
  }

  return {
    actionId: "sync_leave_balances",
    status: "completed",
    affectedCount: activePolicies.length,
    message: `已同步 ${activePolicies.length} 個啟用假別的員工餘額。`,
    metadata: {
      activePolicyCount: activePolicies.length,
      maxBalanceEmployeeCount: maxBalanceCount,
    },
  };
}

async function publishTrialAnnouncement(session: SessionLike): Promise<CompanySetupActionResult> {
  const workspace = await getAnnouncementWorkspace(session);
  const existing = workspace.announcements.find(
    (announcement) => announcement.status === "published" && announcement.title === trialAnnouncementTitle,
  );
  if (existing) {
    return {
      actionId: "publish_trial_announcement",
      status: "skipped",
      affectedCount: 0,
      message: "兩週試用公告已發布，未重複建立。",
      metadata: {
        announcementId: existing.id,
        requireReceipt: existing.requireReceipt,
      },
    };
  }

  const announcementId = await publishAnnouncement(session, {
    title: trialAnnouncementTitle,
    category: "兩週試用",
    requireReceipt: true,
    body: [
      "HR One 兩週試用已開始。",
      "請員工每天使用手機首頁完成打卡、公告回條與必要申請。",
      "請主管從統一 Inbox 處理請假、加班與補打卡簽核。",
      "請 HR 於第 7 天完成月結演練，並確認薪資單僅本人與授權角色可查看。",
    ].join("\n"),
  });

  return {
    actionId: "publish_trial_announcement",
    status: "completed",
    affectedCount: 1,
    message: "已發布需要回條的兩週試用公告。",
    metadata: {
      announcementId,
      requireReceipt: true,
      bodyStoredAsHashOnlyInAudit: true,
    },
  };
}

async function runPayrollRehearsal(session: SessionLike): Promise<CompanySetupActionResult> {
  let dashboard = await getPayrollDashboard(payrollSession(session));
  let run = dashboard.run;
  const databaseMode = canUseDatabase(session);
  const completedSteps: string[] = [];

  if (!run) {
    run = await createPayrollRun(payrollSession(session));
    completedSteps.push("create");
  }

  if (!run) {
    return {
      actionId: "run_payroll_rehearsal",
      status: "needs_review",
      affectedCount: 0,
      message: "尚未建立月結演練，請到 HR 月結頁確認資料來源。",
      metadata: { completedSteps },
    };
  }

  if (run.status === "released") {
    return payrollRehearsalResult("skipped", run, completedSteps, "月結演練薪資單已釋出，未重複處理。");
  }

  if (databaseMode && hasPayrollBlockers(run)) {
    return payrollRehearsalResult(
      "needs_review",
      run,
      completedSteps,
      "已建立月結演練，但仍有出勤、簽核或例外阻擋；請 HR 到月結流程逐步確認後再鎖定與釋出。",
    );
  }

  if (!databaseMode && hasPayrollBlockers(run)) {
    await resolvePayrollBlockers(payrollSession(session));
    completedSteps.push("resolve_demo_blockers");
    dashboard = await getPayrollDashboard(payrollSession(session));
    run = dashboard.run ?? run;
  }

  if (run.status === "draft" || run.status === "blocked") {
    run = await recalculatePayrollRun(payrollSession(session));
    completedSteps.push("calculate");
  }

  if (run.status === "calculated") {
    await confirmPayrollRun(payrollSession(session));
    completedSteps.push("confirm");
    run = (await getPayrollDashboard(payrollSession(session))).run ?? run;
  }

  if (run.status === "confirmed") {
    await lockPayrollRun(payrollSession(session));
    completedSteps.push("lock");
    run = (await getPayrollDashboard(payrollSession(session))).run ?? run;
  }

  if (run.status === "locked") {
    await releasePayrollPayslips(payrollSession(session));
    completedSteps.push("release");
    run = (await getPayrollDashboard(payrollSession(session))).run ?? run;
  }

  if (run.status !== "released") {
    return payrollRehearsalResult(
      "needs_review",
      run,
      completedSteps,
      "月結演練尚未釋出薪資單，請到 HR 月結頁確認目前狀態。",
    );
  }

  return payrollRehearsalResult(
    "completed",
    run,
    completedSteps,
    "已完成月結演練並釋出可由員工本人查看的薪資單。",
  );
}

function payrollRehearsalResult(
  status: CompanySetupActionResult["status"],
  run: PayrollRunView,
  completedSteps: string[],
  message: string,
): CompanySetupActionResult {
  return {
    actionId: "run_payroll_rehearsal",
    status,
    affectedCount: run.payslips.filter((payslip) => payslip.status === "released").length,
    message,
    metadata: {
      payrollRunId: run.id,
      payrollStatus: run.status,
      completedSteps,
      releasedPayslipCount: run.payslips.filter((payslip) => payslip.status === "released").length,
      payrollValuesRedacted: true,
    },
  };
}

function hasPayrollBlockers(run: PayrollRunView) {
  return !run.attendanceComplete || run.pendingApprovalCount > 0 || run.exceptionCount > 0;
}

function payrollSession(session: SessionLike) {
  return {
    ...session,
    employee: session.employee ?? null,
  };
}

function leavePolicyToInput(policy: LeavePolicyView): LeavePolicyInput {
  return {
    id: policy.id,
    code: policy.code,
    name: policy.name,
    annualUnits: policy.annualUnits,
    unit: policy.unit,
    attachmentRequired: policy.attachmentRequired,
    status: policy.status,
    statutoryCategory: policy.statutoryCategory,
    eligibilityRule: policy.eligibilityRule,
    payRatePercent: policy.payRatePercent,
    annualLimitNote: policy.annualLimitNote,
    requiresLegalReview: policy.requiresLegalReview,
    accrualMethod: policy.accrualMethod,
    minNoticeDays: policy.minNoticeDays,
    carryoverLimitUnits: policy.carryoverLimitUnits,
    paid: policy.paid,
    syncBalancesOnUpdate: policy.syncBalancesOnUpdate,
  };
}

async function writeCompanySetupActionAudit(
  session: SessionLike,
  result: CompanySetupActionResult,
) {
  const metadata = {
    actionId: result.actionId,
    resultStatus: result.status,
    affectedCount: result.affectedCount,
    actionMetadata: result.metadata ?? {},
    containsSensitiveData: false,
  };

  if (canUseDatabase(session)) {
    await writeAuditLog(getDb(), {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "company_setup_action",
      entityId: result.actionId,
      after: {
        actionId: result.actionId,
        status: result.status,
        affectedCount: result.affectedCount,
      },
      metadata,
    });
    return;
  }

  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "update",
    entityType: "company_setup_action",
    entityId: result.actionId,
    after: {
      actionId: result.actionId,
      status: result.status,
      affectedCount: result.affectedCount,
    },
    metadata,
  });
}

function nextFourteenDates() {
  const start = startOfDate(new Date());
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function startOfDate(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
