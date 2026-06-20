import { describe, expect, it } from "vitest";
import {
  buildVercelDatabaseUrlHandoffReport,
  formatVercelDatabaseUrlHandoffMarkdown,
} from "@/server/readiness/vercel-database-url-handoff";
import { buildVercelProductionEnvDraft } from "@/server/readiness/vercel-production-env-draft";

describe("vercel database URL handoff", () => {
  it("builds a ready redacted handoff for a Supabase transaction pooler URL", () => {
    const baseEnvText = buildReadyBaseEnvText();
    const databaseUrl = "postgresql://postgres.aruncclorusswpfnpgsn:pooler-secret-value@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one";
    const report = buildVercelDatabaseUrlHandoffReport({
      baseEnvText,
      databaseUrl,
      envFileSource: ".env.vercel.production",
      projectId: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
      teamId: "team_LGag47eU8tKbsK6ixAmVa5Uq",
      now: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "ready",
      connectionPosture: "supabase-pooler-transaction",
      databaseUrlShape: "Supabase transaction pooler with Prisma pooler params",
      changedKeys: ["DATABASE_URL"],
      appendedKeys: [],
      envDraftStatus: "ready",
      failedCheckNames: [],
      unresolvedPlaceholderKeys: [],
    });
    expect(report.vercelItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "DATABASE_URL", type: "sensitive" }),
        expect.objectContaining({ key: "HR_ONE_ENV", type: "encrypted" }),
      ]),
    );
    expect(report.nextActions.join("\n")).toContain("vercel:apply-production-env");

    const markdown = formatVercelDatabaseUrlHandoffMarkdown(report);
    expect(markdown).toContain("Status: ready");
    expect(markdown).toContain("DATABASE_URL: sensitive");

    for (const content of [JSON.stringify(report), markdown]) {
      expect(content).not.toContain("postgresql://");
      expect(content).not.toContain("postgres.aruncclorusswpfnpgsn");
      expect(content).not.toContain("pooler-secret-value");
    }
  });

  it("blocks and redacts when the pooler URL is missing Prisma parameters", () => {
    const baseEnvText = buildReadyBaseEnvText();

    expect(() =>
      buildVercelDatabaseUrlHandoffReport({
        baseEnvText,
        databaseUrl: "postgresql://postgres.aruncclorusswpfnpgsn:pooler-secret-value@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?schema=hr_one",
        envFileSource: ".env.vercel.production",
        projectId: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
        teamId: "team_LGag47eU8tKbsK6ixAmVa5Uq",
      }),
    ).toThrow(/pgbouncer=true and connection_limit=1/);
  });
});

function buildReadyBaseEnvText() {
  return buildVercelProductionEnvDraft({
    now: new Date("2026-06-17T00:00:00.000Z"),
    randomSecret: () => "generated-secret-with-more-than-32-characters",
  }).replace(
    "REPLACE_WITH_RESTORE_DRILL_DATE_AFTER_2026-06-17",
    "2026-06-17",
  );
}
