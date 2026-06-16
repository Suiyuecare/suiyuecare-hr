import { describe, expect, it } from "vitest";
import type { PilotAcceptanceItem, PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import {
  buildPilotDailyStatusReport,
  formatPilotDailyStatusMarkdown,
  pilotDailyStatusPassed,
} from "@/server/readiness/pilot-daily-status";

describe("pilot daily status", () => {
  it("blocks preflight when production foundation is not ready and redacts sensitive details", () => {
    const report = buildPilotDailyStatusReport({
      day: 0,
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
      acceptance: acceptanceReport({
        readyToStart: false,
        itemStatuses: {
          production_foundation: "blocked",
          real_company_cohort: "ready",
          sensitive_data_guardrails: "ready",
        },
        evidenceById: {
          production_foundation: "database failed: postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
        },
        nextActions: ["Fix DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone?schema=hr_one in Vercel."],
      }),
    });
    const markdown = formatPilotDailyStatusMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(pilotDailyStatusPassed(report)).toBe(false);
    expect(markdown).toContain("Status: blocked");
    expect(markdown).toContain("[REDACTED]");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
  });

  it("requires production evidence for day 1 when workflows are only rehearsed", () => {
    const report = buildPilotDailyStatusReport({
      day: 1,
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
      acceptance: acceptanceReport({
        readyToStart: true,
        itemStatuses: {
          production_foundation: "ready",
          real_company_cohort: "ready",
          clock_in_out: "rehearsed",
          announcement: "rehearsed",
          sensitive_data_guardrails: "ready",
        },
      }),
    });

    expect(report).toMatchObject({
      status: "needs_production_evidence",
      day: 1,
      phaseId: "day_1",
      readyCount: 3,
      rehearsedCount: 2,
      blockedCount: 0,
    });
    expect(report.nextActions).toContain(
      "Capture production tenant evidence for every rehearsed item before closing today's pilot checkpoint.",
    );
    expect(pilotDailyStatusPassed(report)).toBe(false);
  });

  it("keeps day 1 next actions focused on day 1 instead of day 14 closure", () => {
    const report = buildPilotDailyStatusReport({
      day: 1,
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
      acceptance: acceptanceReport({
        readyToStart: false,
        itemStatuses: {
          production_foundation: "blocked",
          two_week_completion: "blocked",
        },
        nextActions: [
          "production_foundation next step",
          "two_week_completion next step",
          "Fix the production PostgreSQL connection.",
        ],
      }),
    });

    expect(report.nextActions).toContain("production_foundation next step");
    expect(report.nextActions).toContain("Fix the production PostgreSQL connection.");
    expect(report.nextActions).not.toContain("two_week_completion next step");
  });

  it("passes day 14 only when the acceptance report is complete", () => {
    const report = buildPilotDailyStatusReport({
      day: 14,
      generatedAt: new Date("2026-06-30T00:00:00.000Z"),
      acceptance: acceptanceReport({
        readyToStart: true,
        complete: true,
        itemStatuses: Object.fromEntries(allItemIds.map((id) => [id, "ready"])),
      }),
    });

    expect(report.status).toBe("complete");
    expect(report.phaseId).toBe("day_14");
    expect(report.blockedCount).toBe(0);
    expect(pilotDailyStatusPassed(report)).toBe(true);
  });

  it("rejects days outside the 0-14 trial window", () => {
    expect(() => buildPilotDailyStatusReport({
      day: 15,
      acceptance: acceptanceReport({ readyToStart: true }),
    })).toThrow(/between 0 and 14/);
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
  evidenceById?: Partial<Record<PilotAcceptanceItem["id"], string>>;
  nextActions?: string[];
}): PilotAcceptanceReport {
  const items = allItemIds.map((id) => {
    const status = options.itemStatuses?.[id] ?? (id === "two_week_completion" ? "blocked" : "ready");
    return {
      id,
      title: titleForId(id),
      status,
      evidence: options.evidenceById?.[id] ?? `${id} evidence`,
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

function titleForId(id: PilotAcceptanceItem["id"]) {
  return id.split("_").join(" ");
}
