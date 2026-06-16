import { describe, expect, it } from "vitest";
import { buildEnvironmentVerificationReport } from "@/server/readiness/environment-verification";
import {
  buildVercelProductionEnvDraft,
  draftHasUnresolvedPlaceholders,
  getUnresolvedEnvPlaceholderKeys,
} from "@/server/readiness/vercel-production-env-draft";
import { parseEnvFile } from "@/server/readiness/vercel-production-env";

describe("Vercel production env draft", () => {
  it("generates a gitignored production env draft with strong generated secrets", () => {
    let counter = 0;
    const text = buildVercelProductionEnvDraft({
      now: new Date("2026-06-17T00:00:00.000Z"),
      randomSecret: () => {
        counter += 1;
        return `generated-secret-${counter}-with-more-than-32-characters`;
      },
    });
    const env = parseEnvFile(text);

    expect(env).toMatchObject({
      HR_ONE_ENV: "production",
      HR_ONE_APP_URL: "https://hr.suiyuecare.com",
      VERCEL_PROJECT_ID: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
      HR_ONE_DATABASE_PROVIDER: "supabase_postgres",
      NEXT_PUBLIC_SUPABASE_URL: "https://aruncclorusswpfnpgsn.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M",
      DATABASE_URL: "REPLACE_WITH_SUPABASE_POSTGRES_URL_SCHEMA_HR_ONE",
      HR_ONE_BACKUP_RESTORE_TESTED_AT: "REPLACE_WITH_RESTORE_DRILL_DATE_AFTER_2026-06-17",
    });
    expect(env.HR_ONE_SESSION_SECRET).toContain("generated-secret-1");
    expect(env.HR_ONE_ENCRYPTION_KEY).toContain("generated-secret-2");
    expect(env.HR_ONE_AUDIT_LOG_SIGNING_KEY).toContain("generated-secret-3");
    expect(draftHasUnresolvedPlaceholders(text)).toBe(true);
    expect(getUnresolvedEnvPlaceholderKeys(env)).toEqual([
      "DATABASE_URL",
      "HR_ONE_AUTH_ISSUER_URL",
      "HR_ONE_AUTH_JWKS_URL",
      "HR_ONE_AUTH_PROVIDER",
      "HR_ONE_BACKUP_RESTORE_TESTED_AT",
    ]);
  });

  it("passes production env verification after real operator-only placeholders are supplied", () => {
    const text = buildVercelProductionEnvDraft({
      now: new Date("2026-06-17T00:00:00.000Z"),
      randomSecret: () => "generated-secret-with-more-than-32-characters",
    });
    const env = {
      ...parseEnvFile(text),
      DATABASE_URL: "postgresql://hrone:secret@db.suiyuecare.internal:5432/postgres?schema=hr_one",
      HR_ONE_AUTH_PROVIDER: "entra_id",
      HR_ONE_AUTH_ISSUER_URL: "https://login.suiyuecare.com/hr-one/v2.0",
      HR_ONE_AUTH_JWKS_URL: "https://login.suiyuecare.com/hr-one/keys",
      HR_ONE_BACKUP_RESTORE_TESTED_AT: "2026-06-16",
    };
    const report = buildEnvironmentVerificationReport(env, "production", new Date("2026-06-17T00:00:00.000Z"));

    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
  });
});
