import type { PilotAcceptanceItem, PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotDailyStatus = "blocked" | "needs_production_evidence" | "ready_for_today" | "complete";

export type PilotDailyStatusInput = {
  acceptance: PilotAcceptanceReport;
  day: number;
  generatedAt?: Date;
};

export type PilotDailyStatusItem = {
  id: PilotAcceptanceItem["id"];
  title: string;
  status: PilotAcceptanceItem["status"];
  evidence: string;
  nextStep: string;
};

export type PilotDailyStatusReport = {
  status: PilotDailyStatus;
  generatedAt: string;
  day: number;
  phaseId: PilotDailyPhase["id"];
  phaseTitle: string;
  phaseGoal: string;
  requiredItems: PilotDailyStatusItem[];
  blockedCount: number;
  rehearsedCount: number;
  readyCount: number;
  nextActions: string[];
  privacyGuardrails: string[];
};

type PilotDailyPhase = {
  id: "preflight" | "day_1" | "day_3" | "day_7" | "day_14" | "daily_ops";
  title: string;
  goal: string;
  itemIds: Array<PilotAcceptanceItem["id"]>;
};

const phases: PilotDailyPhase[] = [
  {
    id: "preflight",
    title: "Preflight before employees start",
    goal: "Confirm production, real cohort, and sensitive-data guardrails before inviting employees.",
    itemIds: ["production_foundation", "real_company_cohort", "sensitive_data_guardrails"],
  },
  {
    id: "day_1",
    title: "Day 1 employee rollout",
    goal: "Employees can clock in/out and receive the first announcement without HR handholding.",
    itemIds: ["production_foundation", "real_company_cohort", "clock_in_out", "announcement", "sensitive_data_guardrails"],
  },
  {
    id: "day_3",
    title: "Day 3 leave and approval stabilization",
    goal: "Employees submit leave and managers approve from one Inbox while exceptions stay visible.",
    itemIds: ["clock_in_out", "leave_request", "manager_approval", "sensitive_data_guardrails"],
  },
  {
    id: "day_7",
    title: "Day 7 payroll rehearsal",
    goal: "HR rehearses monthly close and employees verify released payslip access boundaries.",
    itemIds: ["payroll_rehearsal", "payslip_view", "sensitive_data_guardrails"],
  },
  {
    id: "day_14",
    title: "Day 14 final review",
    goal: "Close the trial only after final review, audit evidence, and permission checks are verified.",
    itemIds: [
      "production_foundation",
      "real_company_cohort",
      "clock_in_out",
      "leave_request",
      "manager_approval",
      "announcement",
      "payroll_rehearsal",
      "payslip_view",
      "sensitive_data_guardrails",
      "two_week_completion",
    ],
  },
];

const dailyOpsPhase: PilotDailyPhase = {
  id: "daily_ops",
  title: "Daily pilot operations",
  goal: "Keep attendance, approvals, announcements, and payroll readiness moving without storing raw sensitive evidence.",
  itemIds: ["clock_in_out", "leave_request", "manager_approval", "announcement", "sensitive_data_guardrails"],
};

const privacyGuardrails = [
  "Record only aggregate counts or hash-only evidence references in pilot notes.",
  "Do not paste salary amounts, bank accounts, national IDs, health data, database URLs, or private HR notes into status reports.",
  "Treat synthetic rehearsal evidence as practice only; real customer completion requires production tenant evidence.",
  "Re-run unauthorized payroll and PII access checks before employees receive released payslips.",
];

export function buildPilotDailyStatusReport(input: PilotDailyStatusInput): PilotDailyStatusReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const day = normalizeDay(input.day);
  const phase = phaseForDay(day);
  const itemsById = new Map(input.acceptance.items.map((item) => [item.id, item]));
  const requiredItems = phase.itemIds.map((id) => {
    const item = itemsById.get(id);
    if (!item) throw new Error(`Pilot acceptance report is missing ${id}.`);
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      evidence: redactSensitiveDetail(item.evidence),
      nextStep: redactSensitiveDetail(item.nextStep),
    };
  });
  const blockedItems = requiredItems.filter((item) => item.status === "blocked");
  const rehearsedItems = requiredItems.filter((item) => item.status === "rehearsed");
  const readyItems = requiredItems.filter((item) => item.status === "ready");
  const status = summarizeStatus({
    day,
    acceptance: input.acceptance,
    blockedCount: blockedItems.length,
    rehearsedCount: rehearsedItems.length,
  });

  return {
    status,
    generatedAt,
    day,
    phaseId: phase.id,
    phaseTitle: phase.title,
    phaseGoal: phase.goal,
    requiredItems,
    blockedCount: blockedItems.length,
    rehearsedCount: rehearsedItems.length,
    readyCount: readyItems.length,
    nextActions: buildNextActions(input.acceptance, requiredItems, status),
    privacyGuardrails,
  };
}

export function formatPilotDailyStatusMarkdown(report: PilotDailyStatusReport) {
  return [
    "# HR One Pilot Daily Status",
    "",
    `Generated at: ${report.generatedAt}`,
    `Trial day: ${report.day}`,
    `Status: ${report.status}`,
    `Phase: ${report.phaseTitle}`,
    `Goal: ${report.phaseGoal}`,
    `Matrix: ${report.readyCount} ready / ${report.rehearsedCount} rehearsed / ${report.blockedCount} blocked`,
    "",
    "## Required Evidence",
    "",
    ...report.requiredItems.map((item) => [
      `- ${item.title}`,
      `  - Status: ${item.status}`,
      `  - Evidence: ${item.evidence}`,
      `  - Next step: ${item.nextStep}`,
    ].join("\n")),
    "",
    "## Next Actions",
    "",
    ...formatList(report.nextActions, "No action required."),
    "",
    "## Privacy Guardrails",
    "",
    ...formatList(report.privacyGuardrails, "No additional guardrails."),
    "",
  ].join("\n");
}

export function pilotDailyStatusPassed(report: PilotDailyStatusReport) {
  return report.status === "ready_for_today" || report.status === "complete";
}

function summarizeStatus(input: {
  day: number;
  acceptance: PilotAcceptanceReport;
  blockedCount: number;
  rehearsedCount: number;
}): PilotDailyStatus {
  if (input.day >= 14 && input.acceptance.complete) return "complete";
  if (input.blockedCount > 0 || !input.acceptance.readyToStart) return "blocked";
  if (input.rehearsedCount > 0) return "needs_production_evidence";
  return "ready_for_today";
}

function buildNextActions(
  acceptance: PilotAcceptanceReport,
  requiredItems: PilotDailyStatusItem[],
  status: PilotDailyStatus,
) {
  const requiredItemIds = new Set(requiredItems.map((item) => item.id));
  const unrelatedItemNextSteps = new Set(
    acceptance.items
      .filter((item) => !requiredItemIds.has(item.id))
      .map((item) => redactSensitiveDetail(item.nextStep)),
  );
  const blockedAcceptanceActions = acceptance.nextActions
    .map(redactSensitiveDetail)
    .filter((action) => !unrelatedItemNextSteps.has(action));
  const itemActions = requiredItems
    .filter((item) => item.status !== "ready")
    .map((item) => item.nextStep);
  const actions = [
    ...(status === "blocked" ? blockedAcceptanceActions : []),
    ...itemActions,
    ...(status === "needs_production_evidence"
      ? ["Capture production tenant evidence for every rehearsed item before closing today's pilot checkpoint."]
      : []),
  ].map(redactSensitiveDetail);
  return [...new Set(actions)];
}

function normalizeDay(day: number) {
  if (!Number.isInteger(day) || day < 0 || day > 14) {
    throw new Error("Pilot day must be an integer between 0 and 14.");
  }
  return day;
}

function phaseForDay(day: number) {
  if (day === 0) return phases[0];
  if (day === 1) return phases[1];
  if (day >= 2 && day <= 3) return phases[2];
  if (day >= 4 && day <= 7) return phases[3];
  if (day >= 14) return phases[4];
  return dailyOpsPhase;
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactSensitiveDetail(item)}`);
}
