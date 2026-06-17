import { describe, expect, it } from "vitest";
import {
  buildPilotInvitationReleaseReport,
  formatPilotInvitationReleaseMarkdown,
  pilotInvitationReleasePassed,
} from "@/server/readiness/pilot-invitation-release";

describe("pilot invitation release", () => {
  it("releases invitations only when database, go/no-go, invite readiness, and privacy checks pass", () => {
    const report = buildPilotInvitationReleaseReport({
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
      productionDatabaseReport: {
        path: "/tmp/hr-one-production-database-gate.md",
        content: productionDatabaseMarkdown("ready", "ready", "ready"),
      },
      goNoGoReport: {
        path: "/tmp/hr-one-pilot-go-no-go.md",
        content: goNoGoMarkdown("ready_to_start", 0, 0, "PASS"),
      },
      inviteReadinessReport: {
        path: "/tmp/hr-one-pilot-invite-readiness.md",
        content: inviteReadinessMarkdown("ready", 0, 0),
      },
    });

    expect(report).toMatchObject({
      status: "released",
      blockers: 0,
    });
    expect(report.evidenceHashes).toHaveLength(3);
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass"]);
    expect(pilotInvitationReleasePassed(report)).toBe(true);
    expect(formatPilotInvitationReleaseMarkdown(report)).toContain("Status: released");
  });

  it("blocks missing or non-ready reports before employee invitations", () => {
    const report = buildPilotInvitationReleaseReport({
      productionDatabaseReport: {
        path: "/tmp/hr-one-production-database-gate.md",
        content: productionDatabaseMarkdown("blocked", "supabase_direct_network", "blocked"),
      },
      goNoGoReport: {
        path: "/tmp/hr-one-pilot-go-no-go.md",
        content: goNoGoMarkdown("blocked", 1, 0, "BLOCK"),
      },
      inviteReadinessReport: {
        path: "/tmp/hr-one-pilot-invite-readiness.md",
        content: inviteReadinessMarkdown("action_required", 0, 1),
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toBe(3);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "Fix the production database gate, rerun pnpm pilot:production-database, and attach the new redacted report.",
        "Fix every Go/No-Go blocker or warning and rerun pnpm pilot:go-no-go before invitations.",
        "Fix invite readiness blockers or warnings and rerun pnpm pilot:invite-readiness.",
      ]),
    );
    expect(pilotInvitationReleasePassed(report)).toBe(false);
  });

  it("blocks release evidence leaks without echoing sensitive values", () => {
    const report = buildPilotInvitationReleaseReport({
      productionDatabaseReport: {
        path: "/tmp/hr-one-production-database-gate.md",
        content: productionDatabaseMarkdown("ready", "ready", "ready"),
      },
      goNoGoReport: {
        path: "/tmp/hr-one-pilot-go-no-go.md",
        content: [
          goNoGoMarkdown("ready_to_start", 0, 0, "PASS"),
          "DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
          "薪資: 56000",
          "銀行帳號: 1234567890",
          "身分證字號: A123456789",
        ].join("\n"),
      },
      inviteReadinessReport: {
        path: "/tmp/hr-one-pilot-invite-readiness.md",
        content: inviteReadinessMarkdown("ready", 0, 0),
      },
    });
    const markdown = formatPilotInvitationReleaseMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "evidence_privacy")).toMatchObject({
      status: "block",
    });
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
    expect(markdown).not.toContain("薪資: 56000");
    expect(markdown).not.toContain("1234567890");
    expect(markdown).not.toContain("A123456789");
  });

  it("accepts JSON reports from CLI --json output", () => {
    const report = buildPilotInvitationReleaseReport({
      productionDatabaseReport: {
        path: "production.json",
        content: JSON.stringify({
          status: "ready",
          rootCause: "ready",
          envDraft: { status: "ready" },
        }),
      },
      goNoGoReport: {
        path: "go-no-go.json",
        content: JSON.stringify({
          status: "ready_to_start",
          blockers: 0,
          warnings: 0,
          checks: [{ id: "production_database", status: "pass" }],
        }),
      },
      inviteReadinessReport: {
        path: "invite.json",
        content: JSON.stringify({
          status: "ready",
          blockers: 0,
          warnings: 0,
        }),
      },
    });

    expect(report.status).toBe("released");
    expect(pilotInvitationReleasePassed(report)).toBe(true);
  });
});

function productionDatabaseMarkdown(status: string, rootCause: string, envDraftStatus: string) {
  return [
    "# HR One Production Database Gate",
    "",
    `Status: ${status}`,
    `Root cause: ${rootCause}`,
    "",
    "## Local Env Draft",
    "",
    `- Status: ${envDraftStatus}`,
    "- Source: .env.vercel.production",
    "",
  ].join("\n");
}

function goNoGoMarkdown(status: string, blockers: number, warnings: number, databaseCheck: "PASS" | "BLOCK") {
  return [
    "# HR One Pilot Go/No-Go",
    "",
    `Status: ${status}`,
    `Result: ${blockers} blocker(s), ${warnings} warning(s)`,
    "",
    "## Checks",
    "",
    `- [${databaseCheck}] Production database gate`,
    "",
  ].join("\n");
}

function inviteReadinessMarkdown(status: string, blockers: number, warnings: number) {
  return [
    "# HR One Pilot Invite Readiness",
    "",
    `Status: ${status}`,
    `Result: ${blockers} blocker(s), ${warnings} warning(s)`,
    "",
  ].join("\n");
}
