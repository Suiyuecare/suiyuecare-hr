import type { PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import type { PilotDailyStatusReport } from "@/server/readiness/pilot-daily-status";
import { pilotDailyStatusPassed } from "@/server/readiness/pilot-daily-status";
import type { PilotEvidenceScanReport } from "@/server/readiness/pilot-evidence-scan";
import { pilotEvidenceScanPassed } from "@/server/readiness/pilot-evidence-scan";
import type { PilotInviteReadinessReport } from "@/server/readiness/pilot-invite-readiness";
import { pilotInviteReadinessPassed } from "@/server/readiness/pilot-invite-readiness";
import type { PilotImportPreflightReport } from "@/server/readiness/pilot-import-preflight";
import { pilotImportPreflightPassed } from "@/server/readiness/pilot-import-preflight";
import type { PilotWorkflowReadinessReport } from "@/server/readiness/pilot-workflow-readiness";
import { pilotWorkflowReadinessPassed } from "@/server/readiness/pilot-workflow-readiness";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";
import type { ProductionDatabaseRemediationReport } from "@/server/readiness/production-database-remediation";

export type PilotGoNoGoStatus = "ready_to_start" | "blocked";

export type PilotGoNoGoCheckId =
  | "acceptance"
  | "production_database"
  | "day_0_status"
  | "import_preflight"
  | "invite_readiness"
  | "workflow_readiness"
  | "evidence_scan";

export type PilotGoNoGoCheckStatus = "pass" | "warn" | "block";

export type PilotGoNoGoCheck = {
  id: PilotGoNoGoCheckId;
  title: string;
  status: PilotGoNoGoCheckStatus;
  detail: string;
  nextStep: string;
};

export type PilotGoNoGoInput = {
  acceptance: PilotAcceptanceReport;
  productionDatabase?: ProductionDatabaseRemediationReport | null;
  day0: PilotDailyStatusReport;
  importPreflight?: PilotImportPreflightReport | null;
  inviteReadiness?: PilotInviteReadinessReport | null;
  workflowReadiness?: PilotWorkflowReadinessReport | null;
  evidenceScan?: PilotEvidenceScanReport | null;
  productionDatabaseRequired?: boolean;
  importPreflightRequired?: boolean;
  inviteReadinessRequired?: boolean;
  workflowReadinessRequired?: boolean;
  evidenceScanRequired?: boolean;
  generatedAt?: Date;
};

export type PilotGoNoGoReport = {
  status: PilotGoNoGoStatus;
  generatedAt: string;
  readyToStart: boolean;
  blockers: number;
  warnings: number;
  checks: PilotGoNoGoCheck[];
  nextActions: string[];
};

const missingImportNextStep =
  "Run pnpm pilot:import-preflight with the completed employee, identity, and payroll CSV files before inviting pilot employees.";

const missingProductionDatabaseNextStep =
  "Run pnpm pilot:production-database with the live URL and production env draft before inviting pilot employees.";

const missingInviteNextStep =
  "Run pnpm pilot:invite-readiness for the real customer tenant before inviting pilot employees.";

const missingWorkflowNextStep =
  "Run pnpm pilot:workflow-readiness for the real customer tenant before inviting pilot employees.";

const missingEvidenceNextStep =
  "Run pnpm pilot:evidence-scan on the pilot evidence folder and fix every finding before sharing pilot materials.";

const sensitiveReportPatterns = [
  /(身分證字號|身分證|統一證號|居留證號|national id|id number)\s*[:：=]\s*\S+/gi,
  /(銀行帳號|帳號|account number|bank account)\s*[:：=]\s*\S+/gi,
  /(薪資|底薪|本薪|base salary|salary amount)\s*[:：=]\s*\$?\d[\d,]*/gi,
  /(健康資料|病歷|診斷|health data|medical record|diagnosis)\s*[:：=]\s*\S+/gi,
  /Bearer\s+[A-Za-z0-9._-]{12,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

export function buildPilotGoNoGoReport(input: PilotGoNoGoInput): PilotGoNoGoReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const checks = [
    buildAcceptanceCheck(input.acceptance),
    buildProductionDatabaseCheck(
      input.productionDatabase ?? null,
      input.productionDatabaseRequired ?? true,
    ),
    buildDay0Check(input.day0),
    buildImportPreflightCheck(
      input.importPreflight ?? null,
      input.importPreflightRequired ?? true,
    ),
    buildInviteReadinessCheck(
      input.inviteReadiness ?? null,
      input.inviteReadinessRequired ?? true,
    ),
    buildWorkflowReadinessCheck(
      input.workflowReadiness ?? null,
      input.workflowReadinessRequired ?? true,
    ),
    buildEvidenceScanCheck(
      input.evidenceScan ?? null,
      input.evidenceScanRequired ?? true,
    ),
  ];
  const blockers = checks.filter((check) => check.status === "block").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const readyToStart = blockers === 0 && warnings === 0;

  return {
    status: readyToStart ? "ready_to_start" : "blocked",
    generatedAt,
    readyToStart,
    blockers,
    warnings,
    checks,
    nextActions: buildNextActions(input, checks),
  };
}

export function pilotGoNoGoPassed(report: PilotGoNoGoReport) {
  return report.status === "ready_to_start" && report.blockers === 0 && report.warnings === 0;
}

export function formatPilotGoNoGoMarkdown(report: PilotGoNoGoReport) {
  return [
    "# HR One Pilot Go/No-Go",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Result: ${report.blockers} blocker(s), ${report.warnings} warning(s)`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => [
      `- [${check.status.toUpperCase()}] ${check.title}`,
      `  - Detail: ${redactPilotReportText(check.detail)}`,
      `  - Next step: ${redactPilotReportText(check.nextStep)}`,
    ].join("\n")),
    "",
    "## Next Actions",
    "",
    ...formatList(report.nextActions, "No action required before inviting pilot employees."),
    "",
    "## Privacy Guardrails",
    "",
    "- This report must contain only aggregate counts, statuses, redacted next steps, or hash-only evidence references.",
    "- Do not paste salary amounts, bank accounts, national IDs, health data, database URLs, tokens, or private HR notes into pilot reports.",
    "- Completed employee, identity, and payroll CSV files must stay in approved secure storage and must not be attached to chat or support tickets.",
    "",
  ].join("\n");
}

function buildAcceptanceCheck(acceptance: PilotAcceptanceReport): PilotGoNoGoCheck {
  return {
    id: "acceptance",
    title: "Production acceptance matrix",
    status: acceptance.readyToStart ? "pass" : "block",
    detail: `${acceptance.status}; ${acceptance.readyCount} ready / ${acceptance.rehearsedCount} rehearsed / ${acceptance.blockedCount} blocked`,
    nextStep: acceptance.readyToStart
      ? "Keep the acceptance report with the pilot evidence folder."
      : "Fix blocked acceptance items before inviting pilot employees.",
  };
}

function buildProductionDatabaseCheck(
  report: ProductionDatabaseRemediationReport | null,
  required: boolean,
): PilotGoNoGoCheck {
  if (!report) {
    return {
      id: "production_database",
      title: "Production database gate",
      status: required ? "block" : "warn",
      detail: required
        ? "No production database gate report was provided."
        : "Production database gate was skipped by operator choice.",
      nextStep: required
        ? missingProductionDatabaseNextStep
        : "Run production database gate before inviting the first pilot employee.",
    };
  }

  const envDraftStatus = report.envDraft?.status ?? "missing";
  const passed = report.status === "ready" && envDraftStatus === "ready";
  return {
    id: "production_database",
    title: "Production database gate",
    status: passed ? "pass" : "block",
    detail: `${report.status}; root cause ${report.rootCause}; env draft ${envDraftStatus}`,
    nextStep: passed
      ? "Keep the redacted production database gate report with the pilot evidence folder."
      : firstActionOrFallback(report.nextActions, missingProductionDatabaseNextStep),
  };
}

function buildDay0Check(day0: PilotDailyStatusReport): PilotGoNoGoCheck {
  const passed = pilotDailyStatusPassed(day0);
  return {
    id: "day_0_status",
    title: "Day 0 employee-invite gate",
    status: passed ? "pass" : "block",
    detail: `${day0.status}; ${day0.readyCount} ready / ${day0.rehearsedCount} rehearsed / ${day0.blockedCount} blocked`,
    nextStep: passed
      ? "Invite the pilot cohort only after HR confirms the day 0 evidence folder is ready."
      : "Clear the day 0 preflight blockers before inviting employees.",
  };
}

function buildImportPreflightCheck(
  report: PilotImportPreflightReport | null,
  required: boolean,
): PilotGoNoGoCheck {
  if (!report) {
    return {
      id: "import_preflight",
      title: "Customer import preflight",
      status: required ? "block" : "warn",
      detail: required
        ? "No import preflight report was provided."
        : "Import preflight was skipped by operator choice.",
      nextStep: required ? missingImportNextStep : "Run import preflight before using real customer employee, identity, or payroll CSV files.",
    };
  }

  const passed = pilotImportPreflightPassed(report);
  return {
    id: "import_preflight",
    title: "Customer import preflight",
    status: passed ? "pass" : "block",
    detail: `${report.status}; ${report.employeeRows} employee row(s), ${report.identityRows} identity row(s), ${report.payrollRows} payroll row(s), ${report.blockers} blocker(s), ${report.warnings} warning(s)`,
    nextStep: passed
      ? "Import employee records first, then identity links and payroll profiles, through approved secure channels."
      : "Fix every import preflight blocker or warning before using the completed customer CSV files.",
  };
}

function buildInviteReadinessCheck(
  report: PilotInviteReadinessReport | null,
  required: boolean,
): PilotGoNoGoCheck {
  if (!report) {
    return {
      id: "invite_readiness",
      title: "Pilot invite readiness",
      status: required ? "block" : "warn",
      detail: required
        ? "No invite readiness report was provided."
        : "Invite readiness was skipped by operator choice.",
      nextStep: required ? missingInviteNextStep : "Run invite readiness before sending the first pilot employee invitation.",
    };
  }

  const passed = pilotInviteReadinessPassed(report);
  return {
    id: "invite_readiness",
    title: "Pilot invite readiness",
    status: passed ? "pass" : "block",
    detail: `${report.status}; ${report.activeEmployeeCount} active employee(s), ${report.managerWithDirectReportsCount} manager(s), ${report.blockers} blocker(s), ${report.warnings} warning(s)`,
    nextStep: passed
      ? "Send invitations only through approved identity-provider and customer communication channels."
      : "Fix pilot invite readiness blockers before sending employee invitations.",
  };
}

function buildWorkflowReadinessCheck(
  report: PilotWorkflowReadinessReport | null,
  required: boolean,
): PilotGoNoGoCheck {
  if (!report) {
    return {
      id: "workflow_readiness",
      title: "Core workflow readiness",
      status: required ? "block" : "warn",
      detail: required
        ? "No workflow readiness report was provided."
        : "Workflow readiness was skipped by operator choice.",
      nextStep: required ? missingWorkflowNextStep : "Run workflow readiness before inviting the first pilot employee.",
    };
  }

  const passed = pilotWorkflowReadinessPassed(report);
  return {
    id: "workflow_readiness",
    title: "Core workflow readiness",
    status: passed ? "pass" : "block",
    detail: `${report.status}; ${report.productionReadyCount} production ready / ${report.rehearsedOnlyCount} rehearsed only / ${report.blockedCount} blocked`,
    nextStep: passed
      ? report.status === "needs_production_evidence"
        ? "Keep the workflow readiness report and capture production checkpoint evidence during Day 1, Day 3, and Day 7."
        : "Keep the workflow readiness report with the pilot evidence folder."
      : report.requireProductionEvidence
        ? "Capture the required production workflow evidence before calling the pilot workflow production-ready."
        : "Fix blocked workflow readiness items before inviting pilot employees.",
  };
}

function buildEvidenceScanCheck(
  report: PilotEvidenceScanReport | null,
  required: boolean,
): PilotGoNoGoCheck {
  if (!report) {
    return {
      id: "evidence_scan",
      title: "Pilot evidence privacy scan",
      status: required ? "block" : "warn",
      detail: required
        ? "No evidence scan report was provided."
        : "Evidence scan was skipped by operator choice.",
      nextStep: required ? missingEvidenceNextStep : "Run evidence scan before sharing pilot reports outside the implementation team.",
    };
  }

  const passed = pilotEvidenceScanPassed(report);
  return {
    id: "evidence_scan",
    title: "Pilot evidence privacy scan",
    status: passed ? "pass" : "block",
    detail: `${report.status}; ${report.scannedFileCount} file(s), ${report.findingCount} finding(s), ${formatCategoryCounts(report)}`,
    nextStep: passed
      ? "Keep sharing only redacted reports and hash-only evidence references."
      : "Remove sensitive values from pilot evidence files and rerun the evidence scan.",
  };
}

function buildNextActions(input: PilotGoNoGoInput, checks: PilotGoNoGoCheck[]) {
  const actionCandidates = [
    ...checks
      .filter((check) => check.status !== "pass")
      .map((check) => check.nextStep),
    ...(!input.acceptance.readyToStart ? input.acceptance.nextActions : []),
    ...(input.productionDatabase &&
    (input.productionDatabase.status !== "ready" || input.productionDatabase.envDraft?.status !== "ready")
      ? input.productionDatabase.nextActions
      : []),
    ...(!pilotDailyStatusPassed(input.day0) ? input.day0.nextActions : []),
  ];
  return dedupe(actionCandidates.map(redactPilotReportText));
}

function firstActionOrFallback(actions: string[], fallback: string) {
  return actions.find((action) => action.trim()) ?? fallback;
}

function redactPilotReportText(value: string) {
  return sensitiveReportPatterns.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    redactSensitiveDetail(value),
  );
}

function formatCategoryCounts(report: PilotEvidenceScanReport) {
  if (report.categories.length === 0) return "0 sensitive category count(s)";
  return report.categories
    .map((category) => `${category.category}:${category.count}`)
    .join(", ");
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactPilotReportText(item)}`);
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
