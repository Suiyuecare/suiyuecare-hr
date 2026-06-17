import { describe, expect, it } from "vitest";
import type { BetaPilotCheckpointCoverage } from "@/server/readiness/beta-pilot-checkpoints";
import { buildPilotOperationsReport } from "@/server/readiness/pilot-operations";

describe("pilot operations report", () => {
  it("marks the two-week operation complete only when every required evidence type exists", () => {
    const report = buildPilotOperationsReport({
      coverage: completeCoverage(),
      trialDay: 14,
      generatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "complete",
      completedPhaseCount: 5,
      blockedPhaseCount: 0,
      totalRecordedEvidenceCount: 7,
    });
    expect(report.currentPhase).toBeNull();
    expect(report.todayGate).toMatchObject({
      trialDay: 14,
      scheduledCheckpointId: "day_14",
      focusCheckpointId: "day_14",
      status: "ready_to_continue",
      missingEvidenceTypes: [],
    });
    expect(report.nextActions).toHaveLength(0);
  });

  it("keeps day 7 in progress when payroll rehearsal exists but payslip access is missing", () => {
    const report = buildPilotOperationsReport({
      coverage: completeCoverage().map((phase) =>
        phase.checkpointId === "day_7"
          ? coverage("day_7", "in_progress", ["payroll_rehearsal"])
          : phase,
      ),
    });
    const day7 = report.phases.find((phase) => phase.checkpointId === "day_7");

    expect(report.status).toBe("in_progress");
    expect(day7).toMatchObject({
      status: "in_progress",
      missingEvidenceTypes: ["payslip_access"],
    });
    expect(report.nextActions).toContain(
      "完成 HR 月結預演，再由員工帳號查看本人薪資單，確認主管預設不能看部屬薪資。",
    );
  });

  it("focuses today's gate on the earliest incomplete checkpoint before the scheduled trial day", () => {
    const report = buildPilotOperationsReport({
      trialDay: 7,
      coverage: [
        coverage("preflight", "verified", ["access_review"]),
        coverage("day_1", "verified", ["announcement_receipt"]),
        coverage("day_3", "in_progress", ["smoke_test"]),
        coverage("day_7", "not_started", []),
        coverage("day_14", "not_started", []),
      ],
    });

    expect(report.todayGate).toMatchObject({
      trialDay: 7,
      scheduledCheckpointId: "day_7",
      focusCheckpointId: "day_3",
      status: "needs_evidence",
      missingEvidenceTypes: ["approval_flow"],
      actionHref: "/manager/inbox",
    });
    expect(report.todayGate.detail).toContain("前一個 checkpoint 尚未完成");
  });

  it("uses preflight as today's gate before a trial run is created", () => {
    const report = buildPilotOperationsReport({
      coverage: [],
      trialDay: null,
    });

    expect(report.todayGate).toMatchObject({
      trialDay: null,
      scheduledCheckpointId: "preflight",
      focusCheckpointId: "preflight",
      status: "needs_evidence",
      missingEvidenceTypes: ["access_review"],
    });
    expect(report.todayGate.detail).toContain("尚未建立試用批次");
    expect(report.todayGate.dailyTasks.map((task) => task.title)).toEqual([
      "確認邀請 Gate",
      "跑權限防漏",
      "決定是否發邀請",
    ]);
    expect(report.todayGate.dailyTasks[1]).toMatchObject({
      evidence: "access_review checkpoint",
      actionHref: "/settings/pilot-invite-readiness#preflight-access-review",
      tone: "warning",
    });
  });

  it("marks the operation in progress after preflight is complete", () => {
    const report = buildPilotOperationsReport({
      coverage: [
        coverage("preflight", "verified", ["access_review"]),
        coverage("day_1", "not_started", []),
        coverage("day_3", "not_started", []),
        coverage("day_7", "not_started", []),
        coverage("day_14", "not_started", []),
      ],
    });

    expect(report.status).toBe("in_progress");
    expect(report.currentPhase).toMatchObject({ checkpointId: "day_1" });
  });

  it("turns day 7 into a concrete payroll rehearsal and payslip access task board", () => {
    const report = buildPilotOperationsReport({
      trialDay: 7,
      coverage: [
        coverage("preflight", "verified", ["access_review"]),
        coverage("day_1", "verified", ["announcement_receipt"]),
        coverage("day_3", "verified", ["smoke_test", "approval_flow"]),
        coverage("day_7", "in_progress", ["payroll_rehearsal"]),
        coverage("day_14", "not_started", []),
      ],
    });

    expect(report.todayGate).toMatchObject({
      scheduledCheckpointId: "day_7",
      focusCheckpointId: "day_7",
      missingEvidenceTypes: ["payslip_access"],
    });
    expect(report.todayGate.dailyTasks.map((task) => task.title)).toEqual([
      "清出勤與待簽核",
      "跑 HR 月結預演",
      "驗證薪資單權限",
    ]);
    expect(report.todayGate.dailyTasks.map((task) => task.evidence)).toEqual([
      "出勤完整性摘要",
      "payroll_rehearsal checkpoint",
      "payslip_access checkpoint",
    ]);
  });

  it("surfaces blocked checkpoints before later phases", () => {
    const report = buildPilotOperationsReport({
      coverage: [
        coverage("preflight", "verified", ["access_review"]),
        coverage("day_1", "blocked", ["announcement_receipt"]),
        coverage("day_3", "not_started", []),
        coverage("day_7", "not_started", []),
        coverage("day_14", "not_started", []),
      ],
    });

    expect(report.status).toBe("blocked");
    expect(report.blockedPhaseCount).toBe(1);
    expect(report.currentPhase).toMatchObject({
      checkpointId: "day_1",
      status: "blocked",
    });
  });
});

function completeCoverage(): BetaPilotCheckpointCoverage[] {
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
    latestRecordedAt: evidenceTypes.length ? new Date("2026-07-01T00:00:00.000Z") : null,
  };
}
