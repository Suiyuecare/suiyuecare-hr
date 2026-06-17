import type { PilotDailyStatusItem, PilotDailyStatusReport } from "@/server/readiness/pilot-daily-status";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotMorningBriefStatus = "blocked" | "needs_evidence" | "ready_for_today" | "complete";

export type PilotMorningBriefItem = {
  title: string;
  status: PilotDailyStatusItem["status"];
  evidence: string;
  nextStep: string;
};

export type PilotMorningBriefReport = {
  status: PilotMorningBriefStatus;
  generatedAt: string;
  trialDay: number;
  phaseTitle: string;
  headline: string;
  focus: string;
  blockerCount: number;
  evidenceGapCount: number;
  readyCount: number;
  blockers: PilotMorningBriefItem[];
  evidenceGaps: PilotMorningBriefItem[];
  nextActions: string[];
  privacyGuardrails: string[];
  sharingNote: string;
};

export function buildPilotMorningBriefReport(input: {
  dailyStatus: PilotDailyStatusReport;
  generatedAt?: Date;
}): PilotMorningBriefReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const blockers = input.dailyStatus.requiredItems
    .filter((item) => item.status === "blocked")
    .map(toBriefItem);
  const evidenceGaps = input.dailyStatus.requiredItems
    .filter((item) => item.status !== "ready" && item.status !== "blocked")
    .map(toBriefItem);
  const status = mapStatus(input.dailyStatus.status);
  const nextActions = buildNextActions(input.dailyStatus, blockers, evidenceGaps, status);

  return {
    status,
    generatedAt,
    trialDay: input.dailyStatus.day,
    phaseTitle: redactPilotBriefText(input.dailyStatus.phaseTitle),
    headline: buildHeadline(input.dailyStatus, status),
    focus: redactPilotBriefText(input.dailyStatus.phaseGoal),
    blockerCount: blockers.length,
    evidenceGapCount: evidenceGaps.length,
    readyCount: input.dailyStatus.readyCount,
    blockers,
    evidenceGaps,
    nextActions,
    privacyGuardrails: [
      ...new Set([
        ...input.dailyStatus.privacyGuardrails,
        "Morning brief notes must stay aggregate or hash-only; never paste employee names, emails, salaries, bank data, national IDs, health data, database URLs, tokens, or private HR notes.",
      ].map(redactPilotBriefText)),
    ],
    sharingNote: "This brief is safe for the pilot operations team only after reviewing that evidence refs are hash-only and screenshots contain no raw sensitive data.",
  };
}

export function pilotMorningBriefPassed(report: PilotMorningBriefReport) {
  return report.status === "ready_for_today" || report.status === "complete";
}

export function formatPilotMorningBriefMarkdown(report: PilotMorningBriefReport) {
  return [
    "# HR One Pilot Morning Brief",
    "",
    `Generated at: ${report.generatedAt}`,
    `Trial day: ${report.trialDay}`,
    `Status: ${report.status}`,
    `Phase: ${report.phaseTitle}`,
    `Headline: ${report.headline}`,
    "",
    "## Today's Focus",
    "",
    redactPilotBriefText(report.focus),
    "",
    "## Gate Summary",
    "",
    `- Ready item(s): ${report.readyCount}`,
    `- Evidence gap(s): ${report.evidenceGapCount}`,
    `- Blocker(s): ${report.blockerCount}`,
    "",
    "## Blockers",
    "",
    ...formatItems(report.blockers, "No blockers for today's checkpoint."),
    "",
    "## Evidence Gaps",
    "",
    ...formatItems(report.evidenceGaps, "No production evidence gaps for today's checkpoint."),
    "",
    "## Next Actions",
    "",
    ...formatList(report.nextActions, "No action required before today's pilot work continues."),
    "",
    "## Privacy Guardrails",
    "",
    ...formatList(report.privacyGuardrails, "No additional guardrails."),
    "",
    "## Sharing Note",
    "",
    redactPilotBriefText(report.sharingNote),
    "",
  ].join("\n");
}

export function redactPilotBriefText(value: string) {
  return redactSensitiveDetail(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, "[REDACTED]")
    .replace(/\bsb_secret_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]")
    .replace(/\b[A-Z][12]\d{8}\b/gi, "[REDACTED_NATIONAL_ID]")
    .replace(/(身分證字號|身分證|統一證號|居留證號|national id|id number)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/(銀行帳號|帳號|account number|bank account)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/(薪資|底薪|本薪|base salary|salary amount)\s*[:：=]\s*\$?\d[\d,]*/gi, "$1=[REDACTED]")
    .replace(/(健康資料|病歷|診斷|health data|medical record|diagnosis)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]");
}

function mapStatus(status: PilotDailyStatusReport["status"]): PilotMorningBriefStatus {
  if (status === "needs_production_evidence") return "needs_evidence";
  return status;
}

function buildHeadline(
  dailyStatus: PilotDailyStatusReport,
  status: PilotMorningBriefStatus,
) {
  const prefix = status === "blocked"
    ? "Blocked"
    : status === "needs_evidence"
      ? "Needs production evidence"
      : status === "complete"
        ? "Pilot completion gate passed"
        : "Ready for today's pilot work";
  return redactPilotBriefText(`${prefix}: Day ${dailyStatus.day} - ${dailyStatus.phaseTitle}`);
}

function buildNextActions(
  dailyStatus: PilotDailyStatusReport,
  blockers: PilotMorningBriefItem[],
  evidenceGaps: PilotMorningBriefItem[],
  status: PilotMorningBriefStatus,
) {
  const actions = [
    ...dailyStatus.nextActions,
    ...(status === "blocked" && blockers.length > 0
      ? ["Clear blocker(s) before inviting or continuing employee pilot activity."]
      : []),
    ...(status === "needs_evidence" && evidenceGaps.length > 0
      ? ["Capture production tenant evidence for the gap(s), using hash-only refs and aggregate counts."]
      : []),
  ].map(redactPilotBriefText);
  return [...new Set(actions)];
}

function toBriefItem(item: PilotDailyStatusItem): PilotMorningBriefItem {
  return {
    title: redactPilotBriefText(item.title),
    status: item.status,
    evidence: redactPilotBriefText(item.evidence),
    nextStep: redactPilotBriefText(item.nextStep),
  };
}

function formatItems(items: PilotMorningBriefItem[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => [
    `- [${item.status.toUpperCase()}] ${redactPilotBriefText(item.title)}`,
    `  - Evidence: ${redactPilotBriefText(item.evidence)}`,
    `  - Next step: ${redactPilotBriefText(item.nextStep)}`,
  ].join("\n"));
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactPilotBriefText(item)}`);
}
