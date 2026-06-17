import { createHash } from "node:crypto";
import {
  pilotEvidenceScanPassed,
  scanPilotEvidenceFiles,
  type PilotEvidenceScanInputFile,
} from "@/server/readiness/pilot-evidence-scan";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotInvitationReleaseStatus = "released" | "blocked";

export type PilotInvitationReleaseCheckId =
  | "production_database_report"
  | "go_no_go_report"
  | "invite_readiness_report"
  | "evidence_privacy";

export type PilotInvitationReleaseInputFile = {
  path: string;
  content: string;
};

export type PilotInvitationReleaseCheck = {
  id: PilotInvitationReleaseCheckId;
  title: string;
  status: "pass" | "block";
  detail: string;
  nextStep: string;
  evidenceHash?: string;
};

export type PilotInvitationReleaseReport = {
  status: PilotInvitationReleaseStatus;
  generatedAt: string;
  blockers: number;
  checks: PilotInvitationReleaseCheck[];
  nextActions: string[];
  evidenceHashes: Array<{
    id: Exclude<PilotInvitationReleaseCheckId, "evidence_privacy">;
    hash: string;
  }>;
  privacyGuardrails: string[];
};

export type PilotInvitationReleaseInput = {
  productionDatabaseReport?: PilotInvitationReleaseInputFile | null;
  goNoGoReport?: PilotInvitationReleaseInputFile | null;
  inviteReadinessReport?: PilotInvitationReleaseInputFile | null;
  generatedAt?: Date;
};

const privacyGuardrails = [
  "Release evidence must be redacted reports or hash-only references; do not attach raw employee, payroll, identity, or bank files.",
  "Do not send the first employee invitation until this release report is released and stored with the pilot evidence folder.",
  "This report must not contain database URLs, tokens, salary amounts, bank accounts, national IDs, health data, SSO subjects, or private HR notes.",
];

export function buildPilotInvitationReleaseReport(
  input: PilotInvitationReleaseInput,
): PilotInvitationReleaseReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const reportFiles = [
    input.productionDatabaseReport,
    input.goNoGoReport,
    input.inviteReadinessReport,
  ].filter((file): file is PilotInvitationReleaseInputFile => Boolean(file));
  const evidenceScan = scanPilotEvidenceFiles(reportFiles.map(toEvidenceScanFile));
  const checks = [
    buildProductionDatabaseReportCheck(input.productionDatabaseReport ?? null),
    buildGoNoGoReportCheck(input.goNoGoReport ?? null),
    buildInviteReadinessReportCheck(input.inviteReadinessReport ?? null),
    buildEvidencePrivacyCheck(evidenceScan),
  ];
  const blockers = checks.filter((check) => check.status === "block").length;
  const evidenceHashes = checks
    .filter((check): check is PilotInvitationReleaseCheck & { evidenceHash: string } =>
      check.id !== "evidence_privacy" && Boolean(check.evidenceHash),
    )
    .map((check) => ({
      id: check.id as Exclude<PilotInvitationReleaseCheckId, "evidence_privacy">,
      hash: check.evidenceHash,
    }));

  return {
    status: blockers === 0 ? "released" : "blocked",
    generatedAt,
    blockers,
    checks,
    nextActions: buildNextActions(checks),
    evidenceHashes,
    privacyGuardrails,
  };
}

export function pilotInvitationReleasePassed(report: PilotInvitationReleaseReport) {
  return report.status === "released" && report.blockers === 0;
}

export function formatPilotInvitationReleaseMarkdown(report: PilotInvitationReleaseReport) {
  return [
    "# HR One Pilot Invitation Release",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Result: ${report.blockers} blocker(s)`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => [
      `- [${check.status.toUpperCase()}] ${check.title}`,
      `  - Detail: ${redactReleaseText(check.detail)}`,
      `  - Next step: ${redactReleaseText(check.nextStep)}`,
      ...(check.evidenceHash ? [`  - Evidence hash: ${check.evidenceHash}`] : []),
    ].join("\n")),
    "",
    "## Next Actions",
    "",
    ...formatList(report.nextActions, "Release approved. Keep this report with the pilot evidence folder before sending invitations."),
    "",
    "## Evidence Hashes",
    "",
    ...formatList(
      report.evidenceHashes.map((item) => `${item.id}: ${item.hash}`),
      "No report hashes attached.",
    ),
    "",
    "## Privacy Guardrails",
    "",
    ...report.privacyGuardrails.map((item) => `- ${redactReleaseText(item)}`),
    "",
  ].join("\n");
}

function buildProductionDatabaseReportCheck(
  file: PilotInvitationReleaseInputFile | null,
): PilotInvitationReleaseCheck {
  if (!file) {
    return block(
      "production_database_report",
      "Production database report",
      "Missing redacted production database gate report.",
      "Run pnpm pilot:production-database and attach the redacted report before invitations.",
    );
  }
  const parsed = parseProductionDatabaseReport(file.content);
  return parsed.ready
    ? pass(
        "production_database_report",
        "Production database report",
        "Production database gate and local env draft are ready.",
        "Keep the production database gate report in the pilot evidence folder.",
        hashContent(file.content),
      )
    : block(
        "production_database_report",
        "Production database report",
        parsed.detail,
        "Fix the production database gate, rerun pnpm pilot:production-database, and attach the new redacted report.",
        hashContent(file.content),
      );
}

function buildGoNoGoReportCheck(file: PilotInvitationReleaseInputFile | null): PilotInvitationReleaseCheck {
  if (!file) {
    return block(
      "go_no_go_report",
      "Go/No-Go report",
      "Missing redacted pilot Go/No-Go report.",
      "Run pnpm pilot:go-no-go with production database, import, invite, workflow, and evidence scan inputs.",
    );
  }
  const parsed = parseGoNoGoReport(file.content);
  return parsed.ready
    ? pass(
        "go_no_go_report",
        "Go/No-Go report",
        "Go/No-Go report is ready_to_start with zero blockers and zero warnings.",
        "Keep the Go/No-Go report in the pilot evidence folder.",
        hashContent(file.content),
      )
    : block(
        "go_no_go_report",
        "Go/No-Go report",
        parsed.detail,
        "Fix every Go/No-Go blocker or warning and rerun pnpm pilot:go-no-go before invitations.",
        hashContent(file.content),
      );
}

function buildInviteReadinessReportCheck(
  file: PilotInvitationReleaseInputFile | null,
): PilotInvitationReleaseCheck {
  if (!file) {
    return block(
      "invite_readiness_report",
      "Invite readiness report",
      "Missing redacted invite readiness report.",
      "Run pnpm pilot:invite-readiness after employee users, roles, SSO identities, schedules, leave balances, and payslip guardrails are ready.",
    );
  }
  const parsed = parseInviteReadinessReport(file.content);
  return parsed.ready
    ? pass(
        "invite_readiness_report",
        "Invite readiness report",
        "Invite readiness is ready with zero blockers and zero warnings.",
        "Keep the invite readiness report in the pilot evidence folder.",
        hashContent(file.content),
      )
    : block(
        "invite_readiness_report",
        "Invite readiness report",
        parsed.detail,
        "Fix invite readiness blockers or warnings and rerun pnpm pilot:invite-readiness.",
        hashContent(file.content),
      );
}

function buildEvidencePrivacyCheck(
  evidenceScan: ReturnType<typeof scanPilotEvidenceFiles>,
): PilotInvitationReleaseCheck {
  return pilotEvidenceScanPassed(evidenceScan)
    ? pass(
        "evidence_privacy",
        "Release evidence privacy scan",
        `${evidenceScan.scannedFileCount} release evidence file(s) scanned with zero sensitive findings.`,
        "Keep the release report redacted and store raw CSV exports only in approved secure storage.",
      )
    : block(
        "evidence_privacy",
        "Release evidence privacy scan",
        `${evidenceScan.findingCount} sensitive finding(s) detected across ${evidenceScan.scannedFileCount} release evidence file(s): ${evidenceScan.categories.map((item) => `${item.category}:${item.count}`).join(", ")}.`,
        "Remove sensitive values from release evidence reports and rerun the invitation release gate.",
      );
}

function parseProductionDatabaseReport(content: string) {
  const json = parseJson(content);
  if (json) {
    const ready =
      readString(json, "status") === "ready" &&
      readString(json, "rootCause") === "ready" &&
      readNestedString(json, ["envDraft", "status"]) === "ready";
    return {
      ready,
      detail: ready
        ? "Production database report is ready."
        : `Production database report is not ready; status ${readString(json, "status") ?? "missing"}, env draft ${readNestedString(json, ["envDraft", "status"]) ?? "missing"}.`,
    };
  }

  const status = matchLine(content, "Status");
  const rootCause = matchLine(content, "Root cause");
  const localEnvDraftReady = /## Local Env Draft[\s\S]*?-\s*Status:\s*ready\b/i.test(content);
  const ready = status === "ready" && rootCause === "ready" && localEnvDraftReady;
  return {
    ready,
    detail: ready
      ? "Production database report is ready."
      : `Production database report is not ready; status ${status ?? "missing"}, root cause ${rootCause ?? "missing"}, env draft ${localEnvDraftReady ? "ready" : "not ready"}.`,
  };
}

function parseGoNoGoReport(content: string) {
  const json = parseJson(content);
  if (json) {
    const checks = Array.isArray((json as { checks?: unknown }).checks)
      ? (json as { checks: Array<{ id?: unknown; status?: unknown }> }).checks
      : [];
    const databaseCheckPassed = checks.some((check) =>
      check.id === "production_database" && check.status === "pass",
    );
    const ready =
      readString(json, "status") === "ready_to_start" &&
      readNumber(json, "blockers") === 0 &&
      readNumber(json, "warnings") === 0 &&
      databaseCheckPassed;
    return {
      ready,
      detail: ready
        ? "Go/No-Go report is ready."
        : `Go/No-Go report is not ready; status ${readString(json, "status") ?? "missing"}, blockers ${readNumber(json, "blockers") ?? "missing"}, warnings ${readNumber(json, "warnings") ?? "missing"}.`,
    };
  }

  const status = matchLine(content, "Status");
  const resultReady = /^Result:\s*0 blocker\(s\), 0 warning\(s\)/im.test(content);
  const databaseCheckPassed = /\[PASS\]\s+Production database gate/i.test(content);
  const ready = status === "ready_to_start" && resultReady && databaseCheckPassed;
  return {
    ready,
    detail: ready
      ? "Go/No-Go report is ready."
      : `Go/No-Go report is not ready; status ${status ?? "missing"}, zero-result ${resultReady ? "yes" : "no"}, production database check ${databaseCheckPassed ? "pass" : "missing"}.`,
  };
}

function parseInviteReadinessReport(content: string) {
  const json = parseJson(content);
  if (json) {
    const ready =
      readString(json, "status") === "ready" &&
      readNumber(json, "blockers") === 0 &&
      readNumber(json, "warnings") === 0;
    return {
      ready,
      detail: ready
        ? "Invite readiness report is ready."
        : `Invite readiness report is not ready; status ${readString(json, "status") ?? "missing"}, blockers ${readNumber(json, "blockers") ?? "missing"}, warnings ${readNumber(json, "warnings") ?? "missing"}.`,
    };
  }

  const status = matchLine(content, "Status");
  const resultReady = /^Result:\s*0 blocker\(s\), 0 warning\(s\)/im.test(content);
  const ready = status === "ready" && resultReady;
  return {
    ready,
    detail: ready
      ? "Invite readiness report is ready."
      : `Invite readiness report is not ready; status ${status ?? "missing"}, zero-result ${resultReady ? "yes" : "no"}.`,
  };
}

function pass(
  id: PilotInvitationReleaseCheckId,
  title: string,
  detail: string,
  nextStep: string,
  evidenceHash?: string,
): PilotInvitationReleaseCheck {
  return {
    id,
    title,
    status: "pass",
    detail: redactReleaseText(detail),
    nextStep: redactReleaseText(nextStep),
    evidenceHash,
  };
}

function block(
  id: PilotInvitationReleaseCheckId,
  title: string,
  detail: string,
  nextStep: string,
  evidenceHash?: string,
): PilotInvitationReleaseCheck {
  return {
    id,
    title,
    status: "block",
    detail: redactReleaseText(detail),
    nextStep: redactReleaseText(nextStep),
    evidenceHash,
  };
}

function buildNextActions(checks: PilotInvitationReleaseCheck[]) {
  return [
    ...new Set(
      checks
        .filter((check) => check.status === "block")
        .map((check) => redactReleaseText(check.nextStep)),
    ),
  ];
}

function toEvidenceScanFile(file: PilotInvitationReleaseInputFile): PilotEvidenceScanInputFile {
  return {
    path: file.path,
    content: file.content,
  };
}

function parseJson(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function matchLine(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escaped}:\\s*([^\\n\\r]+)`, "im"));
  return match?.[1]?.trim() ?? null;
}

function readString(value: Record<string, unknown>, key: string) {
  const item = value[key];
  return typeof item === "string" ? item : null;
}

function readNestedString(value: Record<string, unknown>, keys: string[]) {
  let current: unknown = value;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}

function readNumber(value: Record<string, unknown>, key: string) {
  const item = value[key];
  return typeof item === "number" ? item : null;
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function redactReleaseText(value: string) {
  return redactSensitiveDetail(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/(身分證字號|身分證|統一證號|居留證號|national id|id number)\s*[:：=]\s*\S+/gi, "[REDACTED]")
    .replace(/(銀行帳號|帳號|account number|bank account)\s*[:：=]\s*\S+/gi, "[REDACTED]")
    .replace(/(薪資|底薪|本薪|base salary|salary amount)\s*[:：=]\s*\$?\d[\d,]*/gi, "[REDACTED]")
    .replace(/(健康資料|病歷|診斷|health data|medical record|diagnosis)\s*[:：=]\s*\S+/gi, "[REDACTED]");
}

function formatList(items: string[], emptyText: string) {
  return items.length ? items.map((item) => `- ${redactReleaseText(item)}`) : [`- ${emptyText}`];
}
