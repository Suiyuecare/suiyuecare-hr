import type { RoleKey } from "@/server/auth/rbac";
import { getCompanyOverview } from "@/server/dashboard/queries";
import { getHrOneKpis, type HrOneKpi } from "@/server/kpis/hr-one";
import { getPayrollDashboard } from "@/server/payroll/service";
import type { PayrollCloseChecklist, PayrollRunView } from "@/server/payroll/types";
import { getLaunchReadinessReport, type LaunchReadinessItem, type LaunchReadinessReport } from "./launch";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type BetaPilotReadinessStatus = "ready" | "action_required" | "blocked";

export type BetaPilotFlowEvidence = {
  roleDashboardSmokePassed: boolean;
  employeeMobileSmokePassed: boolean;
  clockInOutSmokePassed: boolean;
  leaveApprovalSmokePassed: boolean;
  managerInboxSmokePassed: boolean;
  announcementReceiptSmokePassed: boolean;
  payrollCloseSmokePassed: boolean;
  payslipViewSmokePassed: boolean;
};

export type BetaPilotReadinessItem = {
  id: string;
  area: "Cohort" | "Employee UX" | "Manager UX" | "HR Ops" | "Payroll" | "Security";
  title: string;
  status: BetaPilotReadinessStatus;
  detail: string;
  nextStep: string;
  actionLabel: string;
  actionHref: string;
};

export type BetaPilotReadinessReport = {
  readyForPilot: boolean;
  trialDays: number;
  targetEmployeeRange: {
    min: number;
    max: number;
  };
  readyCount: number;
  actionRequiredCount: number;
  blockedCount: number;
  items: BetaPilotReadinessItem[];
  phases: BetaPilotPhase[];
  runbook: BetaPilotRunbookStep[];
};

export type BetaPilotPhase = {
  step: number;
  title: string;
  status: BetaPilotReadinessStatus;
  itemIds: string[];
  summary: string;
  actionLabel: string;
  actionHref: string;
};

export type BetaPilotRunbookStep = {
  id: string;
  timing: string;
  title: string;
  owner: "Owner" | "HR" | "Manager" | "Employee" | "Owner + HR" | "HR + Manager";
  status: BetaPilotReadinessStatus;
  itemIds: string[];
  objective: string;
  checklist: string[];
  evidence: string;
  openItems: Array<Pick<BetaPilotReadinessItem, "title" | "status" | "nextStep">>;
  actionLabel: string;
  actionHref: string;
};

export type BetaPilotReadinessInput = {
  employeeCount: number;
  managerCount: number;
  trialDays?: number;
  launchReport: Pick<LaunchReadinessReport, "items">;
  kpis: HrOneKpi[];
  payroll: {
    runStatus: PayrollRunView["status"] | null;
    payrollItemCount: number;
    releasedPayslipCount: number;
    auditCount: number;
    checklist: Pick<PayrollCloseChecklist, "attendanceComplete" | "pendingApprovalCount" | "exceptionCount" | "canLock">;
  };
  flowEvidence?: Partial<BetaPilotFlowEvidence>;
};

const targetEmployeeRange = {
  min: 20,
  max: 50,
};

const defaultFlowEvidence: BetaPilotFlowEvidence = {
  roleDashboardSmokePassed: false,
  employeeMobileSmokePassed: false,
  clockInOutSmokePassed: false,
  leaveApprovalSmokePassed: false,
  managerInboxSmokePassed: false,
  announcementReceiptSmokePassed: false,
  payrollCloseSmokePassed: false,
  payslipViewSmokePassed: false,
};

export async function getBetaPilotReadinessReport(
  session: SessionLike,
  existingLaunchReport?: LaunchReadinessReport,
) {
  const [overview, launchReport, kpis] = await Promise.all([
    getCompanyOverview(),
    existingLaunchReport ? Promise.resolve(existingLaunchReport) : getLaunchReadinessReport(session),
    getHrOneKpis(),
  ]);
  const payroll = await getPilotPayrollSnapshot(session);

  return buildBetaPilotReadinessReport({
    employeeCount: overview?.employeeCount ?? 0,
    managerCount: overview?.managerCount ?? 0,
    trialDays: 14,
    launchReport,
    kpis,
    payroll,
    flowEvidence: envFlowEvidence(),
  });
}

export function buildBetaPilotReadinessReport(input: BetaPilotReadinessInput): BetaPilotReadinessReport {
  const trialDays = input.trialDays ?? 14;
  const launchItems = new Map(input.launchReport.items.map((item) => [item.id, item]));
  const kpis = new Map(input.kpis.map((kpi) => [kpi.id, kpi]));
  const flowEvidence = { ...defaultFlowEvidence, ...input.flowEvidence };
  const payrollRunRehearsed =
    Boolean(input.payroll.runStatus) &&
    input.payroll.runStatus !== "blocked" &&
    input.payroll.payrollItemCount > 0 &&
    input.payroll.checklist.pendingApprovalCount === 0 &&
    input.payroll.checklist.exceptionCount === 0;
  const payslipsReleased =
    input.payroll.runStatus === "released" &&
    input.payroll.releasedPayslipCount > 0 &&
    flowEvidence.payslipViewSmokePassed;
  const leaveKpiStatus = worstKpiStatus(kpis, ["first_leave_success_time", "manager_leave_approval_time"]);
  const mobileKpiStatus = kpiStatus(kpis, "employee_mobile_task_completion");
  const payrollKpiStatus = kpiStatus(kpis, "payroll_close_reduction");
  const auditKpiStatus = kpiStatus(kpis, "audit_log_coverage");
  const payrollAccessKpiStatus = kpiStatus(kpis, "unauthorized_payroll_access");
  const cohortHasPilotSize =
    input.employeeCount >= targetEmployeeRange.min && input.employeeCount <= targetEmployeeRange.max;
  const cohortHasManagerLine = input.managerCount >= 1;

  const items: BetaPilotReadinessItem[] = [
    {
      id: "cohort_size",
      area: "Cohort",
      title: "20-50 人試用名單",
      status: cohortHasPilotSize && cohortHasManagerLine
        ? "ready"
        : input.employeeCount === 0
          ? "blocked"
          : "action_required",
      detail: `${input.employeeCount} 位員工、${input.managerCount} 位主管在目前公司資料中；目標是 ${targetEmployeeRange.min}-${targetEmployeeRange.max} 人且至少 1 條主管簽核線。`,
      nextStep: "匯入實際試用員工、主管、HR 與老闆帳號，並補齊員工的直屬主管，讓試用規模足以驗證日常與簽核流程。",
      actionLabel: "匯入員工",
      actionHref: "/hr/employee-import",
    },
    {
      id: "tenant_auth",
      area: "Security",
      title: "試用租戶、登入與角色分流",
      status: combinedStatus(launchItems, ["database", "tenant_seed", "security", "sso_identities"]),
      detail: launchDetail(launchItems, ["database", "tenant_seed", "security", "sso_identities"]),
      nextStep: "確保試用租戶使用 PostgreSQL、角色已指派，且員工前台與管理後台會依角色分流。",
      actionLabel: "檢查登入",
      actionHref: "/settings/access",
    },
    {
      id: "employee_frontstage",
      area: "Employee UX",
      title: "員工手機前台可完成日常任務",
      status: flowEvidence.roleDashboardSmokePassed &&
        flowEvidence.employeeMobileSmokePassed &&
        mobileKpiStatus !== "failing"
        ? mobileKpiStatus === "passing" ? "ready" : "action_required"
        : "action_required",
      detail: `${flowEvidence.roleDashboardSmokePassed ? "角色分流已測" : "角色分流未驗證"}；${flowEvidence.employeeMobileSmokePassed ? "手機任務 smoke 已測" : "手機任務 smoke 未驗證"}；手機任務 KPI ${mobileKpiStatus}。`,
      nextStep: "用手機實測今日卡、打卡、請假、加班、補打卡、通知與薪資單入口，任務不可藏在深層選單。",
      actionLabel: "開啟員工前台",
      actionHref: "/app",
    },
    {
      id: "attendance_leave_approval",
      area: "Manager UX",
      title: "打卡、請假與主管簽核主流程",
      status: flowEvidence.clockInOutSmokePassed &&
        flowEvidence.leaveApprovalSmokePassed &&
        flowEvidence.managerInboxSmokePassed &&
        leaveKpiStatus !== "failing"
        ? leaveKpiStatus === "passing" ? "ready" : "action_required"
        : "action_required",
      detail: `${flowEvidence.clockInOutSmokePassed ? "打卡 smoke 已測" : "打卡 smoke 未驗證"}；${flowEvidence.leaveApprovalSmokePassed ? "請假簽核 smoke 已測" : "請假簽核 smoke 未驗證"}；請假/簽核 KPI ${leaveKpiStatus}。`,
      nextStep: "跑一次員工請假、主管 Inbox 核准、員工看狀態的完整流程，並確認主管平均簽核時間接近 15 秒。",
      actionLabel: "開啟主管 Inbox",
      actionHref: "/manager/inbox",
    },
    {
      id: "announcements",
      area: "HR Ops",
      title: "公告與通知回條",
      status: flowEvidence.announcementReceiptSmokePassed
        ? launchItemStatus(launchItems, "notifications") === "blocked" ? "blocked" : "ready"
        : "action_required",
      detail: `${flowEvidence.announcementReceiptSmokePassed ? "公告回條 smoke 已測" : "公告回條 smoke 未驗證"}；通知管道 ${launchItemStatus(launchItems, "notifications")}。`,
      nextStep: "發布一則試用公告，確認員工收到、閱讀並回傳回條；外部通知未上線時至少要保留站內通知紀錄。",
      actionLabel: "發布公告",
      actionHref: "/hr/announcements",
    },
    {
      id: "payroll_dry_run",
      area: "Payroll",
      title: "HR 月結與薪資預演",
      status: payrollRunRehearsed && flowEvidence.payrollCloseSmokePassed
        ? payrollKpiStatus === "failing" ? "action_required" : "ready"
        : input.payroll.runStatus === "blocked"
          ? "blocked"
          : "action_required",
      detail: input.payroll.runStatus
        ? `薪資批次 ${input.payroll.runStatus}；${input.payroll.payrollItemCount} 筆 payroll item；待簽核 ${input.payroll.checklist.pendingApprovalCount}；異常 ${input.payroll.checklist.exceptionCount}；月結 KPI ${payrollKpiStatus}。`
        : "尚未建立薪資批次。",
      nextStep: "建立月結批次、清掉出勤異常與待簽核、試算薪資草稿，HR 確認後再鎖定，不可靜默完成薪資。",
      actionLabel: "開啟月結",
      actionHref: "/hr",
    },
    {
      id: "payslip_access",
      area: "Payroll",
      title: "員工可看自己的薪資單",
      status: payslipsReleased ? "ready" : "action_required",
      detail: `${input.payroll.releasedPayslipCount} 張薪資單已發布；${flowEvidence.payslipViewSmokePassed ? "薪資單自助查看已測" : "薪資單自助查看未驗證"}。`,
      nextStep: "發布試用薪資單並確認員工只能看自己的薪資單；主管預設不可看部屬薪資。",
      actionLabel: "開啟薪資單",
      actionHref: "/app/payslip",
    },
    {
      id: "sensitive_data_guardrails",
      area: "Security",
      title: "敏感資料與未授權薪資存取防漏",
      status: combinedStatus(launchItems, ["privacy", "audit", "payment_security", "support_access"]) === "ready" &&
        auditKpiStatus === "passing" &&
        payrollAccessKpiStatus === "passing"
        ? "ready"
        : combinedStatus(launchItems, ["privacy", "audit", "payment_security", "support_access"]) === "blocked"
          ? "blocked"
          : "action_required",
      detail: `Audit KPI ${auditKpiStatus}；薪資未授權存取 KPI ${payrollAccessKpiStatus}；薪資/個資相關 launch gate ${combinedStatus(launchItems, ["privacy", "audit", "payment_security", "support_access"])}。`,
      nextStep: "在試用前跑權限矩陣，確認個資、薪資、銀行帳號、身分證、健康資料不會被未授權角色或 logs 洩漏。",
      actionLabel: "開啟稽核",
      actionHref: "/settings/audit",
    },
    {
      id: "two_week_operating_loop",
      area: "HR Ops",
      title: "2 週試用營運節奏",
      status: trialDays >= 14 && launchItemStatus(launchItems, "operational_resilience") !== "blocked"
        ? launchItemStatus(launchItems, "operational_resilience") === "ready" ? "ready" : "action_required"
        : "blocked",
      detail: `${trialDays} 天試用節奏；營運韌性 ${launchItemStatus(launchItems, "operational_resilience")}。`,
      nextStep: "建立第 1 天導入、第 3 天修正、第 7 天月結預演、第 14 天回顧的試用節奏，並確保備份/還原證據可用。",
      actionLabel: "檢查韌性",
      actionHref: "/settings/operational-resilience",
    },
    {
      id: "hr_self_service",
      area: "HR Ops",
      title: "HR 可自行調整表單與政策",
      status: combinedStatus(launchItems, ["law_rules", "work_rules", "labor_roster"]) === "blocked"
        ? "blocked"
        : kpiStatus(kpis, "hr_self_serve_form_creation") === "failing"
          ? "action_required"
          : "ready",
      detail: `表單自建 KPI ${kpiStatus(kpis, "hr_self_serve_form_creation")}；法規/規章/名卡 gate ${combinedStatus(launchItems, ["law_rules", "work_rules", "labor_roster"])}。`,
      nextStep: "讓 HR 在不找工程的情況下建立一張試用用表單、調整簽核流程、確認政策來源與法規規則版本。",
      actionLabel: "開啟表單建立器",
      actionHref: "/hr/forms",
    },
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  const actionRequiredCount = items.filter((item) => item.status === "action_required").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const phases = buildPilotPhases(items);
  return {
    readyForPilot: blockedCount === 0 && actionRequiredCount === 0,
    trialDays,
    targetEmployeeRange,
    readyCount,
    actionRequiredCount,
    blockedCount,
    items,
    phases,
    runbook: buildPilotRunbook(items),
  };
}

async function getPilotPayrollSnapshot(session: SessionLike): Promise<BetaPilotReadinessInput["payroll"]> {
  try {
    const dashboard = await getPayrollDashboard({
      ...session,
      employee: session.employee ?? null,
    });
    return {
      runStatus: dashboard.run?.status ?? null,
      payrollItemCount: dashboard.run?.items.length ?? 0,
      releasedPayslipCount: dashboard.run?.payslips.filter((payslip) => payslip.status === "released").length ?? 0,
      auditCount: dashboard.run?.auditCount ?? 0,
      checklist: dashboard.checklist,
    };
  } catch {
    return {
      runStatus: null,
      payrollItemCount: 0,
      releasedPayslipCount: 0,
      auditCount: 0,
      checklist: {
        attendanceComplete: false,
        pendingApprovalCount: 0,
        exceptionCount: 0,
        canLock: false,
      },
    };
  }
}

function envFlowEvidence(): Partial<BetaPilotFlowEvidence> {
  const verified = process.env.HR_ONE_E2E_SMOKE_STATUS === "passed";
  if (!verified) return {};
  return {
    roleDashboardSmokePassed: true,
    employeeMobileSmokePassed: true,
    clockInOutSmokePassed: true,
    leaveApprovalSmokePassed: true,
    managerInboxSmokePassed: true,
    announcementReceiptSmokePassed: true,
    payrollCloseSmokePassed: true,
    payslipViewSmokePassed: true,
  };
}

function buildPilotPhases(items: BetaPilotReadinessItem[]): BetaPilotPhase[] {
  return [
    pilotPhase({
      step: 1,
      title: "建立 20-50 人試用環境",
      itemIds: ["cohort_size", "tenant_auth", "two_week_operating_loop"],
      summary: "先讓公司、員工、主管、HR、老闆資料與登入分流可用。",
      actionLabel: "檢查設定",
      actionHref: "/settings/readiness",
      items,
    }),
    pilotPhase({
      step: 2,
      title: "驗證員工與主管日常流程",
      itemIds: ["employee_frontstage", "attendance_leave_approval", "announcements"],
      summary: "用手機跑打卡、請假、簽核、公告回條與通知。",
      actionLabel: "開啟員工前台",
      actionHref: "/app",
      items,
    }),
    pilotPhase({
      step: 3,
      title: "完成 HR 月結與薪資單預演",
      itemIds: ["payroll_dry_run", "payslip_access"],
      summary: "HR 必須先處理異常、試算、確認、鎖定，再發布薪資單。",
      actionLabel: "開啟月結",
      actionHref: "/hr",
      items,
    }),
    pilotPhase({
      step: 4,
      title: "封住敏感資料與 HR 自助維運",
      itemIds: ["sensitive_data_guardrails", "hr_self_service"],
      summary: "確保薪資、個資、文件、AI、audit 與表單維運不需要工程救火。",
      actionLabel: "開啟稽核",
      actionHref: "/settings/audit",
      items,
    }),
  ];
}

function buildPilotRunbook(items: BetaPilotReadinessItem[]): BetaPilotRunbookStep[] {
  return [
    runbookStep({
      id: "preflight",
      timing: "試用前 3-5 天",
      title: "建立試用名單、登入與權限防線",
      owner: "Owner + HR",
      itemIds: ["cohort_size", "tenant_auth", "sensitive_data_guardrails"],
      objective: "確認 20-50 人、主管線、HR/主管/員工角色分流與薪資/個資防漏都可用。",
      checklist: [
        "匯入員工、主管、HR 與老闆帳號",
        "確認員工前台與管理後台依角色分流",
        "跑 payroll access 與 audit guardrail 檢查",
      ],
      evidence: "員工數、主管數、登入 gate、audit KPI、未授權薪資存取 KPI 都在 readiness 中可追溯。",
      actionLabel: "檢查試用 Gate",
      actionHref: "/settings/readiness",
      items,
    }),
    runbookStep({
      id: "day_1",
      timing: "第 1 天",
      title: "員工手機上線與公告回條",
      owner: "HR",
      itemIds: ["employee_frontstage", "announcements"],
      objective: "讓員工用手機完成今日卡、打卡入口、通知與試用公告回條。",
      checklist: [
        "發布試用公告",
        "確認員工可從手機進入前台",
        "確認公告回條與通知紀錄保留",
      ],
      evidence: "公告回條 smoke、手機任務 KPI、通知 gate 都在 readiness 中反映。",
      actionLabel: "發布公告",
      actionHref: "/hr/announcements",
      items,
    }),
    runbookStep({
      id: "day_3",
      timing: "第 3 天",
      title: "打卡、請假與主管簽核修正",
      owner: "HR + Manager",
      itemIds: ["attendance_leave_approval"],
      objective: "跑員工打卡、請假送出、主管 Inbox 核准/駁回、員工看狀態的完整閉環。",
      checklist: [
        "至少一位員工完成 clock in/out",
        "至少一筆請假由主管 Inbox 核准或駁回",
        "HR 檢查出勤異常是否能在月底前處理",
      ],
      evidence: "打卡 smoke、請假簽核 smoke、主管 Inbox smoke 與請假/簽核 KPI 都在同一個 gate 中顯示。",
      actionLabel: "開啟主管 Inbox",
      actionHref: "/manager/inbox",
      items,
    }),
    runbookStep({
      id: "day_7",
      timing: "第 7 天",
      title: "HR 月結與薪資預演",
      owner: "HR",
      itemIds: ["payroll_dry_run", "payslip_access"],
      objective: "HR 先清出勤異常與待簽核，再產生薪資草稿、鎖定、發布試用薪資單。",
      checklist: [
        "建立月結批次",
        "待簽核與出勤異常歸零後重新試算",
        "發布薪資單並確認員工只能看自己的薪資單",
      ],
      evidence: "payroll item、pending approval、exception、lock/release、payslip self-view 都在 payroll gate 中可追蹤。",
      actionLabel: "開啟月結",
      actionHref: "/hr",
      items,
    }),
    runbookStep({
      id: "day_14",
      timing: "第 14 天",
      title: "試用回顧與正式上線判斷",
      owner: "Owner + HR",
      itemIds: ["two_week_operating_loop", "hr_self_service", "sensitive_data_guardrails"],
      objective: "確認兩週內的 HR 自助、audit、權限與營運韌性足以支撐下一家客戶。",
      checklist: [
        "檢查試用 KPI 與待處理 gate",
        "確認 HR 可自行調整表單與政策",
        "匯出 audit evidence 並檢查備份/還原證據",
      ],
      evidence: "第 14 天不看單一功能完成，而是看 readiness 是否仍有 blocker 或敏感資料風險。",
      actionLabel: "回到試用 Gate",
      actionHref: "/settings/readiness",
      items,
    }),
  ];
}

function runbookStep(input: {
  id: string;
  timing: string;
  title: string;
  owner: BetaPilotRunbookStep["owner"];
  itemIds: string[];
  objective: string;
  checklist: string[];
  evidence: string;
  actionLabel: string;
  actionHref: string;
  items: BetaPilotReadinessItem[];
}): BetaPilotRunbookStep {
  const openItems = input.items
    .filter((item) => input.itemIds.includes(item.id) && item.status !== "ready")
    .map((item) => ({
      title: item.title,
      status: item.status,
      nextStep: item.nextStep,
    }));
  const status = openItems.some((item) => item.status === "blocked")
    ? "blocked"
    : openItems.length > 0
      ? "action_required"
      : "ready";
  const firstOpenItem = input.items.find((item) => input.itemIds.includes(item.id) && item.status !== "ready");
  return {
    id: input.id,
    timing: input.timing,
    title: input.title,
    owner: input.owner,
    status,
    itemIds: input.itemIds,
    objective: input.objective,
    checklist: input.checklist,
    evidence: input.evidence,
    openItems,
    actionLabel: firstOpenItem?.actionLabel ?? input.actionLabel,
    actionHref: firstOpenItem?.actionHref ?? input.actionHref,
  };
}

function pilotPhase(input: {
  step: number;
  title: string;
  itemIds: string[];
  summary: string;
  actionLabel: string;
  actionHref: string;
  items: BetaPilotReadinessItem[];
}): BetaPilotPhase {
  const matchedItems = input.items.filter((item) => input.itemIds.includes(item.id));
  const status = matchedItems.some((item) => item.status === "blocked")
    ? "blocked"
    : matchedItems.some((item) => item.status === "action_required")
      ? "action_required"
      : "ready";
  const firstOpenItem = matchedItems.find((item) => item.status !== "ready");
  return {
    step: input.step,
    title: input.title,
    status,
    itemIds: input.itemIds,
    summary: firstOpenItem ? `${input.summary} 下一步：${firstOpenItem.nextStep}` : input.summary,
    actionLabel: firstOpenItem?.actionLabel ?? input.actionLabel,
    actionHref: firstOpenItem?.actionHref ?? input.actionHref,
  };
}

type LaunchReadinessSummary = Pick<LaunchReadinessItem, "id" | "title" | "status" | "detail">;

function combinedStatus(items: Map<string, LaunchReadinessSummary>, ids: string[]) {
  const statuses = ids.map((id) => launchItemStatus(items, id));
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("action_required")) return "action_required";
  return "ready";
}

function launchItemStatus(items: Map<string, LaunchReadinessSummary>, id: string) {
  return items.get(id)?.status ?? "blocked";
}

function launchDetail(items: Map<string, LaunchReadinessSummary>, ids: string[]) {
  return ids
    .map((id) => {
      const item = items.get(id);
      return item ? `${item.title}: ${item.status}` : `${id}: missing`;
    })
    .join("；");
}

function kpiStatus(kpis: Map<string, HrOneKpi>, id: string) {
  return kpis.get(id)?.status ?? "failing";
}

function worstKpiStatus(kpis: Map<string, HrOneKpi>, ids: string[]) {
  const statuses = ids.map((id) => kpiStatus(kpis, id));
  if (statuses.includes("failing")) return "failing";
  if (statuses.includes("watch")) return "watch";
  return "passing";
}
