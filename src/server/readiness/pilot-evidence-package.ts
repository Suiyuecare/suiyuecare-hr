import { getAuditEvidenceWorkspace } from "@/server/audit/evidence-packages";
import type { RoleKey } from "@/server/auth/rbac";
import {
  getBetaPilotTrialWorkspace,
  type BetaPilotTrialWorkspace,
} from "@/server/readiness/beta-pilot-trial-run";
import {
  buildPilotCompletionUiSnapshot,
  type PilotCompletionUiSnapshot,
} from "@/server/readiness/pilot-completion-ui";
import {
  buildPilotGoNoGoUiSnapshot,
  type PilotGoNoGoUiSnapshot,
} from "@/server/readiness/pilot-go-no-go-ui";
import { getPilotOperationsReport, type PilotOperationsReport } from "@/server/readiness/pilot-operations";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type PilotEvidencePackageItemStatus = "pass" | "warn" | "block";

export type PilotEvidencePackageItem = {
  id:
    | "trial_run"
    | "go_no_go"
    | "checkpoint_evidence"
    | "audit_evidence"
    | "completion_review"
    | "evidence_privacy_scan"
    | "redacted_handoff";
  title: string;
  status: PilotEvidencePackageItemStatus;
  detail: string;
  nextStep: string;
  href: string;
  command: string | null;
};

export type PilotEvidencePackageReport = {
  status: "ready" | "blocked";
  generatedAt: string;
  readyToShare: boolean;
  blockers: number;
  warnings: number;
  items: PilotEvidencePackageItem[];
  commands: string[];
  privacyGuardrails: string[];
};

export type PilotEvidencePackageWorkspace = {
  report: PilotEvidencePackageReport;
  trialWorkspace: BetaPilotTrialWorkspace;
  operations: PilotOperationsReport;
  goNoGo: PilotGoNoGoUiSnapshot;
  completion: PilotCompletionUiSnapshot;
  auditPackageCount: number;
};

const privacyGuardrails = [
  "證據包只能放彙總狀態、hash-only 證據代碼、redacted 報告與命令輸出摘要。",
  "不得放入員工姓名、Email、薪資金額、銀行帳號、身分證字號、健康資料、資料庫 URL、token 或私人 HR 備註。",
  "完成的 employee、identity、payroll CSV 只能留在核准的安全儲存位置，不得附在證據包、聊天或客服工單。",
  "證據資料夾交付前必須跑 pilot:evidence-scan，且 finding 必須為 0。",
];

export async function buildPilotEvidencePackageWorkspace(
  session: SessionLike,
  options: { tenantSlug?: string; companyId?: string | null; generatedAt?: Date } = {},
): Promise<PilotEvidencePackageWorkspace> {
  const generatedAt = options.generatedAt ?? new Date();
  const trialWorkspace = await getBetaPilotTrialWorkspace(session);
  const tenantSlug = normalizeTenantSlug(options.tenantSlug);
  const companyId = options.companyId ?? session.companyId ?? null;
  const [operations, goNoGo, completion, auditEvidence] = await Promise.all([
    getPilotOperationsReport(session, { trialDay: trialWorkspace.trialRun?.currentDay ?? null }),
    buildPilotGoNoGoUiSnapshot(session, { tenantSlug, companyId, generatedAt }),
    buildPilotCompletionUiSnapshot(session, { generatedAt }),
    getAuditEvidenceWorkspace(session),
  ]);
  const report = buildPilotEvidencePackageReport({
    generatedAt,
    trialWorkspace,
    operations,
    goNoGo,
    completion,
    auditPackageCount: auditEvidence.packages.length,
    latestAuditWarningCount: auditEvidence.latest?.warnings.length ?? null,
  });

  return {
    report,
    trialWorkspace,
    operations,
    goNoGo,
    completion,
    auditPackageCount: auditEvidence.packages.length,
  };
}

export function buildPilotEvidencePackageReport(input: {
  generatedAt?: Date;
  trialWorkspace: BetaPilotTrialWorkspace;
  operations: PilotOperationsReport;
  goNoGo: PilotGoNoGoUiSnapshot;
  completion: PilotCompletionUiSnapshot;
  auditPackageCount: number;
  latestAuditWarningCount: number | null;
}): PilotEvidencePackageReport {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const items = [
    buildTrialRunItem(input.trialWorkspace),
    buildGoNoGoItem(input.goNoGo),
    buildCheckpointItem(input.operations),
    buildAuditEvidenceItem(input.auditPackageCount, input.latestAuditWarningCount),
    buildCompletionItem(input.completion),
    buildEvidenceScanItem(),
    buildHandoffItem(input.completion),
  ];
  const blockers = items.filter((item) => item.status === "block").length;
  const warnings = items.filter((item) => item.status === "warn").length;
  return {
    status: blockers === 0 && warnings === 0 ? "ready" : "blocked",
    generatedAt,
    readyToShare: blockers === 0 && warnings === 0,
    blockers,
    warnings,
    items,
    commands: [
      "pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --evidence-path=<pilot-evidence-folder> --recursive --output=<pilot-evidence-folder>/go-no-go.md",
      "pnpm pilot:daily-status -- --day=14 --tenant-slug=<customer-slug> --final-review=verified --output=<pilot-evidence-folder>/day-14.md",
      "pnpm pilot:trial-completion -- --tenant-slug=<customer-slug> --evidence-path=<pilot-evidence-folder> --recursive --output=<pilot-evidence-folder>/completion.md",
      "pnpm pilot:evidence-scan -- --path=<pilot-evidence-folder> --recursive",
      "pnpm pilot:handoff -- --tenant-slug=<customer-slug> --output=<pilot-evidence-folder>/handoff.md",
    ],
    privacyGuardrails,
  };
}

export function formatPilotEvidencePackageMarkdown(report: PilotEvidencePackageReport) {
  return [
    "# HR One Pilot Evidence Package Review",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Result: ${report.blockers} blocker(s), ${report.warnings} warning(s)`,
    "",
    "## Items",
    "",
    ...report.items.map((item) => [
      `- [${item.status.toUpperCase()}] ${item.title}`,
      `  - Detail: ${redactPackageText(item.detail)}`,
      `  - Next step: ${redactPackageText(item.nextStep)}`,
      item.command ? `  - Command: ${item.command}` : null,
    ].filter(Boolean).join("\n")),
    "",
    "## Commands",
    "",
    ...report.commands.map((command) => `- ${command}`),
    "",
    "## Privacy Guardrails",
    "",
    ...report.privacyGuardrails.map((guardrail) => `- ${guardrail}`),
    "",
  ].join("\n");
}

function buildTrialRunItem(workspace: BetaPilotTrialWorkspace): PilotEvidencePackageItem {
  if (!workspace.trialRun) {
    return item(
      "trial_run",
      "試用批次 snapshot",
      "block",
      "尚未建立 20-50 人兩週試用批次。",
      "先到試用批次控制台建立或同步批次，正式試用必須保存到 PostgreSQL。",
      "/settings/pilot-trial-run",
      null,
    );
  }
  if (!workspace.persistence.readyForLiveTrial) {
    return item(
      "trial_run",
      "試用批次 snapshot",
      "block",
      `${workspace.trialRun.status}; persistence ${workspace.persistence.mode}; ${workspace.trialRun.expectedEmployeeCount} employee(s), ${workspace.trialRun.managerCount} manager(s).`,
      "正式試用批次必須使用 PostgreSQL 保存，demo 暫存不能作為客戶交付證據。",
      "/settings/pilot-trial-run",
      null,
    );
  }
  return item(
    "trial_run",
    "試用批次 snapshot",
    "pass",
    `${workspace.trialRun.status}; day ${workspace.trialRun.currentDay}; ${workspace.trialRun.expectedEmployeeCount} employee(s), ${workspace.trialRun.managerCount} manager(s), ${workspace.trialRun.eventCount} event(s).`,
    "保留批次 hash 與事件摘要即可，不要附 raw 名單。",
    "/settings/pilot-trial-run",
    null,
  );
}

function buildGoNoGoItem(snapshot: PilotGoNoGoUiSnapshot): PilotEvidencePackageItem {
  return item(
    "go_no_go",
    "開跑 Go/No-Go 報告",
    snapshot.report.readyToStart ? "pass" : "block",
    `${snapshot.report.status}; ${snapshot.report.blockers} blocker(s), ${snapshot.report.warnings} warning(s).`,
    snapshot.report.readyToStart
      ? "保存 redacted Go/No-Go 報告與命令輸出摘要。"
      : "補齊正式環境、匯入預檢、邀請 readiness、核心流程與 evidence scan 後重跑 Go/No-Go。",
    "/settings/pilot-go-no-go",
    "pnpm pilot:go-no-go -- --tenant-slug=<customer-slug> --evidence-path=<pilot-evidence-folder> --recursive",
  );
}

function buildCheckpointItem(operations: PilotOperationsReport): PilotEvidencePackageItem {
  if (operations.completedPhaseCount === operations.phases.length) {
    return item(
      "checkpoint_evidence",
      "Day 0/1/3/7/14 checkpoint",
      "pass",
      `${operations.completedPhaseCount}/${operations.phases.length} phase(s) verified; ${operations.totalRecordedEvidenceCount} evidence record(s).`,
      "保留 hash-only checkpoint 摘要與每日狀態報告。",
      "/settings/pilot-operations",
      "pnpm pilot:daily-status -- --day=14 --tenant-slug=<customer-slug> --final-review=verified",
    );
  }
  return item(
    "checkpoint_evidence",
    "Day 0/1/3/7/14 checkpoint",
    operations.totalRecordedEvidenceCount > 0 ? "warn" : "block",
    `${operations.completedPhaseCount}/${operations.phases.length} phase(s) verified; ${operations.blockedPhaseCount} blocked; ${operations.totalRecordedEvidenceCount} evidence record(s).`,
    "到每日戰情補齊 Day 0、Day 1、Day 3、Day 7、Day 14 的必要 checkpoint 證據。",
    "/settings/pilot-operations",
    "pnpm pilot:daily-status -- --day=<0|1|3|7|14> --tenant-slug=<customer-slug>",
  );
}

function buildAuditEvidenceItem(
  auditPackageCount: number,
  latestAuditWarningCount: number | null,
): PilotEvidencePackageItem {
  if (auditPackageCount === 0) {
    return item(
      "audit_evidence",
      "Audit evidence package",
      "block",
      "尚未產生 audit evidence package。",
      "產生 redacted audit evidence package，確認薪資、假勤、簽核、公告與設定變更都有 audit 覆蓋。",
      "/settings/pilot-evidence",
      null,
    );
  }
  return item(
    "audit_evidence",
    "Audit evidence package",
    latestAuditWarningCount && latestAuditWarningCount > 0 ? "warn" : "pass",
    `${auditPackageCount} package(s); latest warning count ${latestAuditWarningCount ?? 0}.`,
    latestAuditWarningCount && latestAuditWarningCount > 0
      ? "檢查 audit package coverage warnings；必要時補跑流程或縮放期間。"
      : "保存 audit package hash 與 coverage 摘要即可。",
    "/settings/audit",
    null,
  );
}

function buildCompletionItem(snapshot: PilotCompletionUiSnapshot): PilotEvidencePackageItem {
  return item(
    "completion_review",
    "Day 14 completion review",
    snapshot.report.completed ? "pass" : "block",
    `${snapshot.report.status}; ${snapshot.report.blockers} blocker(s), ${snapshot.report.warnings} warning(s).`,
    snapshot.report.completed
      ? "保存 redacted completion review。"
      : "Day 14 completion review 必須零 blocker、零 warning 才能叫試用成功。",
    "/settings/pilot-completion",
    "pnpm pilot:trial-completion -- --tenant-slug=<customer-slug> --evidence-path=<pilot-evidence-folder> --recursive",
  );
}

function buildEvidenceScanItem(): PilotEvidencePackageItem {
  return item(
    "evidence_privacy_scan",
    "Evidence privacy scan",
    "block",
    "Browser UI 無法掃描核准安全資料夾，必須由 CLI 掃描 evidence folder。",
    "在交付證據包前跑 pilot:evidence-scan，所有 finding 必須修到 0。",
    "/settings/pilot-completion",
    "pnpm pilot:evidence-scan -- --path=<pilot-evidence-folder> --recursive",
  );
}

function buildHandoffItem(snapshot: PilotCompletionUiSnapshot): PilotEvidencePackageItem {
  return item(
    "redacted_handoff",
    "Redacted handoff package",
    snapshot.report.completed ? "warn" : "block",
    snapshot.report.completed
      ? "Completion review passed in UI, but handoff markdown must still be generated and scanned externally."
      : "Completion review 尚未通過，不能產生 final handoff。",
    "產生 redacted handoff 後，把它放進 evidence folder 並重跑 evidence scan。",
    "/settings/pilot-completion",
    "pnpm pilot:handoff -- --tenant-slug=<customer-slug> --output=<pilot-evidence-folder>/handoff.md",
  );
}

function item(
  id: PilotEvidencePackageItem["id"],
  title: string,
  status: PilotEvidencePackageItemStatus,
  detail: string,
  nextStep: string,
  href: string,
  command: string | null,
): PilotEvidencePackageItem {
  return {
    id,
    title,
    status,
    detail: redactPackageText(detail),
    nextStep: redactPackageText(nextStep),
    href,
    command,
  };
}

function redactPackageText(value: string) {
  return redactSensitiveDetail(value)
    .replace(/(薪資|底薪|本薪|base salary|salary amount)\s*[:：=]\s*\$?\d[\d,]*/gi, "$1: [REDACTED]")
    .replace(/(銀行帳號|帳號|account number|bank account)\s*[:：=]\s*[^\s,;，；。]+/gi, "$1: [REDACTED]")
    .replace(/(健康資料|病歷|診斷|health data|medical record|diagnosis)\s*[:：=]\s*[^\s,;，；。]+/gi, "$1: [REDACTED]")
    .replace(/[A-Z][12]\d{8}/gi, "[REDACTED]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]");
}

function normalizeTenantSlug(value: string | undefined) {
  return value?.trim() ||
    process.env.HR_ONE_PILOT_TENANT_SLUG?.trim() ||
    process.env.HR_ONE_TENANT_SLUG?.trim() ||
    "suiyuecare-pilot";
}
