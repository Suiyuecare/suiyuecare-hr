import { describe, expect, it } from "vitest";
import type { BetaPilotCheckpointCoverage } from "@/server/readiness/beta-pilot-checkpoints";
import type { PilotAcceptanceItem, PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import {
  buildPilotWorkflowReadinessReport,
  formatPilotWorkflowReadinessMarkdown,
  pilotWorkflowReadinessPassed,
} from "@/server/readiness/pilot-workflow-readiness";

describe("pilot workflow readiness", () => {
  it("passes when every core workflow has verified production checkpoint evidence", () => {
    const report = buildPilotWorkflowReadinessReport({
      acceptance: acceptanceReport({ defaultStatus: "ready" }),
      checkpoints: completeCheckpointCoverage(),
      requireProductionEvidence: true,
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "production_ready",
      productionReadyCount: 7,
      rehearsedOnlyCount: 0,
      blockedCount: 0,
    });
    expect(report.items.every((item) => item.status === "production_ready")).toBe(true);
    expect(pilotWorkflowReadinessPassed(report)).toBe(true);
  });

  it("allows rehearsed-only workflows before production evidence is required", () => {
    const report = buildPilotWorkflowReadinessReport({
      acceptance: acceptanceReport({ defaultStatus: "rehearsed" }),
      checkpoints: emptyCheckpointCoverage(),
      requireProductionEvidence: false,
    });

    expect(report).toMatchObject({
      status: "needs_production_evidence",
      productionReadyCount: 0,
      rehearsedOnlyCount: 7,
      blockedCount: 0,
    });
    expect(report.nextActions).toEqual(expect.arrayContaining([
      "請一位真實 pilot 員工完成手機打卡，並在 checkpoint 留 hash-only 證據。",
      "發布真實 pilot 公告並確認員工回條彙總證據。",
      "由 owner/HR 完成 production tenant 權限防漏 access review。",
    ]));
    expect(pilotWorkflowReadinessPassed(report)).toBe(true);
  });

  it("blocks rehearsed-only workflows when production evidence is required", () => {
    const report = buildPilotWorkflowReadinessReport({
      acceptance: acceptanceReport({ defaultStatus: "rehearsed" }),
      checkpoints: emptyCheckpointCoverage(),
      requireProductionEvidence: true,
    });

    expect(report).toMatchObject({
      status: "blocked",
      productionReadyCount: 0,
      rehearsedOnlyCount: 7,
      blockedCount: 0,
    });
    expect(report.nextActions).toEqual(expect.arrayContaining([
      "請一位真實 pilot 員工完成手機打卡，並在 checkpoint 留 hash-only 證據。",
      "HR 在 pilot tenant 跑月結預演並保留 hash-only 證據。",
      "釋出 pilot 薪資單並驗證員工只能看自己的薪資單。",
    ]));
    expect(pilotWorkflowReadinessPassed(report)).toBe(false);
  });

  it("blocks missing rehearsal and redacts sensitive evidence in markdown", () => {
    const report = buildPilotWorkflowReadinessReport({
      acceptance: acceptanceReport({
        defaultStatus: "blocked",
        evidenceById: {
          clock_in_out: "employee email owner@example.com; DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone",
          payslip_view: "薪資: 56000; 身分證字號:A123456789; 銀行帳號:123456789012",
        },
      }),
      checkpoints: emptyCheckpointCoverage(),
    });
    const markdown = formatPilotWorkflowReadinessMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(report.blockedCount).toBe(7);
    expect(markdown).toContain("[REDACTED]");
    expect(markdown).toContain("[REDACTED_EMAIL]");
    expect(markdown).not.toContain("owner@example.com");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
    expect(markdown).not.toContain("56000");
    expect(markdown).not.toContain("A123456789");
    expect(markdown).not.toContain("123456789012");
    expect(pilotWorkflowReadinessPassed(report)).toBe(false);
  });
});

const workflowItemIds = [
  "clock_in_out",
  "leave_request",
  "manager_approval",
  "announcement",
  "payroll_rehearsal",
  "payslip_view",
  "sensitive_data_guardrails",
] as const satisfies ReadonlyArray<PilotAcceptanceItem["id"]>;

function acceptanceReport(options: {
  defaultStatus: PilotAcceptanceItem["status"];
  evidenceById?: Partial<Record<PilotAcceptanceItem["id"], string>>;
}): PilotAcceptanceReport {
  const items = workflowItemIds.map((id) => ({
    id,
    title: id,
    status: options.defaultStatus,
    evidence: options.evidenceById?.[id] ?? `${id} evidence`,
    nextStep: `${id} next step`,
  } satisfies PilotAcceptanceItem));
  return {
    status: options.defaultStatus === "blocked" ? "blocked" : "ready_to_start",
    completionStatus: "incomplete",
    checkedAt: "2026-06-17T00:00:00.000Z",
    readyToStart: options.defaultStatus !== "blocked",
    complete: false,
    readyCount: items.filter((item) => item.status === "ready").length,
    rehearsedCount: items.filter((item) => item.status === "rehearsed").length,
    blockedCount: items.filter((item) => item.status === "blocked").length,
    items,
    nextActions: [],
  };
}

function completeCheckpointCoverage(): BetaPilotCheckpointCoverage[] {
  return [
    coverage("preflight", "verified", ["access_review"]),
    coverage("day_1", "verified", ["announcement_receipt"]),
    coverage("day_3", "verified", ["approval_flow", "smoke_test"]),
    coverage("day_7", "verified", ["payroll_rehearsal", "payslip_access"]),
    coverage("day_14", "not_started", []),
  ];
}

function emptyCheckpointCoverage(): BetaPilotCheckpointCoverage[] {
  return [
    coverage("preflight", "not_started", []),
    coverage("day_1", "not_started", []),
    coverage("day_3", "not_started", []),
    coverage("day_7", "not_started", []),
    coverage("day_14", "not_started", []),
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
    latestRecordedAt: evidenceTypes.length ? new Date("2026-06-17T00:00:00.000Z") : null,
  };
}
