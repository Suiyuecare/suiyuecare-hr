import { describe, expect, it } from "vitest";
import {
  buildProductionDatabaseEnvDraftReport,
  buildProductionDatabaseRemediationReport,
  formatProductionDatabaseRemediationMarkdown,
  getProductionDatabaseRemediationReport,
} from "@/server/readiness/production-database-remediation";
import type { HealthReport } from "@/server/readiness/health";

const directHostFailureHealth: HealthReport = {
  status: "fail",
  service: "hr-one",
  timestamp: "2026-06-17T07:45:12.330Z",
  checks: [
    {
      name: "environment",
      status: "fail",
      detail: "production environment verification failed",
    },
    {
      name: "database",
      status: "fail",
      detail: "database ping failed; Supabase direct database hosts require IPv6 or the IPv4 add-on, so Vercel/serverless deployments should use a compatible pooler URL or enable IPv4.",
    },
    {
      name: "demo auth",
      status: "ok",
      detail: "demo auth disabled for production runtime",
    },
  ],
};

const readyHealth: HealthReport = {
  status: "ok",
  service: "hr-one",
  timestamp: "2026-06-17T08:00:00.000Z",
  checks: [
    {
      name: "environment",
      status: "ok",
      detail: "production environment posture verified",
    },
    {
      name: "database",
      status: "ok",
      detail: "database ping succeeded",
    },
    {
      name: "demo auth",
      status: "ok",
      detail: "demo auth disabled for production runtime",
    },
  ],
};

describe("production database remediation", () => {
  it("adds local production env draft diagnostics without leaking database secrets", () => {
    const envDraft = buildProductionDatabaseEnvDraftReport(
      {
        ...validProductionEnv(),
        DATABASE_URL: "postgresql://hrone_runtime:top-secret-password@db.aruncclorusswpfnpgsn.supabase.co:5432/postgres?schema=hr_one",
      },
      {
        source: ".env.vercel.production",
        now: new Date("2026-06-17T08:00:00.000Z"),
      },
    );
    const report = buildProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: directHostFailureHealth,
      fetchedHealthStatusCode: 503,
      envDraft,
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
    });

    expect(envDraft.status).toBe("blocked");
    expect(envDraft.databaseConnectionPosture).toBe("supabase-direct");
    expect(envDraft.databaseUrlShape).toBe("Supabase direct host");
    expect(envDraft.failedCheckNames).toContain("Supabase Vercel database network");
    expect(report.nextActions.join("\n")).toContain("IPv4");
    expect(report.supabasePooler).toMatchObject({
      projectRef: "aruncclorusswpfnpgsn",
      region: "ap-northeast-2",
      username: "postgres.aruncclorusswpfnpgsn",
      host: "aws-0-ap-northeast-2.pooler.supabase.com",
      requiredQueryParams: ["pgbouncer=true", "connection_limit=1", "schema=hr_one"],
    });

    const markdown = formatProductionDatabaseRemediationMarkdown(report);
    expect(markdown).toContain("## Local Env Draft");
    expect(markdown).toContain("Database shape: Supabase direct host");
    expect(markdown).toContain("## Supabase Transaction Pooler Shape");
    expect(markdown).toContain("Host: aws-0-ap-northeast-2.pooler.supabase.com");
    expect(markdown).toContain("Username: postgres.aruncclorusswpfnpgsn");
    expect(markdown).toContain("Required params: pgbouncer=true, connection_limit=1, schema=hr_one");

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("top-secret-password");
    expect(serialized).not.toContain("hrone_runtime");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("top-secret-password");
    expect(markdown).not.toContain("hrone_runtime");
  });

  it("reports unresolved local env placeholders by key name only", () => {
    const envDraft = buildProductionDatabaseEnvDraftReport(
      {
        ...validProductionEnv(),
        DATABASE_URL: "REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE",
      },
      {
        source: ".env.vercel.production",
        now: new Date("2026-06-17T08:00:00.000Z"),
      },
    );

    expect(envDraft.status).toBe("blocked");
    expect(envDraft.unresolvedPlaceholderKeys).toEqual(["DATABASE_URL"]);
    expect(envDraft.databaseUrlShape).toBe("unresolved database URL placeholder");
    expect(envDraft.nextActions.join("\n")).toContain("DATABASE_URL");

    const serialized = JSON.stringify(envDraft);
    expect(serialized).not.toContain("REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE");
    expect(serialized).not.toContain("DATABASE_URL=");
    expect(serialized).not.toContain("postgresql://");
  });

  it("marks a transaction-pooler env draft ready without exposing the URL", () => {
    const envDraft = buildProductionDatabaseEnvDraftReport(
      {
        ...validProductionEnv(),
        DATABASE_URL: "postgresql://postgres.aruncclorusswpfnpgsn:pooler-secret-value@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one",
      },
      {
        source: ".env.vercel.production",
        now: new Date("2026-06-17T08:00:00.000Z"),
      },
    );

    expect(envDraft.status).toBe("ready");
    expect(envDraft.databaseConnectionPosture).toBe("supabase-pooler-transaction");
    expect(envDraft.databaseUrlShape).toBe("Supabase transaction pooler with Prisma pooler params");
    expect(envDraft.failedCheckNames).toEqual([]);

    const serialized = JSON.stringify(envDraft);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("pooler-secret-value");
    expect(serialized).not.toContain("postgres.aruncclorusswpfnpgsn");
  });

  it("attaches redacted current runtime env diagnostics by default", async () => {
    const report = await getProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
      runtimeEnv: {
        ...validProductionEnv(),
        DATABASE_URL: "postgresql://postgres.aruncclorusswpfnpgsn:runtime-secret@aws-0-us-west-1.pooler.supabase.com:6543/postgres?schema=hr_one",
      },
      fetcher: async () =>
        new Response(JSON.stringify(directHostFailureHealth), {
          status: 503,
          headers: {
            "content-type": "application/json",
          },
        }),
    });

    expect(report.envDraft).toMatchObject({
      status: "blocked",
      source: "current server runtime env (redacted)",
      databaseConnectionPosture: "supabase-pooler-transaction",
      databaseUrlShape: "Supabase transaction pooler missing Prisma pooler params",
    });
    expect(report.envDraft?.nextActions.join("\n")).toContain("pgbouncer=true");

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("runtime-secret");
  });

  it("classifies the live Supabase direct-host blocker and keeps remediation output redacted", () => {
    const report = buildProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: directHostFailureHealth,
      fetchedHealthStatusCode: 503,
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
    });

    expect(report.status).toBe("blocked");
    expect(report.rootCause).toBe("supabase_direct_network");
    expect(report.summary).toContain("Vercel/serverless");
    expect(report.tracks.find((track) => track.id === "transaction_pooler")).toMatchObject({
      recommended: true,
    });
    expect(report.nextActions.join("\n")).toContain("transaction pooler");

    const markdown = formatProductionDatabaseRemediationMarkdown(report);
    expect(markdown).toContain("Status: blocked");
    expect(markdown).toContain("Root cause: supabase_direct_network");
    expect(markdown).toContain("Supabase Transaction Pooler");

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("DATABASE_URL=");
    expect(serialized).not.toContain("salary: 60000");
    expect(serialized).not.toContain("bank account");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("DATABASE_URL=");
    expect(markdown).not.toContain("salary: 60000");
  });

  it("marks the gate ready only when production health and database checks are ok", () => {
    const report = buildProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: readyHealth,
      fetchedHealthStatusCode: 200,
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
    });

    expect(report.status).toBe("ready");
    expect(report.rootCause).toBe("ready");
    expect(report.gate.status).toBe("ready");
    expect(report.nextActions[0]).toContain("Production database gate 已通過");
  });

  it("fails closed when live readiness cannot be fetched", async () => {
    const report = await getProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
      fetcher: async () => {
        throw new Error("network unavailable");
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.rootCause).toBe("health_unreachable");
    expect(report.nextActions.join("\n")).toContain("/api/health/ready");
  });
});

function validProductionEnv() {
  return {
    HR_ONE_ENV: "production",
    HR_ONE_APP_URL: "https://hr.suiyuecare.com",
    HR_ONE_DEPLOYMENT_TARGET: "vercel",
    VERCEL_PROJECT_ID: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
    HR_ONE_DATABASE_PROVIDER: "supabase_postgres",
    NEXT_PUBLIC_SUPABASE_URL: "https://aruncclorusswpfnpgsn.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M",
    HR_ONE_SESSION_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    HR_ONE_ENCRYPTION_KEY: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    HR_ONE_AUDIT_LOG_SIGNING_KEY: "cccccccccccccccccccccccccccccccccccccccc",
    HR_ONE_OBJECT_STORAGE_SECRET_REF: "vault://suiyuecare/hr-one/storage",
    HR_ONE_AUTH_PROVIDER: "supabase_auth",
    HR_ONE_AUTH_SESSION_SOURCE: "oidc",
    HR_ONE_AUTH_ISSUER_URL: "https://aruncclorusswpfnpgsn.supabase.co/auth/v1",
    HR_ONE_AUTH_LOGIN_URL: "https://hr.suiyuecare.com/auth/sign-in",
    HR_ONE_AUTH_AUDIENCE: "authenticated",
    HR_ONE_AUTH_JWKS_URL: "https://aruncclorusswpfnpgsn.supabase.co/auth/v1/.well-known/jwks.json",
    HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS: "3600",
    HR_ONE_AI_PROVIDER: "disabled",
    HR_ONE_AI_PROMPT_STORAGE: "hashed",
    HR_ONE_RATE_LIMIT_ENABLED: "true",
    HR_ONE_RATE_LIMIT_PROVIDER: "vercel_firewall",
    HR_ONE_RATE_LIMIT_SECRET_REF: "vault://suiyuecare/hr-one/rate-limit",
    HR_ONE_RATE_LIMIT_WINDOW_SECONDS: "60",
    HR_ONE_RATE_LIMIT_MAX_REQUESTS: "600",
    HR_ONE_BACKUP_ENABLED: "true",
    HR_ONE_BACKUP_RETENTION_DAYS: "35",
    HR_ONE_BACKUP_ENCRYPTION_KEY_REF: "vault://suiyuecare/hr-one/backup-key",
    HR_ONE_BACKUP_RESTORE_TESTED_AT: "2026-06-17",
  };
}
