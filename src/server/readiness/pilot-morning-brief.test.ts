import { describe, expect, it } from "vitest";
import type { PilotDailyStatusReport } from "@/server/readiness/pilot-daily-status";
import {
  buildPilotMorningBriefReport,
  formatPilotMorningBriefMarkdown,
  pilotMorningBriefPassed,
} from "@/server/readiness/pilot-morning-brief";

describe("pilot morning brief", () => {
  it("blocks the morning brief and redacts sensitive details from actions and evidence", () => {
    const report = buildPilotMorningBriefReport({
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
      dailyStatus: dailyStatusReport({
        status: "blocked",
        requiredItems: [
          {
            id: "production_foundation",
            title: "production foundation",
            status: "blocked",
            evidence: "database failed: postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
            nextStep: "Contact owner@example.com and fix DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone",
          },
          {
            id: "sensitive_data_guardrails",
            title: "sensitive guardrails",
            status: "ready",
            evidence: "salary: 90000 should not be printed",
            nextStep: "身分證字號：A123456789 should not be printed",
          },
        ],
        nextActions: [
          "薪資：90000; 銀行帳號：123456789012; token Bearer abcdefghijklmnopqrstuvwxyz",
        ],
      }),
    });
    const markdown = formatPilotMorningBriefMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(pilotMorningBriefPassed(report)).toBe(false);
    expect(markdown).toContain("Status: blocked");
    expect(markdown).toContain("[REDACTED]");
    expect(markdown).toContain("[REDACTED_EMAIL]");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
    expect(markdown).not.toContain("owner@example.com");
    expect(markdown).not.toContain("90000");
    expect(markdown).not.toContain("123456789012");
    expect(markdown).not.toContain("A123456789");
    expect(markdown).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("summarizes production evidence gaps without failing closed as a blocker", () => {
    const report = buildPilotMorningBriefReport({
      dailyStatus: dailyStatusReport({
        status: "needs_production_evidence",
        requiredItems: [
          {
            id: "clock_in_out",
            title: "clock in/out",
            status: "rehearsed",
            evidence: "demo rehearsal only",
            nextStep: "Capture one production clock-in evidence hash.",
          },
          {
            id: "announcement",
            title: "announcement",
            status: "ready",
            evidence: "production receipt count recorded",
            nextStep: "Keep monitoring receipts.",
          },
        ],
      }),
    });

    expect(report).toMatchObject({
      status: "needs_evidence",
      blockerCount: 0,
      evidenceGapCount: 1,
      readyCount: 1,
    });
    expect(report.nextActions).toContain(
      "Capture production tenant evidence for the gap(s), using hash-only refs and aggregate counts.",
    );
    expect(pilotMorningBriefPassed(report)).toBe(false);
  });

  it("passes when today's daily status is ready", () => {
    const report = buildPilotMorningBriefReport({
      dailyStatus: dailyStatusReport({
        status: "ready_for_today",
        requiredItems: [
          {
            id: "clock_in_out",
            title: "clock in/out",
            status: "ready",
            evidence: "production aggregate count recorded",
            nextStep: "Keep monitoring.",
          },
        ],
      }),
    });

    expect(report.status).toBe("ready_for_today");
    expect(report.blockerCount).toBe(0);
    expect(report.evidenceGapCount).toBe(0);
    expect(pilotMorningBriefPassed(report)).toBe(true);
  });
});

function dailyStatusReport(options: {
  status: PilotDailyStatusReport["status"];
  requiredItems: PilotDailyStatusReport["requiredItems"];
  nextActions?: string[];
}): PilotDailyStatusReport {
  return {
    status: options.status,
    generatedAt: "2026-06-17T00:00:00.000Z",
    day: 3,
    phaseId: "day_3",
    phaseTitle: "Day 3 leave and approval stabilization",
    phaseGoal: "Employees submit leave and managers approve from one Inbox while exceptions stay visible.",
    requiredItems: options.requiredItems,
    blockedCount: options.requiredItems.filter((item) => item.status === "blocked").length,
    rehearsedCount: options.requiredItems.filter((item) => item.status === "rehearsed").length,
    readyCount: options.requiredItems.filter((item) => item.status === "ready").length,
    nextActions: options.nextActions ?? [],
    privacyGuardrails: [
      "Do not paste salary amounts, bank accounts, national IDs, health data, database URLs, or private HR notes.",
    ],
  };
}
