import type { RoleKey } from "@/server/auth/rbac";
import {
  getBetaPilotCheckpointCoverage,
  type BetaPilotCheckpointCoverage,
  type BetaPilotCheckpointId,
  type BetaPilotCheckpointStatus,
  type BetaPilotEvidenceType,
} from "@/server/readiness/beta-pilot-checkpoints";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type PilotOperationsStatus = "not_started" | "in_progress" | "blocked" | "complete";

export type PilotOperationsPhaseStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "verified";

export type PilotOperationsPhase = {
  checkpointId: BetaPilotCheckpointId;
  timing: string;
  title: string;
  owner: "老闆 + HR" | "HR" | "主管" | "員工" | "HR + 主管";
  goal: string;
  checklist: string[];
  requiredEvidenceTypes: BetaPilotEvidenceType[];
  optionalEvidenceTypes: BetaPilotEvidenceType[];
  recordedEvidenceTypes: BetaPilotEvidenceType[];
  missingEvidenceTypes: BetaPilotEvidenceType[];
  latestStatus: BetaPilotCheckpointStatus;
  status: PilotOperationsPhaseStatus;
  recordedCount: number;
  latestRecordedAt: Date | null;
  actionHref: string;
  actionLabel: string;
  nextStep: string;
};

export type PilotOperationsTodayGateStatus = "blocked" | "needs_evidence" | "ready_to_continue";

export type PilotOperationsDailyTaskTone = "ready" | "warning" | "danger";

export type PilotOperationsDailyTask = {
  id: string;
  timing: string;
  title: string;
  detail: string;
  evidence: string;
  actionHref: string;
  actionLabel: string;
  tone: PilotOperationsDailyTaskTone;
};

export type PilotOperationsTodayGate = {
  trialDay: number | null;
  scheduledCheckpointId: BetaPilotCheckpointId;
  focusCheckpointId: BetaPilotCheckpointId;
  title: string;
  timing: string;
  status: PilotOperationsTodayGateStatus;
  detail: string;
  missingEvidenceTypes: BetaPilotEvidenceType[];
  actionHref: string;
  actionLabel: string;
  nextStep: string;
  dailyTasks: PilotOperationsDailyTask[];
};

export type PilotOperationsReport = {
  status: PilotOperationsStatus;
  generatedAt: string;
  todayGate: PilotOperationsTodayGate;
  completedPhaseCount: number;
  blockedPhaseCount: number;
  inProgressPhaseCount: number;
  totalRecordedEvidenceCount: number;
  currentPhase: PilotOperationsPhase | null;
  phases: PilotOperationsPhase[];
  nextActions: string[];
  privacyGuardrails: string[];
};

type PilotOperationsInput = {
  coverage: BetaPilotCheckpointCoverage[];
  generatedAt?: Date;
  trialDay?: number | null;
};

type PilotPhaseDefinition = Omit<
  PilotOperationsPhase,
  | "recordedEvidenceTypes"
  | "missingEvidenceTypes"
  | "latestStatus"
  | "status"
  | "recordedCount"
  | "latestRecordedAt"
>;

const phaseDefinitions: PilotPhaseDefinition[] = [
  {
    checkpointId: "preflight",
    timing: "試用前 / Day 0",
    title: "發邀請前權限與名單防線",
    owner: "老闆 + HR",
    goal: "確認 20-50 人名單、登入、角色、薪資/個資防漏與備份還原證據都可用。",
    checklist: ["試用邀請就緒通過", "權限防漏檢查完成", "備份還原證據已保存"],
    requiredEvidenceTypes: ["access_review"],
    optionalEvidenceTypes: ["backup_restore"],
    actionHref: "/settings/pilot-invite-readiness",
    actionLabel: "檢查邀請",
    nextStep: "先跑試用邀請就緒與權限防漏檢查，再發第一封員工邀請。",
  },
  {
    checkpointId: "day_1",
    timing: "第 1 天",
    title: "員工上線、打卡入口與公告回條",
    owner: "HR",
    goal: "讓員工能進入手機前台、讀公告、回傳回條，並知道今天要打卡與申請的位置。",
    checklist: ["發布試用公告", "確認公告回條", "抽查手機前台可用"],
    requiredEvidenceTypes: ["announcement_receipt"],
    optionalEvidenceTypes: ["smoke_test"],
    actionHref: "/hr/announcements",
    actionLabel: "發布公告",
    nextStep: "發布 Day 1 公告並確認回條，避免 HR 用群組訊息人工追進度。",
  },
  {
    checkpointId: "day_3",
    timing: "第 3 天",
    title: "打卡、請假與主管簽核穩定",
    owner: "HR + 主管",
    goal: "員工能打卡與請假，主管能在同一個 Inbox 完成簽核，狀態會回到員工端。",
    checklist: ["完成打卡 smoke", "完成請假送出", "主管 Inbox 核准或駁回"],
    requiredEvidenceTypes: ["smoke_test", "approval_flow"],
    optionalEvidenceTypes: [],
    actionHref: "/manager/inbox",
    actionLabel: "開啟 Inbox",
    nextStep: "請一位員工送出請假，直屬主管從 Inbox 處理，確認員工端看得到結果。",
  },
  {
    checkpointId: "day_7",
    timing: "第 7 天",
    title: "HR 月結預演與薪資單查看",
    owner: "HR",
    goal: "HR 清掉出勤異常與待簽核，跑月結預演，釋出薪資單並驗證員工只能看自己的薪資單。",
    checklist: ["清出勤異常", "完成薪資預演", "釋出薪資單", "員工自助查看"],
    requiredEvidenceTypes: ["payroll_rehearsal", "payslip_access"],
    optionalEvidenceTypes: [],
    actionHref: "/hr",
    actionLabel: "開啟月結",
    nextStep: "完成 HR 月結預演，再由員工帳號查看本人薪資單，確認主管預設不能看部屬薪資。",
  },
  {
    checkpointId: "day_14",
    timing: "第 14 天",
    title: "結案、audit 與敏感資料檢查",
    owner: "老闆 + HR",
    goal: "只在 audit、KPI、權限與證據隱私都過關時，把兩週試用標記為可結案。",
    checklist: ["跑結案檢查", "掃描證據資料夾", "確認 audit 與權限防漏"],
    requiredEvidenceTypes: ["audit_export"],
    optionalEvidenceTypes: [],
    actionHref: "/settings/pilot-completion",
    actionLabel: "結案檢查",
    nextStep: "跑第 14 天結案檢查與證據掃描，不可把 raw 個資、薪資、銀行帳號放進報告。",
  },
];

const privacyGuardrails = [
  "每日戰情只保存彙總狀態、證據類型與 hash-only 證據代碼。",
  "不要在證據摘要、下一步或截圖中放入姓名、Email、薪資、銀行帳號、身分證、健康資料或私人 HR 備註。",
  "薪資單證據只驗證本人可見與未授權不可見，不需要貼出薪資金額。",
  "任何要對外分享的試用報告，都要先跑 pilot:evidence-scan。",
];

export async function getPilotOperationsReport(
  session: SessionLike,
  options: { trialDay?: number | null } = {},
) {
  return buildPilotOperationsReport({
    coverage: await getBetaPilotCheckpointCoverage(session),
    trialDay: options.trialDay ?? null,
  });
}

export function buildPilotOperationsReport(input: PilotOperationsInput): PilotOperationsReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const coverageByCheckpoint = new Map(
    input.coverage.map((coverage) => [coverage.checkpointId, coverage]),
  );
  const phases = phaseDefinitions.map((definition) => {
    const coverage = coverageByCheckpoint.get(definition.checkpointId);
    return buildPhase(definition, coverage);
  });
  const completedPhaseCount = phases.filter((phase) => phase.status === "verified").length;
  const blockedPhaseCount = phases.filter((phase) => phase.status === "blocked").length;
  const inProgressPhaseCount = phases.filter((phase) => phase.status === "in_progress").length;
  const totalRecordedEvidenceCount = phases.reduce((sum, phase) => sum + phase.recordedCount, 0);
  const currentPhase = phases.find((phase) => phase.status !== "verified") ?? null;
  const todayGate = buildTodayGate(phases, input.trialDay ?? null);

  return {
    status: summarizeStatus(phases),
    generatedAt,
    todayGate,
    completedPhaseCount,
    blockedPhaseCount,
    inProgressPhaseCount,
    totalRecordedEvidenceCount,
    currentPhase,
    phases,
    nextActions: phases
      .filter((phase) => phase.status !== "verified")
      .map((phase) => phase.nextStep),
    privacyGuardrails,
  };
}

function buildTodayGate(
  phases: PilotOperationsPhase[],
  trialDay: number | null,
): PilotOperationsTodayGate {
  const scheduledCheckpointId = checkpointForTrialDay(trialDay);
  const scheduledPhase = phaseById(phases, scheduledCheckpointId);
  const scheduledIndex = phaseDefinitions.findIndex((phase) => phase.checkpointId === scheduledCheckpointId);
  const earliestOpenPhase = phases.find((phase, index) =>
    index <= scheduledIndex && phase.status !== "verified",
  );
  const focusPhase = earliestOpenPhase ?? scheduledPhase;
  return {
    trialDay,
    scheduledCheckpointId,
    focusCheckpointId: focusPhase.checkpointId,
    title: focusPhase.title,
    timing: focusPhase.timing,
    status: todayGateStatus(focusPhase),
    detail: todayGateDetail(focusPhase, scheduledPhase, trialDay),
    missingEvidenceTypes: focusPhase.missingEvidenceTypes,
    actionHref: focusPhase.actionHref,
    actionLabel: focusPhase.actionLabel,
    nextStep: focusPhase.status === "verified"
      ? "今天的必要證據已收齊，繼續監控打卡、簽核、公告與薪資單權限，不需要保存 raw 個資或薪資內容。"
      : focusPhase.nextStep,
    dailyTasks: buildDailyTasks(focusPhase, scheduledPhase, trialDay),
  };
}

function buildDailyTasks(
  focusPhase: PilotOperationsPhase,
  scheduledPhase: PilotOperationsPhase,
  trialDay: number | null,
): PilotOperationsDailyTask[] {
  const prefix =
    focusPhase.checkpointId === scheduledPhase.checkpointId
      ? ""
      : `目前排程已到 ${scheduledPhase.timing}，但需先補 ${focusPhase.timing}。`;
  const verified = focusPhase.status === "verified";
  const tone: PilotOperationsDailyTaskTone =
    focusPhase.status === "blocked" ? "danger" : verified ? "ready" : "warning";
  const taskBuilders: Record<BetaPilotCheckpointId, () => PilotOperationsDailyTask[]> = {
    preflight: () => [
      task("preflight-invite", "開跑前", "確認邀請 Gate", `${prefix}確認 20-50 人、登入、角色、主管線、班表、假別餘額與薪資單 self-only 規則。`, "邀請 readiness 報表與 blocker 清單", "/settings/pilot-invite-readiness", "檢查邀請", tone),
      task("preflight-access", "發邀請前", "跑權限防漏", "由 Owner/HR 驗證員工與主管不能讀 payroll dashboard 或他人薪資單；只保存 hash-only 證據。", "access_review checkpoint", "/settings/pilot-invite-readiness#preflight-access-review", "跑權限防漏", tone),
      task("preflight-start", "收尾", "決定是否發邀請", `${dayLabel(trialDay)}只能在 hard gate 清零後，才排程正式員工邀請與 Day 1 公告。`, "go/no-go 與發邀請時間", "/settings/readiness", "看上線 Gate", tone),
    ],
    day_1: () => [
      task("day1-entry", "上午", "確認員工進得來", `${prefix}抽查員工手機前台、打卡入口、公告入口與薪資單入口是否可見但不外洩。`, "員工前台 smoke 截圖代碼", "/app", "開員工前台", tone),
      task("day1-announcement", "中午前", "發布試用公告", "發布需要回條的公告，讓員工知道打卡、請假、薪資單與回報問題的入口。", "announcement_receipt checkpoint", "/hr/announcements", "發布公告", tone),
      task("day1-followup", "下班前", "追未讀與登入異常", "只追彙總名單與工單代碼；不要把姓名、Email 或私人 HR 備註貼進戰情報告。", "未完成回條統計", "/settings/pilot-operations#day_1", "記錄證據", tone),
    ],
    day_3: () => [
      task("day3-clock", "上午", "抽查打卡完成", `${prefix}讓至少一位員工完成上班/下班打卡，HR 檢查出勤異常是否能處理。`, "smoke_test checkpoint", "/app/attendance", "看打卡", tone),
      task("day3-approval", "下午", "跑請假與主管簽核", "員工送出請假，直屬主管從統一 Inbox 核准或退回，卡片要顯示風險摘要。", "approval_flow checkpoint", "/manager/inbox", "開啟 Inbox", tone),
      task("day3-employee-result", "收尾", "員工端確認結果", "回到員工手機首頁確認申請狀態時間軸與通知，不用貼申請內容原文。", "員工端狀態證據 hash", "/app#requests", "看申請狀態", tone),
    ],
    day_7: () => [
      task("day7-attendance", "上午", "清出勤與待簽核", `${prefix}先清漏打卡、加班、請假與補卡待簽核，避免薪資草稿帶入未決資料。`, "出勤完整性摘要", "/hr/attendance-exceptions", "清異常", tone),
      task("day7-payroll", "下午", "跑 HR 月結預演", "建立或重算薪資草稿，由 HR 確認例外；不能默默鎖定薪資。", "payroll_rehearsal checkpoint", "/hr", "開月結", tone),
      task("day7-payslip", "收尾", "驗證薪資單權限", "釋出薪資單演練後，以員工帳號看本人薪資單，並確認主管預設不能看部屬薪資。", "payslip_access checkpoint", "/app/payslip", "看薪資單", tone),
    ],
    day_14: () => [
      task("day14-close", "上午", "跑結案檢查", `${prefix}彙整 Day 0/1/3/7/14 證據，任何 blocker 或 warning 都不能結案。`, "trial completion report", "/settings/pilot-completion", "結案檢查", tone),
      task("day14-privacy", "下午", "掃描證據資料夾", "先跑敏感資料掃描，確認報告沒有資料庫 URL、token、薪資、身分證、銀行帳號或健康資料。", "evidence scan report", "/settings/readiness", "看安全 Gate", tone),
      task("day14-kpi", "收尾", "確認 KPI 與交付判斷", "確認請假時間、主管簽核時間、手機完成率、月結預演與 audit 覆蓋率後，再決定是否擴大試用。", "KPI 與 audit_export checkpoint", "/hr/kpis", "看 KPI", tone),
    ],
  };

  return taskBuilders[focusPhase.checkpointId]();
}

function task(
  id: string,
  timing: string,
  title: string,
  detail: string,
  evidence: string,
  actionHref: string,
  actionLabel: string,
  tone: PilotOperationsDailyTaskTone,
): PilotOperationsDailyTask {
  return { id, timing, title, detail, evidence, actionHref, actionLabel, tone };
}

function dayLabel(trialDay: number | null) {
  return trialDay === null ? "尚未建立試用批次；" : `目前第 ${trialDay} 天；`;
}

function checkpointForTrialDay(trialDay: number | null): BetaPilotCheckpointId {
  if (trialDay === null || trialDay <= 0) return "preflight";
  if (trialDay <= 1) return "day_1";
  if (trialDay <= 3) return "day_3";
  if (trialDay <= 7) return "day_7";
  return "day_14";
}

function phaseById(
  phases: PilotOperationsPhase[],
  checkpointId: BetaPilotCheckpointId,
): PilotOperationsPhase {
  const phase = phases.find((item) => item.checkpointId === checkpointId);
  if (!phase) throw new Error(`Missing pilot operations phase ${checkpointId}.`);
  return phase;
}

function todayGateStatus(phase: PilotOperationsPhase): PilotOperationsTodayGateStatus {
  if (phase.status === "blocked") return "blocked";
  if (phase.status === "verified") return "ready_to_continue";
  return "needs_evidence";
}

function todayGateDetail(
  focusPhase: PilotOperationsPhase,
  scheduledPhase: PilotOperationsPhase,
  trialDay: number | null,
) {
  const dayLabel = trialDay === null ? "尚未建立試用批次" : `目前第 ${trialDay} 天`;
  if (focusPhase.checkpointId !== scheduledPhase.checkpointId) {
    return `${dayLabel}，但前一個 checkpoint 尚未完成，今日先補「${focusPhase.title}」。`;
  }
  if (focusPhase.status === "verified") {
    return `${dayLabel} 的必要 checkpoint 已驗證，可繼續下一個營運節點。`;
  }
  if (focusPhase.status === "blocked") {
    return `${dayLabel} 卡在「${focusPhase.title}」，先處理 blocker 才能讓試用證據可信。`;
  }
  return `${dayLabel} 需要收齊「${focusPhase.title}」的 hash-only 證據。`;
}

function buildPhase(
  definition: PilotPhaseDefinition,
  coverage?: BetaPilotCheckpointCoverage,
): PilotOperationsPhase {
  const latestStatus = coverage?.latestStatus ?? "not_started";
  const recordedEvidenceTypes = coverage?.evidenceTypes ?? [];
  const missingEvidenceTypes = definition.requiredEvidenceTypes.filter(
    (evidenceType) => !recordedEvidenceTypes.includes(evidenceType),
  );
  return {
    ...definition,
    recordedEvidenceTypes,
    missingEvidenceTypes,
    latestStatus,
    status: summarizePhaseStatus(latestStatus, missingEvidenceTypes, coverage?.recordedCount ?? 0),
    recordedCount: coverage?.recordedCount ?? 0,
    latestRecordedAt: coverage?.latestRecordedAt ?? null,
  };
}

function summarizePhaseStatus(
  latestStatus: BetaPilotCheckpointStatus,
  missingEvidenceTypes: BetaPilotEvidenceType[],
  recordedCount: number,
): PilotOperationsPhaseStatus {
  if (latestStatus === "blocked") return "blocked";
  if (latestStatus === "verified" && missingEvidenceTypes.length === 0) return "verified";
  if (recordedCount > 0 || latestStatus === "in_progress") return "in_progress";
  return "not_started";
}

function summarizeStatus(phases: PilotOperationsPhase[]): PilotOperationsStatus {
  if (phases.some((phase) => phase.status === "blocked")) return "blocked";
  if (phases.every((phase) => phase.status === "verified")) return "complete";
  if (phases.some((phase) => phase.status === "verified" || phase.status === "in_progress")) return "in_progress";
  return "not_started";
}
