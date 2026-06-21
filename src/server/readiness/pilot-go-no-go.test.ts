import { describe, expect, it } from "vitest";
import type { PilotAcceptanceItem, PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import { buildPilotDailyStatusReport } from "@/server/readiness/pilot-daily-status";
import type { PilotEvidenceScanReport } from "@/server/readiness/pilot-evidence-scan";
import type { PilotInviteReadinessReport } from "@/server/readiness/pilot-invite-readiness";
import type { PilotImportPreflightReport } from "@/server/readiness/pilot-import-preflight";
import type { PilotWorkflowReadinessReport } from "@/server/readiness/pilot-workflow-readiness";
import type { ProductionDatabaseRemediationReport } from "@/server/readiness/production-database-remediation";
import {
  buildPilotGoNoGoReport,
  formatPilotGoNoGoMarkdown,
  pilotGoNoGoPassed,
} from "@/server/readiness/pilot-go-no-go";

describe("pilot go/no-go", () => {
  it("passes when acceptance, day 0, import preflight, and evidence scan are ready", () => {
    const acceptance = acceptanceReport({ readyToStart: true });
    const report = buildPilotGoNoGoReport({
      acceptance,
      productionDatabase: productionDatabaseReport({ status: "ready" }),
      day0: buildPilotDailyStatusReport({ acceptance, day: 0 }),
      importPreflight: importPreflightReport({ status: "ready" }),
      inviteReadiness: inviteReadinessReport({ status: "ready" }),
      workflowReadiness: workflowReadinessReport({ status: "production_ready" }),
      evidenceScan: evidenceScanReport({ status: "pass" }),
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "ready_to_start",
      readyToStart: true,
      blockers: 0,
      warnings: 0,
    });
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass", "pass", "pass", "pass"]);
    expect(pilotGoNoGoPassed(report)).toBe(true);
  });

  it("allows rehearsed-only core workflows before invite while flagging production evidence follow-up", () => {
    const acceptance = acceptanceReport({ readyToStart: true });
    const report = buildPilotGoNoGoReport({
      acceptance,
      productionDatabase: productionDatabaseReport({ status: "ready" }),
      day0: buildPilotDailyStatusReport({ acceptance, day: 0 }),
      importPreflight: importPreflightReport({ status: "ready" }),
      inviteReadiness: inviteReadinessReport({ status: "ready" }),
      workflowReadiness: workflowReadinessReport({
        status: "needs_production_evidence",
        productionReadyCount: 0,
        rehearsedOnlyCount: 7,
      }),
      evidenceScan: evidenceScanReport({ status: "pass" }),
    });

    expect(report).toMatchObject({
      status: "ready_to_start",
      readyToStart: true,
      blockers: 0,
      warnings: 0,
    });
    expect(report.checks.find((check) => check.id === "workflow_readiness")).toMatchObject({
      status: "pass",
      detail: "needs_production_evidence; 0 production ready / 7 rehearsed only / 0 blocked",
    });
  });

  it("blocks when the production database gate or env draft is not ready", () => {
    const acceptance = acceptanceReport({ readyToStart: true });
    const report = buildPilotGoNoGoReport({
      acceptance,
      productionDatabase: productionDatabaseReport({
        status: "blocked",
        envDraftStatus: "blocked",
        rootCause: "supabase_direct_network",
        nextActions: [
          "Fix DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone?schema=hr_one before pilot.",
        ],
      }),
      day0: buildPilotDailyStatusReport({ acceptance, day: 0 }),
      importPreflight: importPreflightReport({ status: "ready" }),
      inviteReadiness: inviteReadinessReport({ status: "ready" }),
      workflowReadiness: workflowReadinessReport({ status: "production_ready" }),
      evidenceScan: evidenceScanReport({ status: "pass" }),
    });
    const markdown = formatPilotGoNoGoMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "production_database")).toMatchObject({
      status: "block",
      detail: "blocked; root cause supabase_direct_network; env draft blocked",
    });
    expect(report.nextActions.join("\n")).not.toContain("postgresql://");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
    expect(pilotGoNoGoPassed(report)).toBe(false);
  });

  it("blocks missing required preflight evidence and redacts sensitive next actions", () => {
    const acceptance = acceptanceReport({
      readyToStart: false,
      itemStatuses: {
        production_foundation: "blocked",
      },
      nextActions: [
        "Fix DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone?schema=hr_one.",
        "Remove 薪資: 56000 from the shared report.",
      ],
    });
    const report = buildPilotGoNoGoReport({
      acceptance,
      day0: buildPilotDailyStatusReport({ acceptance, day: 0 }),
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });
    const markdown = formatPilotGoNoGoMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(report.blockers).toBeGreaterThanOrEqual(3);
    expect(report.checks.find((check) => check.id === "import_preflight")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "production_database")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "evidence_scan")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "invite_readiness")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "workflow_readiness")).toMatchObject({
      status: "block",
    });
    expect(markdown).toContain("[REDACTED]");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
    expect(markdown).not.toContain("薪資: 56000");
    expect(report.nextActions.join("\n")).not.toContain("postgresql://");
    expect(report.nextActions.join("\n")).not.toContain("薪資: 56000");
    expect(pilotGoNoGoPassed(report)).toBe(false);
  });

  it("blocks import warnings and evidence findings before a real customer pilot starts", () => {
    const acceptance = acceptanceReport({ readyToStart: true });
    const report = buildPilotGoNoGoReport({
      acceptance,
      productionDatabase: productionDatabaseReport({ status: "ready" }),
      day0: buildPilotDailyStatusReport({ acceptance, day: 0 }),
      importPreflight: importPreflightReport({ status: "action_required", warnings: 1 }),
      inviteReadiness: inviteReadinessReport({ status: "blocked", blockers: 2 }),
      workflowReadiness: workflowReadinessReport({ status: "blocked", blockedCount: 1 }),
      evidenceScan: evidenceScanReport({ status: "failed", findingCount: 2 }),
    });

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "import_preflight")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "evidence_scan")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "invite_readiness")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "workflow_readiness")).toMatchObject({
      status: "block",
    });
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "Fix every import preflight blocker or warning before using the completed customer CSV files.",
        "Fix pilot invite readiness blockers before sending employee invitations.",
        "Fix blocked workflow readiness items before inviting pilot employees.",
        "Remove sensitive values from pilot evidence files and rerun the evidence scan.",
      ]),
    );
  });

  it("blocks core workflow readiness when production evidence is explicitly required", () => {
    const acceptance = acceptanceReport({ readyToStart: true });
    const report = buildPilotGoNoGoReport({
      acceptance,
      productionDatabase: productionDatabaseReport({ status: "ready" }),
      day0: buildPilotDailyStatusReport({ acceptance, day: 0 }),
      importPreflight: importPreflightReport({ status: "ready" }),
      inviteReadiness: inviteReadinessReport({ status: "ready" }),
      workflowReadiness: workflowReadinessReport({
        status: "blocked",
        requireProductionEvidence: true,
        productionReadyCount: 3,
        rehearsedOnlyCount: 4,
      }),
      evidenceScan: evidenceScanReport({ status: "pass" }),
    });

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "workflow_readiness")).toMatchObject({
      status: "block",
      nextStep: "Capture the required production workflow evidence before calling the pilot workflow production-ready.",
    });
    expect(pilotGoNoGoPassed(report)).toBe(false);
  });

  it("blocks operator-skipped checks even when they are represented as warnings", () => {
    const acceptance = acceptanceReport({ readyToStart: true });
    const report = buildPilotGoNoGoReport({
      acceptance,
      productionDatabase: productionDatabaseReport({ status: "ready" }),
      day0: buildPilotDailyStatusReport({ acceptance, day: 0 }),
      importPreflight: null,
      inviteReadiness: null,
      evidenceScan: null,
      importPreflightRequired: false,
      inviteReadinessRequired: false,
      workflowReadinessRequired: false,
      evidenceScanRequired: false,
    });

    expect(report).toMatchObject({
      status: "blocked",
      readyToStart: false,
      blockers: 0,
      warnings: 4,
    });
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "warn", "warn", "warn", "warn"]);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "Run import preflight before using real customer employee, identity, or payroll CSV files.",
        "Run invite readiness before sending the first pilot employee invitation.",
        "Run workflow readiness before inviting the first pilot employee.",
        "Run evidence scan before sharing pilot reports outside the implementation team.",
      ]),
    );
    expect(pilotGoNoGoPassed(report)).toBe(false);
  });
});

const allItemIds = [
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
] as const satisfies ReadonlyArray<PilotAcceptanceItem["id"]>;

function acceptanceReport(options: {
  readyToStart: boolean;
  complete?: boolean;
  itemStatuses?: Partial<Record<PilotAcceptanceItem["id"], PilotAcceptanceItem["status"]>>;
  nextActions?: string[];
}): PilotAcceptanceReport {
  const items = allItemIds.map((id) => {
    const status = options.itemStatuses?.[id] ?? (id === "two_week_completion" ? "blocked" : "ready");
    return {
      id,
      title: titleForId(id),
      status,
      evidence: `${id} evidence`,
      nextStep: `${id} next step`,
    } satisfies PilotAcceptanceItem;
  });
  return {
    status: options.readyToStart ? "ready_to_start" : "blocked",
    completionStatus: options.complete ? "complete" : "incomplete",
    checkedAt: "2026-06-17T00:00:00.000Z",
    readyToStart: options.readyToStart,
    complete: options.complete ?? false,
    readyCount: items.filter((item) => item.status === "ready").length,
    rehearsedCount: items.filter((item) => item.status === "rehearsed").length,
    blockedCount: items.filter((item) => item.status === "blocked").length,
    items,
    nextActions: options.nextActions ?? [],
  };
}

function productionDatabaseReport(options: {
  status: ProductionDatabaseRemediationReport["status"];
  envDraftStatus?: NonNullable<ProductionDatabaseRemediationReport["envDraft"]>["status"];
  rootCause?: ProductionDatabaseRemediationReport["rootCause"];
  nextActions?: string[];
}): ProductionDatabaseRemediationReport {
  const envDraftStatus = options.envDraftStatus ?? "ready";
  const nextActions = options.nextActions ?? [];
  return {
    status: options.status,
    generatedAt: "2026-06-17T00:00:00.000Z",
    appUrl: "https://hr.suiyuecare.com/",
    readinessUrl: "https://hr.suiyuecare.com/api/health/ready",
    rootCause: options.rootCause ?? (options.status === "ready" ? "ready" : "unknown"),
    summary: options.status === "ready" ? "Production database ready." : "Production database blocked.",
    gate: {
      status: options.status,
      appUrl: "https://hr.suiyuecare.com/",
      readinessUrl: "https://hr.suiyuecare.com/api/health/ready",
      checkedAt: "2026-06-17T00:00:00.000Z",
      checks: [],
      nextActions,
    },
    envDraft: {
      status: envDraftStatus,
      source: ".env.vercel.production",
      databaseConnectionPosture: envDraftStatus === "ready" ? "supabase-pooler-transaction" : "invalid",
      databaseUrlShape: envDraftStatus === "ready"
        ? "Supabase transaction pooler with Prisma pooler params"
        : "unresolved database URL placeholder",
      unresolvedPlaceholderKeys: envDraftStatus === "ready" ? [] : ["DATABASE_URL"],
      failedCheckNames: envDraftStatus === "ready" ? [] : ["database url"],
      checks: [],
      nextActions,
    },
    supabasePooler: {
      projectRef: "aruncclorusswpfnpgsn",
      region: "ap-northeast-2",
      username: "postgres.aruncclorusswpfnpgsn",
      host: "aws-0-ap-northeast-2.pooler.supabase.com",
      port: 6543,
      database: "postgres",
      schema: "hr_one",
      requiredQueryParams: ["pgbouncer=true", "connection_limit=1", "schema=hr_one"],
      passwordSource: "Supabase Dashboard > Connect > Transaction pooler password",
    },
    databaseDetail: options.status === "ready" ? "database ping succeeded" : "database ping failed",
    environmentDetail: options.status === "ready" ? "production environment posture verified" : "production environment verification failed",
    launchChecklist: [],
    vercelCutover: {
      status: options.status === "ready" ? "verified" : envDraftStatus === "ready" ? "ready_to_apply" : "waiting_for_env",
      summary: options.status === "ready"
        ? "Vercel production cutover verified."
        : "Vercel production cutover still needs operator action.",
      nextCommand: options.status === "ready"
        ? "curl -fsS https://hr.suiyuecare.com/api/health/ready"
        : "pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --dry-run",
      steps: [
        {
          id: "env_draft_ready",
          title: "本地 production env 草稿通過",
          status: envDraftStatus === "ready" ? "done" : "blocked",
          detail: "Fixture env draft state.",
          evidence: "Fixture env draft evidence.",
        },
        {
          id: "database_url_handoff",
          title: "Supabase transaction pooler URL 已交接",
          status: envDraftStatus === "ready" ? "done" : "blocked",
          detail: "Fixture database handoff state.",
          evidence: "Fixture database handoff evidence.",
        },
        {
          id: "vercel_apply_dry_run",
          title: "Vercel env 寫入前 dry-run",
          status: options.status === "ready" ? "done" : "todo",
          detail: "Fixture dry-run state.",
          evidence: "Fixture dry-run evidence.",
        },
        {
          id: "vercel_env_write",
          title: "寫入 Vercel Production env",
          status: options.status === "ready" ? "done" : "todo",
          detail: "Fixture env write state.",
          evidence: "Fixture env write evidence.",
        },
        {
          id: "production_redeploy",
          title: "重新部署 production",
          status: options.status === "ready" ? "done" : "todo",
          detail: "Fixture redeploy state.",
          evidence: "Fixture redeploy evidence.",
        },
        {
          id: "live_ready_probe",
          title: "Live /api/health/ready 通過",
          status: options.status === "ready" ? "done" : "todo",
          detail: "Fixture live ready state.",
          evidence: "Fixture live ready evidence.",
        },
        {
          id: "pilot_gate_evidence",
          title: "試營運 gate 留存 production 證據",
          status: options.status === "ready" ? "done" : "todo",
          detail: "Fixture pilot gate state.",
          evidence: "Fixture pilot gate evidence.",
        },
      ],
    },
    tracks: [],
    nextActions,
    privacyGuardrails: [],
  };
}

function importPreflightReport(options: {
  status: PilotImportPreflightReport["status"];
  blockers?: number;
  warnings?: number;
}): PilotImportPreflightReport {
  return {
    status: options.status,
    checkedAt: "2026-06-17T00:00:00.000Z",
    employeeRows: 25,
    identityRows: 25,
    payrollRows: 25,
    managerAssignmentCount: 20,
    managerWithDirectReportsCount: 3,
    departmentCount: 2,
    blockers: options.blockers ?? 0,
    warnings: options.warnings ?? 0,
    checks: [],
  };
}

function inviteReadinessReport(options: {
  status: PilotInviteReadinessReport["status"];
  blockers?: number;
  warnings?: number;
}): PilotInviteReadinessReport {
  return {
    status: options.status,
    checkedAt: "2026-06-17T00:00:00.000Z",
    activeEmployeeCount: 25,
    managerWithDirectReportsCount: 3,
    scheduledEmployeeCount: 25,
    leaveBalanceEmployeeCount: 25,
    releasedPayslipEmployeeCount: 25,
    blockers: options.blockers ?? 0,
    warnings: options.warnings ?? 0,
    checks: [],
    preparationAreas: [],
    nextActions: [],
  };
}

function workflowReadinessReport(options: {
  status: PilotWorkflowReadinessReport["status"];
  productionReadyCount?: number;
  rehearsedOnlyCount?: number;
  blockedCount?: number;
  requireProductionEvidence?: boolean;
}): PilotWorkflowReadinessReport {
  const productionReadyCount = options.productionReadyCount ?? 7;
  const rehearsedOnlyCount = options.rehearsedOnlyCount ?? 0;
  const blockedCount = options.blockedCount ?? 0;
  return {
    status: options.status,
    generatedAt: "2026-06-17T00:00:00.000Z",
    requireProductionEvidence: options.requireProductionEvidence ?? false,
    productionReadyCount,
    rehearsedOnlyCount,
    blockedCount,
    items: [],
    nextActions: blockedCount > 0 ? ["Fix blocked workflow readiness items before inviting pilot employees."] : [],
    privacyGuardrails: [],
  };
}

function evidenceScanReport(options: {
  status: PilotEvidenceScanReport["status"];
  findingCount?: number;
}): PilotEvidenceScanReport {
  const findingCount = options.findingCount ?? 0;
  return {
    status: options.status,
    scannedFileCount: 3,
    findingCount,
    categories: findingCount > 0 ? [{ category: "salary_amount_label", count: findingCount }] : [],
    findings: findingCount > 0
      ? [{ path: "/tmp/hr-one-pilot/leaky.md", category: "salary_amount_label", count: findingCount }]
      : [],
  };
}

function titleForId(id: PilotAcceptanceItem["id"]) {
  return id.split("_").join(" ");
}
