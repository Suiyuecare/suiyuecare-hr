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

export type PilotOperationsReport = {
  status: PilotOperationsStatus;
  generatedAt: string;
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
    actionHref: "/settings/readiness#pilot-runbook",
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

export async function getPilotOperationsReport(session: SessionLike) {
  return buildPilotOperationsReport({
    coverage: await getBetaPilotCheckpointCoverage(session),
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

  return {
    status: summarizeStatus(phases),
    generatedAt,
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
