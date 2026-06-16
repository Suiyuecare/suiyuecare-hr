import { describe, expect, it } from "vitest";
import type { PilotAcceptanceItem, PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import { buildPilotDailyStatusReport } from "@/server/readiness/pilot-daily-status";
import type { PilotEvidenceScanReport } from "@/server/readiness/pilot-evidence-scan";
import type { PilotInviteReadinessReport } from "@/server/readiness/pilot-invite-readiness";
import type { PilotImportPreflightReport } from "@/server/readiness/pilot-import-preflight";
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
      evidenceScan: evidenceScanReport({ status: "pass" }),
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "ready_to_start",
      readyToStart: true,
      blockers: 0,
      warnings: 0,
    });
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
    expect(pilotGoNoGoPassed(report)).toBe(true);
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
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "Fix every import preflight blocker or warning before using the completed customer CSV files.",
        "Fix pilot invite readiness blockers before sending employee invitations.",
        "Remove sensitive values from pilot evidence files and rerun the evidence scan.",
      ]),
    );
  });

  it("allows operator-skipped import and evidence checks only as warnings", () => {
    const acceptance = acceptanceReport({ readyToStart: true });
    const report = buildPilotGoNoGoReport({
      acceptance,
      day0: buildPilotDailyStatusReport({ acceptance, day: 0 }),
      importPreflight: null,
      inviteReadiness: null,
      evidenceScan: null,
      importPreflightRequired: false,
      inviteReadinessRequired: false,
      evidenceScanRequired: false,
    });

    expect(report).toMatchObject({
      status: "ready_to_start",
      blockers: 0,
      warnings: 3,
    });
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "warn", "warn", "warn"]);
    expect(pilotGoNoGoPassed(report)).toBe(true);
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
    blockers: options.blockers ?? 0,
    warnings: options.warnings ?? 0,
    checks: [],
    nextActions: [],
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
