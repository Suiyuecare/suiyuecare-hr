import type { BetaPilotRehearsalStep } from "@/server/readiness/beta-pilot-rehearsal";
import type { PilotDoctorReport } from "@/server/readiness/pilot-doctor";
import { pilotDoctorPassed } from "@/server/readiness/pilot-doctor";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotAcceptanceStatus = "ready" | "rehearsed" | "blocked";

export type PilotAcceptanceCohort = {
  source: "real_customer" | "synthetic" | "unknown";
  employeeCount: number | null;
  managerCount: number | null;
};

export type PilotAcceptanceRehearsalEvidence = {
  status: "passed" | "failed" | "not_run";
  stepIds: ReadonlyArray<BetaPilotRehearsalStep["id"]>;
  sensitiveValuesReturned: boolean | null;
};

export type PilotAcceptanceFinalReview = {
  status: "verified" | "action_required" | "blocked" | "not_run";
};

export type PilotAcceptanceInput = {
  checkedAt?: Date;
  doctor: PilotDoctorReport;
  cohort: PilotAcceptanceCohort;
  rehearsal: PilotAcceptanceRehearsalEvidence;
  finalReview: PilotAcceptanceFinalReview;
};

export type PilotAcceptanceItem = {
  id:
    | "production_foundation"
    | "real_company_cohort"
    | "clock_in_out"
    | "leave_request"
    | "manager_approval"
    | "announcement"
    | "payroll_rehearsal"
    | "payslip_view"
    | "sensitive_data_guardrails"
    | "two_week_completion";
  title: string;
  status: PilotAcceptanceStatus;
  evidence: string;
  nextStep: string;
};

export type PilotAcceptanceReport = {
  status: "ready_to_start" | "blocked";
  completionStatus: "complete" | "incomplete";
  checkedAt: string;
  readyToStart: boolean;
  complete: boolean;
  readyCount: number;
  rehearsedCount: number;
  blockedCount: number;
  items: PilotAcceptanceItem[];
  nextActions: string[];
};

const targetEmployeeMin = 20;
const targetEmployeeMax = 50;

export function buildPilotAcceptanceReport(input: PilotAcceptanceInput): PilotAcceptanceReport {
  const checkedAt = input.checkedAt ?? new Date();
  const rehearsalStepIds = new Set(input.rehearsal.stepIds);
  const productionReady = pilotDoctorPassed(input.doctor);
  const realCohortReady = input.cohort.source === "real_customer" &&
    inPilotEmployeeRange(input.cohort.employeeCount) &&
    hasManagerLine(input.cohort.managerCount);
  const syntheticCohortRehearsed = input.cohort.source === "synthetic" &&
    inPilotEmployeeRange(input.cohort.employeeCount) &&
    hasManagerLine(input.cohort.managerCount);
  const rehearsalPassed = input.rehearsal.status === "passed" && input.rehearsal.sensitiveValuesReturned === false;

  const items: PilotAcceptanceItem[] = [
    {
      id: "production_foundation",
      title: "Production deployment, database, and env are ready",
      status: productionReady ? "ready" : "blocked",
      evidence: productionReady
        ? "pilot doctor passed"
        : `pilot doctor blocked with ${input.doctor.checks.filter((check) => !check.passed).length} failed check(s)`,
      nextStep: "Run pnpm pilot:doctor until Vercel Production env, live readiness, and Supabase pilot data are all ready.",
    },
    {
      id: "real_company_cohort",
      title: "20-50 person real company cohort is ready",
      status: realCohortReady ? "ready" : syntheticCohortRehearsed ? "rehearsed" : "blocked",
      evidence: cohortEvidence(input.cohort),
      nextStep: "Import the actual company employees and manager reporting lines before treating the trial as real customer evidence.",
    },
    workflowItem({
      id: "clock_in_out",
      title: "Employees can clock in and clock out",
      stepIds: ["attendance"],
      rehearsalStepIds,
      nextStep: "Run employee mobile clock in/out in the production pilot tenant and retain audit evidence.",
    }),
    workflowItem({
      id: "leave_request",
      title: "Employees can submit leave requests",
      stepIds: ["leave_approval"],
      rehearsalStepIds,
      nextStep: "Have a pilot employee submit leave from mobile and verify the status timeline.",
    }),
    workflowItem({
      id: "manager_approval",
      title: "Managers can approve from one Inbox",
      stepIds: ["leave_approval"],
      rehearsalStepIds,
      nextStep: "Have the direct manager approve from the unified Inbox and confirm employee notification.",
    }),
    workflowItem({
      id: "announcement",
      title: "HR can publish announcements and collect receipts",
      stepIds: ["announcement"],
      rehearsalStepIds,
      nextStep: "Publish a pilot announcement and verify employee receipt evidence.",
    }),
    workflowItem({
      id: "payroll_rehearsal",
      title: "HR can run monthly close rehearsal",
      stepIds: ["payroll"],
      rehearsalStepIds,
      nextStep: "Run HR monthly close rehearsal in the production pilot tenant after attendance exceptions and approvals are clear.",
    }),
    workflowItem({
      id: "payslip_view",
      title: "Employees can view released payslips",
      stepIds: ["payslip"],
      rehearsalStepIds,
      nextStep: "Release pilot payslips and verify employees can only view their own payslip.",
    }),
    {
      id: "sensitive_data_guardrails",
      title: "No unauthorized access or sensitive data leakage",
      status: rehearsalPassed && rehearsalStepIds.has("access_review")
        ? productionReady ? "ready" : "rehearsed"
        : "blocked",
      evidence: input.rehearsal.sensitiveValuesReturned === false
        ? "demo rehearsal returned no sensitive values; access review step present"
        : "missing proof that rehearsal avoided sensitive values",
      nextStep: "Run payroll and PII permission checks against production tenant roles before employees start the trial.",
    },
    {
      id: "two_week_completion",
      title: "Day 14 final review closes the two-week trial",
      status: input.finalReview.status === "verified" ? "ready" : "blocked",
      evidence: `final review status is ${input.finalReview.status}`,
      nextStep: "After the two-week pilot, run day 14 final review and keep hash-only audit evidence.",
    },
  ];

  const readyToStart = productionReady &&
    realCohortReady &&
    rehearsalPassed &&
    items
      .filter((item) => item.id !== "two_week_completion")
      .every((item) => item.status === "ready" || item.status === "rehearsed");
  const complete = readyToStart && input.finalReview.status === "verified";
  const readyCount = items.filter((item) => item.status === "ready").length;
  const rehearsedCount = items.filter((item) => item.status === "rehearsed").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;

  return {
    status: readyToStart ? "ready_to_start" : "blocked",
    completionStatus: complete ? "complete" : "incomplete",
    checkedAt: checkedAt.toISOString(),
    readyToStart,
    complete,
    readyCount,
    rehearsedCount,
    blockedCount,
    items,
    nextActions: buildNextActions(items, input.doctor),
  };
}

export function formatPilotAcceptanceReport(report: PilotAcceptanceReport) {
  const lines = [
    `HR One pilot acceptance: ${report.status}`,
    `Completion: ${report.completionStatus}`,
    `Checked at: ${report.checkedAt}`,
    `${report.readyCount} ready / ${report.rehearsedCount} rehearsed / ${report.blockedCount} blocked`,
    "",
    "Acceptance matrix:",
    ...report.items.map((item) => {
      const status = item.status.toUpperCase();
      return `- [${status}] ${item.title}: ${redactSensitiveDetail(item.evidence)}`;
    }),
  ];

  if (report.nextActions.length > 0) {
    lines.push("", "Next actions:");
    lines.push(...report.nextActions.map((action) => `- ${redactSensitiveDetail(action)}`));
  }

  return lines.join("\n");
}

function workflowItem(options: {
  id: PilotAcceptanceItem["id"];
  title: string;
  stepIds: ReadonlyArray<BetaPilotRehearsalStep["id"]>;
  rehearsalStepIds: Set<BetaPilotRehearsalStep["id"]>;
  nextStep: string;
}): PilotAcceptanceItem {
  const rehearsed = options.stepIds.every((stepId) => options.rehearsalStepIds.has(stepId));
  return {
    id: options.id,
    title: options.title,
    status: rehearsed ? "rehearsed" : "blocked",
    evidence: rehearsed
      ? `demo rehearsal covered ${options.stepIds.join(", ")}`
      : `demo rehearsal missing ${options.stepIds.filter((stepId) => !options.rehearsalStepIds.has(stepId)).join(", ")}`,
    nextStep: options.nextStep,
  };
}

function buildNextActions(items: PilotAcceptanceItem[], doctor: PilotDoctorReport) {
  const actions = [
    ...doctor.nextActions,
    ...items.filter((item) => item.status === "blocked").map((item) => item.nextStep),
  ];
  return [...new Set(actions.map(redactSensitiveDetail))];
}

function cohortEvidence(cohort: PilotAcceptanceCohort) {
  const employees = cohort.employeeCount ?? "unknown";
  const managers = cohort.managerCount ?? "unknown";
  return `${cohort.source} cohort with ${employees} employee(s) and ${managers} manager(s)`;
}

function inPilotEmployeeRange(value: number | null) {
  return value !== null && value >= targetEmployeeMin && value <= targetEmployeeMax;
}

function hasManagerLine(value: number | null) {
  return value !== null && value >= 1;
}
