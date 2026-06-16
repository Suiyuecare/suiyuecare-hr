import { acknowledgeAnnouncement, publishAnnouncement } from "@/server/announcements/service";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getFallbackSession } from "@/server/demo/fallback";
import {
  confirmPayrollRun,
  createPayrollRun,
  getOwnPayslip,
  lockPayrollRun,
  recalculatePayrollRun,
  releasePayrollPayslips,
  resolvePayrollBlockers,
} from "@/server/payroll/service";
import {
  clockAttendance,
  createLeaveRequest,
  decideApproval,
  getManagerInbox,
} from "@/server/workflows/service";
import { runBetaPilotAccessReview } from "./beta-pilot-access-review";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user: { id: string; displayName: string } | null;
  employee: { id: string; displayName: string; managerId?: string | null } | null;
};

export type BetaPilotRehearsalStep = {
  id: "access_review" | "attendance" | "leave_approval" | "announcement" | "payroll" | "payslip";
  title: string;
  status: "passed";
  detail: string;
};

export type BetaPilotRehearsalReport = {
  id: string;
  status: "passed";
  stepCount: number;
  steps: BetaPilotRehearsalStep[];
  checkpointIds: Array<"preflight" | "day_1" | "day_3" | "day_7">;
  sensitiveValuesReturned: false;
  completedAt: Date;
};

export async function runBetaPilotRehearsal(session: SessionLike): Promise<BetaPilotRehearsalReport> {
  assertPermission(session.role, "pilot:manage");
  if (canUseDatabaseRehearsal(session)) {
    throw new Error("Beta 試用流程演練只允許在 demo/fallback 模式執行；正式資料庫請用真人測試或隔離試用 tenant。");
  }

  const ownerOrHrSession = normalizeSession(session.role === "owner" ? "owner" : "hr_admin");
  const hrSession = normalizeEmployeeSession("hr_admin");
  const managerSession = normalizeEmployeeSession("manager");
  const employeeSession = normalizeEmployeeSession("employee");
  const steps: BetaPilotRehearsalStep[] = [];

  await runBetaPilotAccessReview(ownerOrHrSession);
  steps.push({
    id: "access_review",
    title: "權限防漏檢查",
    status: "passed",
    detail: "已驗證員工與主管不可讀取 payroll dashboard 或他人薪資單。",
  });

  await clockAttendance(employeeSession, { direction: "in", source: "mobile" });
  await clockAttendance(employeeSession, { direction: "out", source: "mobile" });
  steps.push({
    id: "attendance",
    title: "員工手機打卡",
    status: "passed",
    detail: "已完成 clock in / clock out，並寫入 day_3 smoke test 證據。",
  });

  const pendingBefore = new Set((await getManagerInbox(managerSession)).pending.map((request) => request.id));
  const leaveWindow = todayAfternoonLeaveWindow();
  await createLeaveRequest(employeeSession, {
    startAt: leaveWindow.startAt,
    endAt: leaveWindow.endAt,
    units: 0.25,
    reason: "Beta pilot rehearsal leave flow.",
  });
  const leaveRequest = (await getManagerInbox(managerSession)).pending
    .find((request) => request.type === "leave" && !pendingBefore.has(request.id));
  if (!leaveRequest) {
    throw new Error("Beta 演練找不到新建立的請假簽核單。");
  }
  await decideApproval(managerSession, {
    requestId: leaveRequest.id,
    action: "approve",
    comment: "Beta pilot rehearsal approval.",
  });
  steps.push({
    id: "leave_approval",
    title: "請假送出與主管簽核",
    status: "passed",
    detail: "已建立請假申請、主管 Inbox 核准，並補齊 day_3 approval flow 證據。",
  });

  const announcementId = await publishAnnouncement(hrSession, {
    title: "Beta 試用公告回條演練",
    body: "請確認員工端可收到公告並完成回條；本公告不含個資、薪資或健康資料。",
    category: "Beta 試用",
    requireReceipt: true,
  });
  await acknowledgeAnnouncement(employeeSession, announcementId);
  steps.push({
    id: "announcement",
    title: "公告發布與員工回條",
    status: "passed",
    detail: "已由 HR 發布公告，員工端完成回條，並寫入 day_1 announcement receipt 證據。",
  });

  await createPayrollRun(hrSession);
  await resolvePayrollBlockers(hrSession);
  await recalculatePayrollRun(hrSession);
  await confirmPayrollRun(hrSession);
  await lockPayrollRun(hrSession);
  await releasePayrollPayslips(hrSession);
  steps.push({
    id: "payroll",
    title: "HR 月結預演與薪資單發布",
    status: "passed",
    detail: "已完成 payroll run 建立、blocker 清除、試算、確認、鎖定與發布，不回傳薪資金額。",
  });

  const payslip = await getOwnPayslip(employeeSession);
  if (!payslip) {
    throw new Error("Beta 演練無法確認員工薪資單可讀。");
  }
  steps.push({
    id: "payslip",
    title: "員工查看自己的薪資單",
    status: "passed",
    detail: "已確認員工只能透過自助入口讀取自己的 released payslip。",
  });

  return {
    id: crypto.randomUUID(),
    status: "passed",
    stepCount: steps.length,
    steps,
    checkpointIds: ["preflight", "day_1", "day_3", "day_7"],
    sensitiveValuesReturned: false,
    completedAt: new Date(),
  };
}

function normalizeSession(role: RoleKey): SessionLike {
  const session = getFallbackSession(role);
  return {
    role,
    tenantId: session.tenantId,
    companyId: session.companyId,
    user: session.user,
    employee: session.employee,
  };
}

function normalizeEmployeeSession(role: "hr_admin" | "manager" | "employee") {
  const session = normalizeSession(role);
  if (!session.employee) {
    throw new Error(`Demo ${role} session must include an employee.`);
  }
  return session as SessionLike & { employee: { id: string; displayName: string; managerId?: string | null } };
}

function todayAfternoonLeaveWindow() {
  const startAt = new Date();
  startAt.setHours(13, 0, 0, 0);
  const endAt = new Date(startAt);
  endAt.setHours(15, 0, 0, 0);
  return { startAt, endAt };
}

function canUseDatabaseRehearsal(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
