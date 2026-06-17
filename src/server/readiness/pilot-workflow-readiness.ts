import type {
  BetaPilotCheckpointCoverage,
  BetaPilotCheckpointId,
  BetaPilotEvidenceType,
} from "@/server/readiness/beta-pilot-checkpoints";
import type { PilotAcceptanceItem, PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotWorkflowReadinessStatus =
  | "production_ready"
  | "needs_production_evidence"
  | "blocked";

export type PilotWorkflowReadinessItemStatus =
  | "production_ready"
  | "rehearsed_only"
  | "blocked";

export type PilotWorkflowReadinessItem = {
  id:
    | "clock_in_out"
    | "leave_request"
    | "manager_approval"
    | "announcement"
    | "payroll_rehearsal"
    | "payslip_view"
    | "sensitive_data_guardrails";
  title: string;
  status: PilotWorkflowReadinessItemStatus;
  acceptanceStatus: PilotAcceptanceItem["status"] | "missing";
  productionEvidence: string;
  detail: string;
  nextStep: string;
};

export type PilotWorkflowReadinessReport = {
  status: PilotWorkflowReadinessStatus;
  generatedAt: string;
  requireProductionEvidence: boolean;
  productionReadyCount: number;
  rehearsedOnlyCount: number;
  blockedCount: number;
  items: PilotWorkflowReadinessItem[];
  nextActions: string[];
  privacyGuardrails: string[];
};

type WorkflowDefinition = {
  id: PilotWorkflowReadinessItem["id"];
  title: string;
  acceptanceItemId: PilotAcceptanceItem["id"];
  checkpointId: BetaPilotCheckpointId;
  evidenceTypes: BetaPilotEvidenceType[];
  rehearsalNextStep: string;
  productionNextStep: string;
};

const workflowDefinitions: WorkflowDefinition[] = [
  {
    id: "clock_in_out",
    title: "員工可以完成上下班打卡",
    acceptanceItemId: "clock_in_out",
    checkpointId: "day_3",
    evidenceTypes: ["smoke_test"],
    rehearsalNextStep: "先完成員工手機打卡 rehearsal，再開始真實員工試用。",
    productionNextStep: "請一位真實 pilot 員工完成手機打卡，並在 checkpoint 留 hash-only 證據。",
  },
  {
    id: "leave_request",
    title: "員工可以送出請假",
    acceptanceItemId: "leave_request",
    checkpointId: "day_3",
    evidenceTypes: ["approval_flow"],
    rehearsalNextStep: "先完成請假送出 rehearsal，確認員工端狀態時間軸可讀。",
    productionNextStep: "請一位真實 pilot 員工從手機送出請假，保留 hash-only 流程證據。",
  },
  {
    id: "manager_approval",
    title: "主管可以從統一 Inbox 簽核",
    acceptanceItemId: "manager_approval",
    checkpointId: "day_3",
    evidenceTypes: ["approval_flow"],
    rehearsalNextStep: "先完成主管 Inbox rehearsal，確認核准/退回會通知員工。",
    productionNextStep: "請直屬主管從統一 Inbox 處理 pilot 申請並保留 hash-only 證據。",
  },
  {
    id: "announcement",
    title: "HR 可以發布公告並收回條",
    acceptanceItemId: "announcement",
    checkpointId: "day_1",
    evidenceTypes: ["announcement_receipt"],
    rehearsalNextStep: "先完成公告發布與回條 rehearsal。",
    productionNextStep: "發布真實 pilot 公告並確認員工回條彙總證據。",
  },
  {
    id: "payroll_rehearsal",
    title: "HR 可以完成月結預演",
    acceptanceItemId: "payroll_rehearsal",
    checkpointId: "day_7",
    evidenceTypes: ["payroll_rehearsal"],
    rehearsalNextStep: "先完成月結預演 rehearsal，確認異常與待簽核不會被略過。",
    productionNextStep: "HR 在 pilot tenant 跑月結預演並保留 hash-only 證據。",
  },
  {
    id: "payslip_view",
    title: "員工可以查看自己的薪資單",
    acceptanceItemId: "payslip_view",
    checkpointId: "day_7",
    evidenceTypes: ["payslip_access"],
    rehearsalNextStep: "先完成薪資單查看 rehearsal，確認主管預設不能看部屬薪資。",
    productionNextStep: "釋出 pilot 薪資單並驗證員工只能看自己的薪資單。",
  },
  {
    id: "sensitive_data_guardrails",
    title: "權限與敏感資料防漏已驗證",
    acceptanceItemId: "sensitive_data_guardrails",
    checkpointId: "preflight",
    evidenceTypes: ["access_review"],
    rehearsalNextStep: "先完成權限與敏感資料防漏 rehearsal，不可用 demo 角色直接開跑。",
    productionNextStep: "由 owner/HR 完成 production tenant 權限防漏 access review。",
  },
];

const privacyGuardrails = [
  "Workflow readiness reports must contain only aggregate statuses and hash-only evidence references.",
  "Do not paste employee names, emails, salary amounts, bank accounts, national IDs, health data, database URLs, tokens, or private HR notes into readiness evidence.",
  "Demo rehearsal can prove the code path works, but production evidence is still required before calling the two-week trial successful.",
];

export function buildPilotWorkflowReadinessReport(input: {
  acceptance: PilotAcceptanceReport;
  checkpoints?: BetaPilotCheckpointCoverage[];
  requireProductionEvidence?: boolean;
  generatedAt?: Date;
}): PilotWorkflowReadinessReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const requireProductionEvidence = input.requireProductionEvidence ?? false;
  const checkpointsById = new Map((input.checkpoints ?? []).map((checkpoint) => [checkpoint.checkpointId, checkpoint]));
  const acceptanceItemsById = new Map(input.acceptance.items.map((item) => [item.id, item]));
  const items = workflowDefinitions.map((definition) =>
    buildWorkflowItem(definition, acceptanceItemsById, checkpointsById),
  );
  const productionReadyCount = items.filter((item) => item.status === "production_ready").length;
  const rehearsedOnlyCount = items.filter((item) => item.status === "rehearsed_only").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const status = summarizeStatus({ blockedCount, rehearsedOnlyCount, requireProductionEvidence });

  return {
    status,
    generatedAt,
    requireProductionEvidence,
    productionReadyCount,
    rehearsedOnlyCount,
    blockedCount,
    items,
    nextActions: buildNextActions(items),
    privacyGuardrails,
  };
}

export function pilotWorkflowReadinessPassed(report: PilotWorkflowReadinessReport) {
  if (report.blockedCount > 0) return false;
  if (report.requireProductionEvidence && report.rehearsedOnlyCount > 0) return false;
  return true;
}

export function formatPilotWorkflowReadinessMarkdown(report: PilotWorkflowReadinessReport) {
  return [
    "# HR One Pilot Workflow Readiness",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Require production evidence: ${report.requireProductionEvidence ? "yes" : "no"}`,
    `Matrix: ${report.productionReadyCount} production ready / ${report.rehearsedOnlyCount} rehearsed only / ${report.blockedCount} blocked`,
    "",
    "## Core Workflows",
    "",
    ...report.items.map((item) => [
      `- [${item.status.toUpperCase()}] ${redactWorkflowText(item.title)}`,
      `  - Acceptance: ${item.acceptanceStatus}`,
      `  - Production evidence: ${redactWorkflowText(item.productionEvidence)}`,
      `  - Detail: ${redactWorkflowText(item.detail)}`,
      `  - Next step: ${redactWorkflowText(item.nextStep)}`,
    ].join("\n")),
    "",
    "## Next Actions",
    "",
    ...formatList(report.nextActions, "No workflow readiness action required."),
    "",
    "## Privacy Guardrails",
    "",
    ...formatList(report.privacyGuardrails, "No additional guardrails."),
    "",
  ].join("\n");
}

function buildWorkflowItem(
  definition: WorkflowDefinition,
  acceptanceItemsById: Map<PilotAcceptanceItem["id"], PilotAcceptanceItem>,
  checkpointsById: Map<BetaPilotCheckpointId, BetaPilotCheckpointCoverage>,
): PilotWorkflowReadinessItem {
  const acceptanceItem = acceptanceItemsById.get(definition.acceptanceItemId);
  const checkpoint = checkpointsById.get(definition.checkpointId);
  const productionEvidenceReady = Boolean(
    checkpoint?.latestStatus === "verified" &&
    definition.evidenceTypes.every((evidenceType) => checkpoint.evidenceTypes.includes(evidenceType)),
  );
  const missingEvidenceTypes = definition.evidenceTypes.filter(
    (evidenceType) => !checkpoint?.evidenceTypes.includes(evidenceType),
  );
  const status = productionEvidenceReady
    ? "production_ready"
    : acceptanceItem && acceptanceItem.status !== "blocked"
      ? "rehearsed_only"
      : "blocked";

  return {
    id: definition.id,
    title: definition.title,
    status,
    acceptanceStatus: acceptanceItem?.status ?? "missing",
    productionEvidence: checkpoint
      ? `${checkpoint.latestStatus}; ${checkpoint.recordedCount} record(s); evidence ${checkpoint.evidenceTypes.join(", ") || "none"}; missing ${missingEvidenceTypes.join(", ") || "none"}`
      : `missing ${definition.checkpointId} checkpoint evidence`,
    detail: acceptanceItem
      ? acceptanceItem.evidence
      : `acceptance item ${definition.acceptanceItemId} is missing`,
    nextStep: status === "production_ready"
      ? "Keep the hash-only evidence reference in the pilot folder."
      : status === "rehearsed_only"
        ? definition.productionNextStep
        : definition.rehearsalNextStep,
  };
}

function summarizeStatus(input: {
  blockedCount: number;
  rehearsedOnlyCount: number;
  requireProductionEvidence: boolean;
}): PilotWorkflowReadinessStatus {
  if (input.blockedCount > 0) return "blocked";
  if (input.rehearsedOnlyCount > 0) return input.requireProductionEvidence ? "blocked" : "needs_production_evidence";
  return "production_ready";
}

function buildNextActions(items: PilotWorkflowReadinessItem[]) {
  const actions = items
    .filter((item) => item.status !== "production_ready")
    .map((item) => item.nextStep);
  return [...new Set(actions.map(redactWorkflowText))];
}

function redactWorkflowText(value: string) {
  return redactSensitiveDetail(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, "[REDACTED]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]")
    .replace(/\b[A-Z][12]\d{8}\b/gi, "[REDACTED_NATIONAL_ID]")
    .replace(/(身分證字號|身分證|統一證號|居留證號|national id|id number)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/(銀行帳號|帳號|account number|bank account)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/(薪資|底薪|本薪|base salary|salary amount)\s*[:：=]\s*\$?\d[\d,]*/gi, "$1=[REDACTED]")
    .replace(/(健康資料|病歷|診斷|health data|medical record|diagnosis)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]");
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactWorkflowText(item)}`);
}
