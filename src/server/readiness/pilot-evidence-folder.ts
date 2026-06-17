import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import {
  pilotEvidenceScanPassed,
  scanPilotEvidenceFiles,
  type PilotEvidenceScanInputFile,
  type PilotEvidenceScanReport,
} from "@/server/readiness/pilot-evidence-scan";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotEvidenceFolderStatus = "ready" | "blocked";

export type PilotEvidenceFolderArtifactId =
  | "production_database"
  | "go_no_go"
  | "invitation_release"
  | "day_0_status"
  | "day_1_status"
  | "day_3_status"
  | "day_7_status"
  | "day_14_status"
  | "trial_completion"
  | "audit_evidence"
  | "redacted_handoff";

export type PilotEvidenceFolderArtifactStatus = "pass" | "block";

export type PilotEvidenceFolderInputFile = {
  path: string;
  content: string;
};

export type PilotEvidenceFolderArtifact = {
  id: PilotEvidenceFolderArtifactId;
  title: string;
  status: PilotEvidenceFolderArtifactStatus;
  detail: string;
  nextStep: string;
  path: string | null;
  evidenceHash: string | null;
};

export type PilotEvidenceFolderReport = {
  status: PilotEvidenceFolderStatus;
  generatedAt: string;
  readyToShare: boolean;
  blockers: number;
  artifacts: PilotEvidenceFolderArtifact[];
  privacyScan: {
    status: "pass" | "block";
    scannedFileCount: number;
    csvFileCount: number;
    findingCount: number;
    categories: PilotEvidenceScanReport["categories"];
  };
  nextActions: string[];
  evidenceHashes: Array<{
    id: PilotEvidenceFolderArtifactId;
    hash: string;
  }>;
  privacyGuardrails: string[];
};

type ArtifactDefinition = {
  id: PilotEvidenceFolderArtifactId;
  title: string;
  aliases: string[];
  nextStep: string;
  validate: (content: string) => ValidationResult;
};

type ValidationResult = {
  ready: boolean;
  detail: string;
};

const privacyGuardrails = [
  "Evidence folders may contain redacted reports, statuses, aggregate counts, and hash-only evidence references only.",
  "Do not include raw employee CSV, identity CSV, payroll CSV, salary values, bank accounts, national IDs, health data, database URLs, tokens, SSO subjects, or private HR notes.",
  "Day 7 payroll evidence must prove HR rehearsal and self-only payslip access without exposing salary amounts.",
  "Day 14 handoff is shareable only after this folder gate and pilot:evidence-scan both report zero sensitive findings.",
];

const artifactDefinitions: ArtifactDefinition[] = [
  {
    id: "production_database",
    title: "Production database gate",
    aliases: [
      "production-database.md",
      "production-database-gate.md",
      "hr-one-production-database-gate.md",
    ],
    nextStep: "Run pnpm pilot:production-database and place the redacted report in the evidence folder.",
    validate: validateProductionDatabase,
  },
  {
    id: "go_no_go",
    title: "Pilot Go/No-Go report",
    aliases: ["go-no-go.md", "pilot-go-no-go.md", "hr-one-pilot-go-no-go.md"],
    nextStep: "Run pnpm pilot:go-no-go with production database, import, invite, workflow, and evidence scan inputs.",
    validate: validateGoNoGo,
  },
  {
    id: "invitation_release",
    title: "Invitation release report",
    aliases: [
      "invitation-release.md",
      "pilot-invitation-release.md",
      "hr-one-pilot-invitation-release.md",
    ],
    nextStep: "Run pnpm pilot:invitation-release before sending the first employee invitation.",
    validate: validateInvitationRelease,
  },
  {
    id: "day_0_status",
    title: "Day 0 daily status",
    aliases: ["day-0.md", "pilot-day-0.md", "hr-one-pilot-day-0.md"],
    nextStep: "Run pnpm pilot:daily-status -- --day=0 and store the redacted report.",
    validate: (content) => validateDailyStatus(content, 0, ["ready_for_today", "complete"]),
  },
  {
    id: "day_1_status",
    title: "Day 1 rollout status",
    aliases: ["day-1.md", "pilot-day-1.md", "hr-one-pilot-day-1.md"],
    nextStep: "Run pnpm pilot:daily-status -- --day=1 after announcement receipt evidence is recorded.",
    validate: (content) => validateDailyStatus(content, 1, ["ready_for_today", "complete"]),
  },
  {
    id: "day_3_status",
    title: "Day 3 attendance and approval status",
    aliases: ["day-3.md", "pilot-day-3.md", "hr-one-pilot-day-3.md"],
    nextStep: "Run pnpm pilot:daily-status -- --day=3 after clock, leave, and manager approval evidence is recorded.",
    validate: (content) => validateDailyStatus(content, 3, ["ready_for_today", "complete"]),
  },
  {
    id: "day_7_status",
    title: "Day 7 payroll rehearsal status",
    aliases: ["day-7.md", "pilot-day-7.md", "hr-one-pilot-day-7.md"],
    nextStep: "Run pnpm pilot:daily-status -- --day=7 after payroll rehearsal and payslip self-view evidence is recorded.",
    validate: (content) => validateDailyStatus(content, 7, ["ready_for_today", "complete"]),
  },
  {
    id: "day_14_status",
    title: "Day 14 final status",
    aliases: ["day-14.md", "pilot-day-14.md", "hr-one-pilot-day-14.md"],
    nextStep: "Run pnpm pilot:daily-status -- --day=14 --final-review=verified after final review is verified.",
    validate: (content) => validateDailyStatus(content, 14, ["complete"]),
  },
  {
    id: "trial_completion",
    title: "Trial completion review",
    aliases: ["completion.md", "pilot-completion.md", "hr-one-pilot-completion.md"],
    nextStep: "Run pnpm pilot:trial-completion with the evidence folder and fix every blocker or warning.",
    validate: validateTrialCompletion,
  },
  {
    id: "audit_evidence",
    title: "Audit evidence package",
    aliases: ["audit-evidence.md", "audit-package.md", "hr-one-audit-evidence.md"],
    nextStep: "Generate a redacted audit evidence package from /settings/pilot-evidence or /settings/audit.",
    validate: validateAuditEvidence,
  },
  {
    id: "redacted_handoff",
    title: "Redacted handoff",
    aliases: ["handoff.md", "pilot-handoff.md", "hr-one-pilot-handoff.md"],
    nextStep: "Run pnpm pilot:handoff and store the redacted handoff in the evidence folder.",
    validate: validateHandoff,
  },
];

export function buildPilotEvidenceFolderReport(input: {
  files: PilotEvidenceFolderInputFile[];
  generatedAt?: Date;
}): PilotEvidenceFolderReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const privacyScan = scanPilotEvidenceFiles(input.files.map(toEvidenceScanFile));
  const csvFileCount = input.files.filter((file) => extname(file.path).toLowerCase() === ".csv").length;
  const artifacts = artifactDefinitions.map((definition) => buildArtifact(definition, input.files));
  const artifactBlockers = artifacts.filter((artifact) => artifact.status === "block").length;
  const privacyBlocked = pilotEvidenceScanPassed(privacyScan) && csvFileCount === 0 ? 0 : 1;
  const blockers = artifactBlockers + privacyBlocked;
  const evidenceHashes = artifacts
    .filter((artifact): artifact is PilotEvidenceFolderArtifact & { evidenceHash: string } =>
      Boolean(artifact.evidenceHash),
    )
    .map((artifact) => ({
      id: artifact.id,
      hash: artifact.evidenceHash,
    }));

  return {
    status: blockers === 0 ? "ready" : "blocked",
    generatedAt,
    readyToShare: blockers === 0,
    blockers,
    artifacts,
    privacyScan: {
      status: privacyBlocked ? "block" : "pass",
      scannedFileCount: privacyScan.scannedFileCount,
      csvFileCount,
      findingCount: privacyScan.findingCount,
      categories: privacyScan.categories,
    },
    nextActions: buildNextActions(artifacts, privacyScan, csvFileCount),
    evidenceHashes,
    privacyGuardrails,
  };
}

export function pilotEvidenceFolderPassed(report: PilotEvidenceFolderReport) {
  return report.readyToShare && report.status === "ready" && report.blockers === 0;
}

export function formatPilotEvidenceFolderMarkdown(report: PilotEvidenceFolderReport) {
  return [
    "# HR One Pilot Evidence Folder Gate",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Result: ${report.blockers} blocker(s)`,
    "",
    "## Required Artifacts",
    "",
    ...report.artifacts.map((artifact) => [
      `- [${artifact.status.toUpperCase()}] ${artifact.title}`,
      `  - Detail: ${redactEvidenceFolderText(artifact.detail)}`,
      `  - Next step: ${redactEvidenceFolderText(artifact.nextStep)}`,
      artifact.path ? `  - Path: ${redactEvidencePath(artifact.path)}` : null,
      artifact.evidenceHash ? `  - Evidence hash: ${artifact.evidenceHash}` : null,
    ].filter(Boolean).join("\n")),
    "",
    "## Privacy Scan",
    "",
    `- Status: ${report.privacyScan.status}`,
    `- Scanned files: ${report.privacyScan.scannedFileCount}`,
    `- CSV files: ${report.privacyScan.csvFileCount}`,
    `- Findings: ${report.privacyScan.findingCount}`,
    ...(
      report.privacyScan.categories.length
        ? report.privacyScan.categories.map((item) => `- ${item.category}: ${item.count}`)
        : ["- Categories: none"]
    ),
    "",
    "## Next Actions",
    "",
    ...formatList(report.nextActions, "Evidence folder is ready to share with approved pilot stakeholders."),
    "",
    "## Evidence Hashes",
    "",
    ...formatList(
      report.evidenceHashes.map((item) => `${item.id}: ${item.hash}`),
      "No evidence report hashes attached.",
    ),
    "",
    "## Privacy Guardrails",
    "",
    ...formatList(report.privacyGuardrails, "No additional guardrails."),
    "",
  ].join("\n");
}

function buildArtifact(
  definition: ArtifactDefinition,
  files: PilotEvidenceFolderInputFile[],
): PilotEvidenceFolderArtifact {
  const file = findArtifactFile(definition, files);
  if (!file) {
    return {
      id: definition.id,
      title: definition.title,
      status: "block",
      detail: `Missing ${definition.title}. Expected one of: ${definition.aliases.join(", ")}.`,
      nextStep: definition.nextStep,
      path: null,
      evidenceHash: null,
    };
  }
  const validation = definition.validate(file.content);
  return {
    id: definition.id,
    title: definition.title,
    status: validation.ready ? "pass" : "block",
    detail: validation.detail,
    nextStep: validation.ready
      ? "Keep this redacted report in the pilot evidence folder."
      : definition.nextStep,
    path: file.path,
    evidenceHash: hashContent(file.content),
  };
}

function validateProductionDatabase(content: string): ValidationResult {
  const json = parseJson(content);
  if (json) {
    const ready =
      readString(json, "status") === "ready" &&
      readString(json, "rootCause") === "ready" &&
      readNestedString(json, ["envDraft", "status"]) === "ready";
    return result(
      ready,
      `status ${readString(json, "status") ?? "missing"}; root cause ${readString(json, "rootCause") ?? "missing"}; env draft ${readNestedString(json, ["envDraft", "status"]) ?? "missing"}`,
    );
  }

  const status = matchLine(content, "Status");
  const rootCause = matchLine(content, "Root cause");
  const localEnvDraftReady = /## Local Env Draft[\s\S]*?-\s*Status:\s*ready\b/i.test(content);
  return result(
    status === "ready" && rootCause === "ready" && localEnvDraftReady,
    `status ${status ?? "missing"}; root cause ${rootCause ?? "missing"}; env draft ${localEnvDraftReady ? "ready" : "not ready"}`,
  );
}

function validateGoNoGo(content: string): ValidationResult {
  const json = parseJson(content);
  if (json) {
    const ready =
      readString(json, "status") === "ready_to_start" &&
      readNumber(json, "blockers") === 0 &&
      readNumber(json, "warnings") === 0;
    return result(
      ready,
      `status ${readString(json, "status") ?? "missing"}; blockers ${readNumber(json, "blockers") ?? "missing"}; warnings ${readNumber(json, "warnings") ?? "missing"}`,
    );
  }

  const status = matchLine(content, "Status");
  const zeroResult = /^Result:\s*0 blocker\(s\), 0 warning\(s\)/im.test(content);
  return result(
    status === "ready_to_start" && zeroResult,
    `status ${status ?? "missing"}; zero blocker/warning result ${zeroResult ? "yes" : "no"}`,
  );
}

function validateInvitationRelease(content: string): ValidationResult {
  const json = parseJson(content);
  if (json) {
    const ready = readString(json, "status") === "released" && readNumber(json, "blockers") === 0;
    return result(
      ready,
      `status ${readString(json, "status") ?? "missing"}; blockers ${readNumber(json, "blockers") ?? "missing"}`,
    );
  }

  const status = matchLine(content, "Status");
  const zeroResult = /^Result:\s*0 blocker\(s\)/im.test(content);
  return result(status === "released" && zeroResult, `status ${status ?? "missing"}; zero blockers ${zeroResult ? "yes" : "no"}`);
}

function validateDailyStatus(
  content: string,
  expectedDay: number,
  acceptedStatuses: string[],
): ValidationResult {
  const json = parseJson(content);
  if (json) {
    const day = readNumber(json, "day");
    const status = readString(json, "status");
    return result(
      day === expectedDay && Boolean(status && acceptedStatuses.includes(status)),
      `trial day ${day ?? "missing"}; status ${status ?? "missing"}`,
    );
  }

  const day = parseIntegerLine(content, "Trial day");
  const status = matchLine(content, "Status");
  return result(
    day === expectedDay && Boolean(status && acceptedStatuses.includes(status)),
    `trial day ${day ?? "missing"}; status ${status ?? "missing"}`,
  );
}

function validateTrialCompletion(content: string): ValidationResult {
  const json = parseJson(content);
  if (json) {
    const ready =
      readString(json, "status") === "completed" &&
      readNumber(json, "blockers") === 0 &&
      readNumber(json, "warnings") === 0;
    return result(
      ready,
      `status ${readString(json, "status") ?? "missing"}; blockers ${readNumber(json, "blockers") ?? "missing"}; warnings ${readNumber(json, "warnings") ?? "missing"}`,
    );
  }

  const status = matchLine(content, "Status");
  const zeroResult = /^Result:\s*0 blocker\(s\), 0 warning\(s\)/im.test(content);
  return result(status === "completed" && zeroResult, `status ${status ?? "missing"}; zero blocker/warning result ${zeroResult ? "yes" : "no"}`);
}

function validateAuditEvidence(content: string): ValidationResult {
  const json = parseJson(content);
  if (json) {
    const warningCount = readNumber(json, "warnings") ?? readNumber(json, "warningCount");
    const packageCount = readNumber(json, "packageCount") ?? readNumber(json, "packages");
    const ready = (packageCount ?? 1) > 0 && (warningCount ?? 0) === 0;
    return result(ready, `package count ${packageCount ?? "present"}; warnings ${warningCount ?? 0}`);
  }

  const mentionsAudit = /audit/i.test(content);
  const warnings = parseIntegerLine(content, "Warnings") ?? parseIntegerLine(content, "Warning count") ?? 0;
  return result(mentionsAudit && warnings === 0, `audit reference ${mentionsAudit ? "yes" : "no"}; warnings ${warnings}`);
}

function validateHandoff(content: string): ValidationResult {
  const json = parseJson(content);
  if (json) {
    const readyToStart = readBoolean(json, "readyToStart");
    const complete = readBoolean(json, "complete");
    return result(
      readyToStart === true && complete === true,
      `ready to start ${readyToStart ?? "missing"}; complete ${complete ?? "missing"}`,
    );
  }

  const readyToStart = matchBulletValue(content, "Ready to start");
  const complete = matchBulletValue(content, "Complete");
  return result(
    readyToStart === "yes" && complete === "yes",
    `ready to start ${readyToStart ?? "missing"}; complete ${complete ?? "missing"}`,
  );
}

function result(ready: boolean, detail: string): ValidationResult {
  return {
    ready,
    detail: redactEvidenceFolderText(detail),
  };
}

function findArtifactFile(
  definition: ArtifactDefinition,
  files: PilotEvidenceFolderInputFile[],
) {
  const aliases = new Set(definition.aliases.map((alias) => alias.toLowerCase()));
  return files.find((file) => aliases.has(basename(file.path).toLowerCase())) ?? null;
}

function buildNextActions(
  artifacts: PilotEvidenceFolderArtifact[],
  privacyScan: PilotEvidenceScanReport,
  csvFileCount: number,
) {
  const actions = [
    ...artifacts
      .filter((artifact) => artifact.status === "block")
      .map((artifact) => artifact.nextStep),
    ...(csvFileCount > 0
      ? ["Remove raw CSV files from the evidence folder; keep completed employee, identity, and payroll CSV files only in approved secure storage."]
      : []),
    ...(pilotEvidenceScanPassed(privacyScan)
      ? []
      : ["Remove sensitive values from the pilot evidence folder and rerun pnpm pilot:evidence-package."]),
  ].map(redactEvidenceFolderText);
  return [...new Set(actions)];
}

function toEvidenceScanFile(file: PilotEvidenceFolderInputFile): PilotEvidenceScanInputFile {
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

function matchBulletValue(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^-\\s*${escaped}:\\s*([^\\n\\r]+)`, "im"));
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function parseIntegerLine(content: string, label: string) {
  const value = matchLine(content, label);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readString(value: Record<string, unknown>, key: string) {
  const item = value[key];
  return typeof item === "string" ? item : null;
}

function readNumber(value: Record<string, unknown>, key: string) {
  const item = value[key];
  return typeof item === "number" ? item : null;
}

function readBoolean(value: Record<string, unknown>, key: string) {
  const item = value[key];
  return typeof item === "boolean" ? item : null;
}

function readNestedString(value: Record<string, unknown>, keys: string[]) {
  let current: unknown = value;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function redactEvidenceFolderText(value: string) {
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

function redactEvidencePath(path: string) {
  return redactEvidenceFolderText(path);
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactEvidenceFolderText(item)}`);
}
