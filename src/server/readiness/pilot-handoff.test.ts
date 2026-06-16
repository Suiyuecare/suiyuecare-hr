import { describe, expect, it } from "vitest";
import type { PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import { formatPilotHandoffMarkdown } from "@/server/readiness/pilot-handoff";

const report: PilotAcceptanceReport = {
  status: "blocked",
  completionStatus: "incomplete",
  checkedAt: "2026-06-17T00:00:00.000Z",
  readyToStart: false,
  complete: false,
  readyCount: 0,
  rehearsedCount: 1,
  blockedCount: 2,
  items: [
    {
      id: "production_foundation",
      title: "Production deployment, database, and env are ready",
      status: "blocked",
      evidence: "database ping failed: postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
      nextStep: "Set DATABASE_URL with ?schema=hr_one.",
    },
    {
      id: "clock_in_out",
      title: "Employees can clock in and clock out",
      status: "rehearsed",
      evidence: "demo rehearsal covered attendance",
      nextStep: "Run production mobile punch.",
    },
    {
      id: "two_week_completion",
      title: "Day 14 final review closes the two-week trial",
      status: "blocked",
      evidence: "final review status is not_run",
      nextStep: "Run day 14 final review.",
    },
  ],
  nextActions: [
    "Use DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone?schema=hr_one only in Vercel secret storage.",
  ],
};

describe("pilot handoff markdown", () => {
  it("formats a redacted operator handoff without leaking secrets", () => {
    const markdown = formatPilotHandoffMarkdown(report, {
      generatedAt: new Date("2026-06-17T01:00:00.000Z"),
    });

    expect(markdown).toContain("# HR One 2-Week Pilot Handoff");
    expect(markdown).toContain("Pilot start status: blocked");
    expect(markdown).toContain("## Blockers");
    expect(markdown).toContain("Production deployment, database, and env are ready");
    expect(markdown).toContain("Synthetic Supabase seed data is rehearsal evidence only");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
    expect(markdown).toContain("[REDACTED]");
  });
});
