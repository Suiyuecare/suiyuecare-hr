import { describe, expect, it } from "vitest";
import {
  buildPilotEvidenceFolderReport,
  formatPilotEvidenceFolderMarkdown,
  pilotEvidenceFolderPassed,
  type PilotEvidenceFolderInputFile,
} from "@/server/readiness/pilot-evidence-folder";

describe("pilot evidence folder gate", () => {
  it("passes only when every required redacted trial artifact is present and ready", () => {
    const report = buildPilotEvidenceFolderReport({
      generatedAt: new Date("2026-07-01T00:00:00.000Z"),
      files: completeEvidenceFiles(),
    });

    expect(report).toMatchObject({
      status: "ready",
      readyToShare: true,
      blockers: 0,
      privacyScan: {
        status: "pass",
        findingCount: 0,
      },
    });
    expect(report.artifacts).toHaveLength(11);
    expect(report.artifacts.every((artifact) => artifact.status === "pass")).toBe(true);
    expect(report.evidenceHashes).toHaveLength(11);
    expect(pilotEvidenceFolderPassed(report)).toBe(true);
    expect(formatPilotEvidenceFolderMarkdown(report)).toContain("Status: ready");
  });

  it("blocks missing reports and non-final Day 14 evidence", () => {
    const files = completeEvidenceFiles()
      .filter((file) => !file.path.endsWith("day-7.md"))
      .map((file) =>
        file.path.endsWith("day-14.md")
          ? evidenceFile("day-14.md", dailyStatus(14, "ready_for_today"))
          : file,
      );
    const report = buildPilotEvidenceFolderReport({ files });

    expect(report.status).toBe("blocked");
    expect(report.readyToShare).toBe(false);
    expect(report.artifacts.find((artifact) => artifact.id === "day_7_status")).toMatchObject({
      status: "block",
      path: null,
    });
    expect(report.artifacts.find((artifact) => artifact.id === "day_14_status")).toMatchObject({
      status: "block",
    });
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "Run pnpm pilot:daily-status -- --day=7 after payroll rehearsal and payslip self-view evidence is recorded.",
        "Run pnpm pilot:daily-status -- --day=14 --final-review=verified after final review is verified.",
      ]),
    );
    expect(pilotEvidenceFolderPassed(report)).toBe(false);
  });

  it("blocks sensitive evidence leaks without echoing matched values", () => {
    const files = completeEvidenceFiles().map((file) =>
      file.path.endsWith("audit-evidence.md")
        ? evidenceFile(
            "audit-evidence.md",
            [
              "# Audit evidence package",
              "Warnings: 0",
              "DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone",
              "薪資: 56000",
              "銀行帳號: 1234567890",
              "身分證字號: A123456789",
            ].join("\n"),
          )
        : file,
    );
    const report = buildPilotEvidenceFolderReport({ files });
    const markdown = formatPilotEvidenceFolderMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(report.privacyScan).toMatchObject({
      status: "block",
    });
    expect(report.nextActions).toContain(
      "Remove sensitive values from the pilot evidence folder and rerun pnpm pilot:evidence-package.",
    );
    expect(markdown).toContain("Privacy Scan");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
    expect(markdown).not.toContain("薪資: 56000");
    expect(markdown).not.toContain("1234567890");
    expect(markdown).not.toContain("A123456789");
  });

  it("blocks raw CSV attachments even when scanner patterns do not match their values", () => {
    const report = buildPilotEvidenceFolderReport({
      files: [
        ...completeEvidenceFiles(),
        evidenceFile("employee-import.csv", "employeeNo,legalName,workEmail\nE001,王小明,person@example.com"),
      ],
    });

    expect(report.status).toBe("blocked");
    expect(report.privacyScan).toMatchObject({
      status: "block",
      csvFileCount: 1,
      findingCount: 0,
    });
    expect(report.nextActions).toContain(
      "Remove raw CSV files from the evidence folder; keep completed employee, identity, and payroll CSV files only in approved secure storage.",
    );
    expect(pilotEvidenceFolderPassed(report)).toBe(false);
  });

  it("accepts JSON report artifacts produced by CLI --json output", () => {
    const files = [
      evidenceFile("hr-one-production-database-gate.md", JSON.stringify({
        status: "ready",
        rootCause: "ready",
        envDraft: { status: "ready" },
      })),
      evidenceFile("go-no-go.md", JSON.stringify({
        status: "ready_to_start",
        blockers: 0,
        warnings: 0,
      })),
      evidenceFile("invitation-release.md", JSON.stringify({
        status: "released",
        blockers: 0,
      })),
      evidenceFile("day-0.md", JSON.stringify({ day: 0, status: "ready_for_today" })),
      evidenceFile("day-1.md", JSON.stringify({ day: 1, status: "ready_for_today" })),
      evidenceFile("day-3.md", JSON.stringify({ day: 3, status: "ready_for_today" })),
      evidenceFile("day-7.md", JSON.stringify({ day: 7, status: "ready_for_today" })),
      evidenceFile("day-14.md", JSON.stringify({ day: 14, status: "complete" })),
      evidenceFile("completion.md", JSON.stringify({
        status: "completed",
        blockers: 0,
        warnings: 0,
      })),
      evidenceFile("audit-evidence.md", JSON.stringify({
        packageCount: 1,
        warnings: 0,
      })),
      evidenceFile("handoff.md", JSON.stringify({
        readyToStart: true,
        complete: true,
      })),
    ];
    const report = buildPilotEvidenceFolderReport({ files });

    expect(report.status).toBe("ready");
    expect(pilotEvidenceFolderPassed(report)).toBe(true);
  });
});

function completeEvidenceFiles(): PilotEvidenceFolderInputFile[] {
  return [
    evidenceFile("hr-one-production-database-gate.md", productionDatabase()),
    evidenceFile("go-no-go.md", goNoGo()),
    evidenceFile("invitation-release.md", invitationRelease()),
    evidenceFile("day-0.md", dailyStatus(0, "ready_for_today")),
    evidenceFile("day-1.md", dailyStatus(1, "ready_for_today")),
    evidenceFile("day-3.md", dailyStatus(3, "ready_for_today")),
    evidenceFile("day-7.md", dailyStatus(7, "ready_for_today")),
    evidenceFile("day-14.md", dailyStatus(14, "complete")),
    evidenceFile("completion.md", trialCompletion()),
    evidenceFile("audit-evidence.md", auditEvidence()),
    evidenceFile("handoff.md", handoff()),
  ];
}

function evidenceFile(path: string, content: string): PilotEvidenceFolderInputFile {
  return {
    path: `/tmp/hr-one-pilot-evidence/${path}`,
    content,
  };
}

function productionDatabase() {
  return [
    "# HR One Production Database Gate",
    "",
    "Status: ready",
    "Root cause: ready",
    "",
    "## Local Env Draft",
    "",
    "- Status: ready",
  ].join("\n");
}

function goNoGo() {
  return [
    "# HR One Pilot Go/No-Go",
    "",
    "Status: ready_to_start",
    "Result: 0 blocker(s), 0 warning(s)",
  ].join("\n");
}

function invitationRelease() {
  return [
    "# HR One Pilot Invitation Release",
    "",
    "Status: released",
    "Result: 0 blocker(s)",
  ].join("\n");
}

function dailyStatus(day: number, status: string) {
  return [
    "# HR One Pilot Daily Status",
    "",
    `Trial day: ${day}`,
    `Status: ${status}`,
  ].join("\n");
}

function trialCompletion() {
  return [
    "# HR One Pilot Trial Completion Review",
    "",
    "Status: completed",
    "Result: 0 blocker(s), 0 warning(s)",
  ].join("\n");
}

function auditEvidence() {
  return [
    "# Audit evidence package",
    "",
    "Warnings: 0",
    "Coverage: employee, attendance, leave, approval, announcement, payroll, payslip, settings",
  ].join("\n");
}

function handoff() {
  return [
    "# HR One 2-Week Pilot Handoff",
    "",
    "## Status",
    "",
    "- Ready to start: yes",
    "- Complete: yes",
  ].join("\n");
}
