import { describe, expect, it } from "vitest";
import type { PilotAcceptanceItem, PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import { buildPilotDailyStatusReport } from "@/server/readiness/pilot-daily-status";
import type { PilotEvidenceScanReport } from "@/server/readiness/pilot-evidence-scan";
import type { PilotInviteReadinessReport } from "@/server/readiness/pilot-invite-readiness";
import type { PilotImportPreflightReport } from "@/server/readiness/pilot-import-preflight";
import type { PilotWorkflowReadinessReport } from "@/server/readiness/pilot-workflow-readiness";
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
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass", "pass", "pass"]);
    expect(pilotGoNoGoPassed(report)).toBe(true);
  });

  it("allows rehearsed-only core workflows before invite while flagging production evidence follow-up", () => {
    const acceptance = acceptanceReport({ readyToStart: true });
    const report = buildPilotGoNoGoReport({
      acceptance,
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
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "warn", "warn", "warn", "warn"]);
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
