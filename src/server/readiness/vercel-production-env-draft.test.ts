import { describe, expect, it } from "vitest";
import { buildEnvironmentVerificationReport } from "@/server/readiness/environment-verification";
import {
  buildVercelProductionEnvDraft,
  draftHasUnresolvedPlaceholders,
  getUnresolvedEnvPlaceholderKeys,
  refreshVercelProductionEnvDraftKnownValues,
  setVercelProductionDatabaseUrl,
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
      HR_ONE_SUPABASE_REGION: "ap-northeast-2",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M",
      DATABASE_URL: "REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE",
      HR_ONE_AUTH_PROVIDER: "supabase_auth",
      HR_ONE_AUTH_ISSUER_URL: "https://aruncclorusswpfnpgsn.supabase.co/auth/v1",
      HR_ONE_AUTH_LOGIN_URL: "https://hr.suiyuecare.com/auth/sign-in",
      HR_ONE_AUTH_AUDIENCE: "authenticated",
      HR_ONE_AUTH_JWKS_URL: "https://aruncclorusswpfnpgsn.supabase.co/auth/v1/.well-known/jwks.json",
      HR_ONE_AUTH_TENANT_CONTEXT_SOURCE: "env_defaults",
      HR_ONE_WEB_SESSION_MAX_AGE_SECONDS: "28800",
      HR_ONE_AUTH_DEFAULT_TENANT: "tenant_suiyuecare_pilot",
      HR_ONE_AUTH_DEFAULT_COMPANY: "company_suiyuecare_pilot",
      HR_ONE_BACKUP_RESTORE_TESTED_AT: "REPLACE_WITH_RESTORE_DRILL_DATE_AFTER_2026-06-17",
    });
    expect(env.HR_ONE_SESSION_SECRET).toContain("generated-secret-1");
    expect(env.HR_ONE_ENCRYPTION_KEY).toContain("generated-secret-2");
    expect(env.HR_ONE_AUDIT_LOG_SIGNING_KEY).toContain("generated-secret-3");
    expect(draftHasUnresolvedPlaceholders(text)).toBe(true);
    expect(getUnresolvedEnvPlaceholderKeys(env)).toEqual([
      "DATABASE_URL",
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
      DATABASE_URL: "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one",
      HR_ONE_AUTH_PROVIDER: "entra_id",
      HR_ONE_AUTH_ISSUER_URL: "https://login.suiyuecare.com/hr-one/v2.0",
      HR_ONE_AUTH_LOGIN_URL: "https://login.suiyuecare.com/hr-one/oauth2/v2.0/authorize",
      HR_ONE_AUTH_JWKS_URL: "https://login.suiyuecare.com/hr-one/keys",
      HR_ONE_AUTH_TENANT_CONTEXT_SOURCE: "env_defaults",
      HR_ONE_AUTH_DEFAULT_TENANT: "customer-a",
      HR_ONE_AUTH_DEFAULT_COMPANY: "company-1",
      HR_ONE_BACKUP_RESTORE_TESTED_AT: "2026-06-16",
    };
    const report = buildEnvironmentVerificationReport(env, "production", new Date("2026-06-17T00:00:00.000Z"));

    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
  });

  it("refreshes known non-secret values without touching operator-managed values or generated secrets", () => {
    const existing = [
      "DATABASE_URL=\"REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE\"",
      "HR_ONE_SESSION_SECRET=\"keep-this-session-secret-with-more-than-32-characters\"",
      "HR_ONE_ENCRYPTION_KEY=\"keep-this-encryption-secret-with-more-than-32-characters\"",
      "HR_ONE_AUDIT_LOG_SIGNING_KEY=\"keep-this-audit-secret-with-more-than-32-characters\"",
      "HR_ONE_AUTH_PROVIDER=\"custom_oidc\"",
      "HR_ONE_AUTH_ISSUER_URL=\"not-a-url\"",
      "HR_ONE_AUTH_LOGIN_URL=\"not-a-url\"",
      "HR_ONE_AUTH_JWKS_URL=\"not-a-url\"",
      "HR_ONE_BACKUP_RESTORE_TESTED_AT=\"REPLACE_WITH_RESTORE_DRILL_DATE_AFTER_2026-06-17\"",
      "",
    ].join("\n");
    const refreshed = refreshVercelProductionEnvDraftKnownValues(existing, {
      now: new Date("2026-06-17T00:00:00.000Z"),
    });
    const env = parseEnvFile(refreshed.text);

    expect(refreshed.changedKeys).toEqual([
      "HR_ONE_AUTH_ISSUER_URL",
      "HR_ONE_AUTH_JWKS_URL",
      "HR_ONE_AUTH_LOGIN_URL",
      "HR_ONE_AUTH_PROVIDER",
    ]);
    expect(env).toMatchObject({
      DATABASE_URL: "REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE",
      HR_ONE_SESSION_SECRET: "keep-this-session-secret-with-more-than-32-characters",
      HR_ONE_ENCRYPTION_KEY: "keep-this-encryption-secret-with-more-than-32-characters",
      HR_ONE_AUDIT_LOG_SIGNING_KEY: "keep-this-audit-secret-with-more-than-32-characters",
      HR_ONE_AUTH_PROVIDER: "supabase_auth",
      HR_ONE_AUTH_ISSUER_URL: "https://aruncclorusswpfnpgsn.supabase.co/auth/v1",
      HR_ONE_AUTH_LOGIN_URL: "https://hr.suiyuecare.com/auth/sign-in",
      HR_ONE_AUTH_JWKS_URL: "https://aruncclorusswpfnpgsn.supabase.co/auth/v1/.well-known/jwks.json",
      HR_ONE_BACKUP_RESTORE_TESTED_AT: "REPLACE_WITH_RESTORE_DRILL_DATE_AFTER_2026-06-17",
    });
  });

  it("updates restore drill evidence only when an explicit tested date is provided", () => {
    const existing = [
      "DATABASE_URL=\"REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE\"",
      "HR_ONE_BACKUP_RESTORE_TESTED_AT=\"REPLACE_WITH_RESTORE_DRILL_DATE_AFTER_2026-06-17\"",
      "",
    ].join("\n");
    const untouched = refreshVercelProductionEnvDraftKnownValues(existing, {
      now: new Date("2026-06-17T00:00:00.000Z"),
    });
    const refreshed = refreshVercelProductionEnvDraftKnownValues(existing, {
      now: new Date("2026-06-17T00:00:00.000Z"),
      restoreDrillTestedAt: "2026-06-17",
    });

    expect(parseEnvFile(untouched.text)).toMatchObject({
      HR_ONE_BACKUP_RESTORE_TESTED_AT: "REPLACE_WITH_RESTORE_DRILL_DATE_AFTER_2026-06-17",
    });
    expect(refreshed.changedKeys).toContain("HR_ONE_BACKUP_RESTORE_TESTED_AT");
    expect(parseEnvFile(refreshed.text)).toMatchObject({
      DATABASE_URL: "REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE",
      HR_ONE_BACKUP_RESTORE_TESTED_AT: "2026-06-17",
    });
  });

  it("sets a validated Supabase transaction pooler DATABASE_URL without changing secrets", () => {
    const existing = [
      "DATABASE_URL=\"REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE\"",
      "HR_ONE_SESSION_SECRET=\"keep-this-session-secret-with-more-than-32-characters\"",
      "",
    ].join("\n");
    const databaseUrl = "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one";
    const updated = setVercelProductionDatabaseUrl(existing, databaseUrl);
    const env = parseEnvFile(updated.text);

    expect(updated.connectionPosture).toBe("supabase-pooler-transaction");
    expect(updated.changedKeys).toEqual(["DATABASE_URL"]);
    expect(updated.appendedKeys).toEqual([]);
    expect(env).toMatchObject({
      DATABASE_URL: databaseUrl,
      HR_ONE_SESSION_SECRET: "keep-this-session-secret-with-more-than-32-characters",
    });
  });

  it("rejects session pooler and direct host URLs without IPv4 attestation", () => {
    const existing = "DATABASE_URL=\"REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE\"\n";

    expect(() =>
      setVercelProductionDatabaseUrl(
        existing,
        "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?schema=hr_one",
      ),
    ).toThrow(/transaction pooler port 6543/);
    expect(() =>
      setVercelProductionDatabaseUrl(
        existing,
        "postgresql://postgres:secret@db.aruncclorusswpfnpgsn.supabase.co:5432/postgres?schema=hr_one",
      ),
    ).toThrow(/requires --supabase-ipv4-addon-enabled/);
  });

  it("allows direct Supabase DATABASE_URL only with explicit IPv4 add-on attestation", () => {
    const existing = "DATABASE_URL=\"REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE\"\n";
    const databaseUrl = "postgresql://postgres:secret@db.aruncclorusswpfnpgsn.supabase.co:5432/postgres?schema=hr_one";
    const updated = setVercelProductionDatabaseUrl(existing, databaseUrl, {
      supabaseIpv4AddonEnabled: true,
    });
    const env = parseEnvFile(updated.text);

    expect(updated.connectionPosture).toBe("supabase-direct");
    expect(updated.changedKeys).toEqual(["DATABASE_URL"]);
    expect(updated.appendedKeys).toEqual(["HR_ONE_SUPABASE_IPV4_ADDON_ENABLED"]);
    expect(env).toMatchObject({
      DATABASE_URL: databaseUrl,
      HR_ONE_SUPABASE_IPV4_ADDON_ENABLED: "true",
    });
  });
});
