import { describe, expect, it } from "vitest";
import type { HrOneKpi } from "@/server/kpis/hr-one";
import type { BetaPilotCheckpointCoverage } from "@/server/readiness/beta-pilot-checkpoints";
import type { PilotEvidenceScanReport } from "@/server/readiness/pilot-evidence-scan";
import {
  buildPilotTrialCompletionReport,
  formatPilotTrialCompletionMarkdown,
  pilotTrialCompletionPassed,
} from "@/server/readiness/pilot-trial-completion";

describe("pilot trial completion", () => {
  it("passes only when checkpoints, KPIs, and evidence privacy scan are complete", () => {
    const report = buildPilotTrialCompletionReport({
      checkpoints: completeCheckpointCoverage(),
      kpis: kpis(),
      evidenceScan: evidenceScan({ status: "pass" }),
      generatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "completed",
      completed: true,
      blockers: 0,
      warnings: 0,
    });
    expect(report.checks.every((check) => check.status === "pass")).toBe(true);
    expect(pilotTrialCompletionPassed(report)).toBe(true);
  });

  it("blocks missing payroll and final review evidence plus failing KPIs", () => {
    const checkpoints = completeCheckpointCoverage().map((checkpoint) =>
      checkpoint.checkpointId === "day_7"
        ? { ...checkpoint, latestStatus: "in_progress" as const, evidenceTypes: ["payroll_rehearsal" as const] }
        : checkpoint.checkpointId === "day_14"
          ? { ...checkpoint, latestStatus: "not_started" as const, evidenceTypes: [] }
          : checkpoint,
    );
    const report = buildPilotTrialCompletionReport({
      checkpoints,
      kpis: kpis({ failingIds: ["payroll_close_reduction"] }),
      evidenceScan: evidenceScan({ status: "pass" }),
    });

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "day_7_payroll_payslip")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "day_14_final_review")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.id === "kpi_targets")).toMatchObject({
      status: "block",
    });
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "Run HR payroll close rehearsal, release a permitted payslip, and verify employee self-view only.",
        "Run final review only after open security, payroll, attendance, and evidence blockers are closed.",
        "Fix failing KPI(s): payroll_close_reduction.",
      ]),
    );
  });

  it("blocks missing or failed evidence scan and keeps markdown redacted", () => {
    const report = buildPilotTrialCompletionReport({
      checkpoints: completeCheckpointCoverage(),
      kpis: kpis(),
      evidenceScan: evidenceScan({ status: "failed", findingCount: 2 }),
    });
    const markdown = formatPilotTrialCompletionMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "evidence_privacy")).toMatchObject({
      status: "block",
    });
    expect(markdown).toContain("Status: blocked");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("A123456789");
    expect(markdown).not.toContain("56000");

    const missingScan = buildPilotTrialCompletionReport({
      checkpoints: completeCheckpointCoverage(),
      kpis: kpis(),
      evidenceScan: null,
    });
    expect(missingScan.checks.find((check) => check.id === "evidence_privacy")).toMatchObject({
      status: "block",
    });
  });

  it("keeps completion blocked when evidence scan is intentionally skipped", () => {
    const report = buildPilotTrialCompletionReport({
      checkpoints: completeCheckpointCoverage(),
      kpis: kpis(),
      evidenceScan: null,
      evidenceScanRequired: false,
    });

    expect(report).toMatchObject({
      status: "blocked",
      completed: false,
      blockers: 0,
      warnings: 1,
    });
    expect(report.checks.find((check) => check.id === "evidence_privacy")).toMatchObject({
      status: "warn",
      nextStep: "Run evidence scan before treating the pilot as complete or sharing evidence outside the implementation team.",
    });
    expect(pilotTrialCompletionPassed(report)).toBe(false);
  });
});

function completeCheckpointCoverage(): BetaPilotCheckpointCoverage[] {
  return [
    coverage("preflight", "verified", ["access_review"]),
    coverage("day_1", "verified", ["announcement_receipt"]),
    coverage("day_3", "verified", ["approval_flow", "smoke_test"]),
    coverage("day_7", "verified", ["payroll_rehearsal", "payslip_access"]),
    coverage("day_14", "verified", ["audit_export"]),
  ];
}

function coverage(
  checkpointId: BetaPilotCheckpointCoverage["checkpointId"],
  latestStatus: BetaPilotCheckpointCoverage["latestStatus"],
  evidenceTypes: BetaPilotCheckpointCoverage["evidenceTypes"],
): BetaPilotCheckpointCoverage {
  return {
    checkpointId,
    latestStatus,
    evidenceTypes,
    recordedCount: evidenceTypes.length,
    latestRecordedAt: new Date("2026-07-01T00:00:00.000Z"),
  };
}

function kpis(options: { failingIds?: string[]; watchIds?: string[] } = {}): HrOneKpi[] {
  const failingIds = new Set(options.failingIds ?? []);
  const watchIds = new Set(options.watchIds ?? []);
  return [
    "first_leave_success_time",
    "manager_leave_approval_time",
    "payroll_close_reduction",
    "attendance_exception_auto_resolution",
    "employee_mobile_task_completion",
    "hr_self_serve_form_creation",
    "audit_log_coverage",
    "unauthorized_payroll_access",
    "ai_answers_with_sources",
    "first_week_training_time",
  ].map((id) => ({
    id,
    name: id,
    target: "target",
    current: "current",
    status: failingIds.has(id) ? "failing" : watchIds.has(id) ? "watch" : "passing",
    owner: "HR Ops",
    nextStep: `${id} next step`,
  } satisfies HrOneKpi));
}

function evidenceScan(options: {
  status: PilotEvidenceScanReport["status"];
  findingCount?: number;
}): PilotEvidenceScanReport {
  const findingCount = options.findingCount ?? 0;
  return {
    status: options.status,
    scannedFileCount: 3,
    findingCount,
    categories: findingCount > 0 ? [{ category: "database_url", count: findingCount }] : [],
    findings: findingCount > 0
      ? [{ path: "/tmp/leaky.md", category: "database_url", count: findingCount }]
      : [],
  };
}
