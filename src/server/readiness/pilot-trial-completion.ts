import type { HrOneKpi } from "@/server/kpis/hr-one";
import type {
  BetaPilotCheckpointCoverage,
  BetaPilotCheckpointId,
  BetaPilotEvidenceType,
} from "@/server/readiness/beta-pilot-checkpoints";
import type { PilotEvidenceScanReport } from "@/server/readiness/pilot-evidence-scan";
import { pilotEvidenceScanPassed } from "@/server/readiness/pilot-evidence-scan";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotTrialCompletionStatus = "completed" | "blocked";

export type PilotTrialCompletionCheckStatus = "pass" | "warn" | "block";

export type PilotTrialCompletionCheck = {
  id:
    | "preflight_access"
    | "day_1_employee_rollout"
    | "day_3_leave_approval"
    | "day_7_payroll_payslip"
    | "day_14_final_review"
    | "kpi_targets"
    | "evidence_privacy";
  title: string;
  status: PilotTrialCompletionCheckStatus;
  detail: string;
  nextStep: string;
};

export type PilotTrialCompletionInput = {
  checkpoints: BetaPilotCheckpointCoverage[];
  kpis: HrOneKpi[];
  evidenceScan?: PilotEvidenceScanReport | null;
  evidenceScanRequired?: boolean;
  generatedAt?: Date;
};

export type PilotTrialCompletionReport = {
  status: PilotTrialCompletionStatus;
  generatedAt: string;
  completed: boolean;
  blockers: number;
  warnings: number;
  checks: PilotTrialCompletionCheck[];
  nextActions: string[];
};

const checkpointRequirements: Array<{
  id: PilotTrialCompletionCheck["id"];
  checkpointId: BetaPilotCheckpointId;
  title: string;
  evidenceTypes: BetaPilotEvidenceType[];
  nextStep: string;
}> = [
  {
    id: "preflight_access",
    checkpointId: "preflight",
    title: "Preflight access review",
    evidenceTypes: ["access_review"],
    nextStep: "Run owner/HR access review and verify payroll and PII boundaries before trusting trial evidence.",
  },
  {
    id: "day_1_employee_rollout",
    checkpointId: "day_1",
    title: "Day 1 employee rollout",
    evidenceTypes: ["announcement_receipt"],
    nextStep: "Publish a pilot announcement and confirm employee receipts from the production tenant.",
  },
  {
    id: "day_3_leave_approval",
    checkpointId: "day_3",
    title: "Day 3 attendance, leave, and manager approval",
    evidenceTypes: ["smoke_test", "approval_flow"],
    nextStep: "Complete production employee clock-out plus leave approval evidence from the unified manager Inbox.",
  },
  {
    id: "day_7_payroll_payslip",
    checkpointId: "day_7",
    title: "Day 7 payroll rehearsal and payslip access",
    evidenceTypes: ["payroll_rehearsal", "payslip_access"],
    nextStep: "Run HR payroll close rehearsal, release a permitted payslip, and verify employee self-view only.",
  },
  {
    id: "day_14_final_review",
    checkpointId: "day_14",
    title: "Day 14 final review and audit export",
    evidenceTypes: ["audit_export"],
    nextStep: "Run final review only after open security, payroll, attendance, and evidence blockers are closed.",
  },
];

export function buildPilotTrialCompletionReport(
  input: PilotTrialCompletionInput,
): PilotTrialCompletionReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const checks = [
    ...checkpointRequirements.map((requirement) => buildCheckpointCheck(input.checkpoints, requirement)),
    buildKpiCheck(input.kpis),
    buildEvidencePrivacyCheck(input.evidenceScan ?? null, input.evidenceScanRequired ?? true),
  ];
  const blockers = checks.filter((check) => check.status === "block").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const completed = blockers === 0 && warnings === 0;

  return {
    status: completed ? "completed" : "blocked",
    generatedAt,
    completed,
    blockers,
    warnings,
    checks,
    nextActions: buildNextActions(checks),
  };
}

export function pilotTrialCompletionPassed(report: PilotTrialCompletionReport) {
  return report.status === "completed" && report.blockers === 0 && report.warnings === 0;
}

export function formatPilotTrialCompletionMarkdown(report: PilotTrialCompletionReport) {
  return [
    "# HR One Pilot Trial Completion Review",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Result: ${report.blockers} blocker(s), ${report.warnings} warning(s)`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => [
      `- [${check.status.toUpperCase()}] ${check.title}`,
      `  - Detail: ${redactPilotCompletionText(check.detail)}`,
      `  - Next step: ${redactPilotCompletionText(check.nextStep)}`,
    ].join("\n")),
    "",
    "## Next Actions",
    "",
    ...formatList(report.nextActions, "No completion actions required."),
    "",
    "## Privacy Guardrails",
    "",
    "- This completion review must contain only aggregate counts, statuses, redacted next steps, or hash-only evidence references.",
    "- Do not paste employee names, emails, salary amounts, bank accounts, national IDs, health data, database URLs, tokens, or private HR notes into completion evidence.",
    "- Run the evidence scanner on the pilot evidence folder before sharing any completion report outside the implementation team.",
    "",
  ].join("\n");
}

function buildCheckpointCheck(
  checkpoints: BetaPilotCheckpointCoverage[],
  requirement: (typeof checkpointRequirements)[number],
): PilotTrialCompletionCheck {
  const checkpoint = checkpoints.find((item) => item.checkpointId === requirement.checkpointId);
  const evidenceTypes = checkpoint?.evidenceTypes ?? [];
  const missing = requirement.evidenceTypes.filter((evidenceType) => !evidenceTypes.includes(evidenceType));
  const passed = checkpoint?.latestStatus === "verified" && missing.length === 0;
  return {
    id: requirement.id,
    title: requirement.title,
    status: passed ? "pass" : "block",
    detail: checkpoint
      ? `${checkpoint.latestStatus}; ${checkpoint.recordedCount} record(s); evidence ${evidenceTypes.join(", ") || "none"}; missing ${missing.join(", ") || "none"}`
      : "missing checkpoint evidence",
    nextStep: passed
      ? "Keep hash-only checkpoint evidence in the pilot folder."
      : requirement.nextStep,
  };
}

function buildKpiCheck(kpis: HrOneKpi[]): PilotTrialCompletionCheck {
  const failing = kpis.filter((kpi) => kpi.status === "failing");
  const watch = kpis.filter((kpi) => kpi.status === "watch");
  return {
    id: "kpi_targets",
    title: "Pilot KPI targets",
    status: failing.length > 0 ? "block" : watch.length > 2 ? "warn" : "pass",
    detail: `${kpis.length - failing.length - watch.length} passing / ${watch.length} watch / ${failing.length} failing`,
    nextStep: failing.length > 0
      ? `Fix failing KPI(s): ${failing.map((kpi) => kpi.id).join(", ")}.`
      : watch.length > 2
        ? "Review watch-level KPIs with HR before calling the pilot successful."
        : "Keep KPI telemetry in the pilot evidence folder.",
  };
}

function buildEvidencePrivacyCheck(
  evidenceScan: PilotEvidenceScanReport | null,
  required: boolean,
): PilotTrialCompletionCheck {
  if (!evidenceScan) {
    return {
      id: "evidence_privacy",
      title: "Pilot evidence privacy scan",
      status: required ? "block" : "warn",
      detail: required ? "No evidence scan report was provided." : "Evidence scan was skipped by operator choice.",
      nextStep: required
        ? "Run pnpm pilot:evidence-scan on the pilot evidence folder and fix every finding."
        : "Run evidence scan before treating the pilot as complete or sharing evidence outside the implementation team.",
    };
  }
  const passed = pilotEvidenceScanPassed(evidenceScan);
  return {
    id: "evidence_privacy",
    title: "Pilot evidence privacy scan",
    status: passed ? "pass" : "block",
    detail: `${evidenceScan.status}; ${evidenceScan.scannedFileCount} file(s), ${evidenceScan.findingCount} finding(s)`,
    nextStep: passed
      ? "Keep completion evidence redacted and hash-only."
      : "Remove sensitive values from pilot evidence files and rerun the evidence scan.",
  };
}

function buildNextActions(checks: PilotTrialCompletionCheck[]) {
  return [...new Set(
    checks
      .filter((check) => check.status !== "pass")
      .map((check) => redactPilotCompletionText(check.nextStep)),
  )];
}

function redactPilotCompletionText(value: string) {
  return redactSensitiveDetail(value)
    .replace(/[A-Z][12]\d{8}/gi, "[REDACTED]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]");
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactPilotCompletionText(item)}`);
}
