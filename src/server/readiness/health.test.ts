import { describe, expect, it } from "vitest";
import { getLiveHealth, getReadyHealth, healthHttpStatus } from "@/server/readiness/health";

const productionEnv = {
  HR_ONE_ENV: "production",
  DATABASE_URL: "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one",
  HR_ONE_APP_URL: "https://hr.customer.co",
  HR_ONE_DEPLOYMENT_TARGET: "vercel",
  VERCEL_PROJECT_ID: "prj_Ueh6m200Y21GRuTjXKWZxTWc6IQa",
  HR_ONE_DATABASE_PROVIDER: "supabase_postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://aruncclorusswpfnpgsn.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M",
  HR_ONE_SESSION_SECRET: "session-secret-with-at-least-32-characters",
  HR_ONE_ENCRYPTION_KEY: "encryption-key-with-at-least-32-chars",
  HR_ONE_AUDIT_LOG_SIGNING_KEY: "audit-log-signing-key-with-32-chars",
  CRON_SECRET: "cron-secret-with-at-least-32-characters",
  HR_ONE_CRON_TENANT_ID: "tenant_suiyuecare_prod",
  HR_ONE_CRON_COMPANY_ID: "company_suiyuecare_prod",
  HR_ONE_OBJECT_STORAGE_PROVIDER: "s3",
  HR_ONE_OBJECT_STORAGE_BUCKET: "customer-hrone-documents",
  HR_ONE_OBJECT_STORAGE_SECRET_REF: "vault://customer/hrone/storage",
  HR_ONE_OBJECT_STORAGE_KMS_KEY_REF: "alias/customer-hrone-documents",
  HR_ONE_OBJECT_STORAGE_LIFECYCLE_POLICY_REF: "s3://customer-hrone-documents/lifecycle/hr-documents-7y",
  HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS: "600",
  HR_ONE_AUTH_PROVIDER: "entra_id",
  HR_ONE_AUTH_SESSION_SOURCE: "oidc",
  HR_ONE_AUTH_ISSUER_URL: "https://login.customer.co/customer/v2.0",
  HR_ONE_AUTH_LOGIN_URL: "https://login.customer.co/customer/oauth2/v2.0/authorize",
  HR_ONE_AUTH_AUDIENCE: "hr-one-api",
  HR_ONE_AUTH_JWKS_URL: "https://login.customer.co/customer/keys",
  HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS: "3600",
  HR_ONE_AUTH_TENANT_CONTEXT_SOURCE: "env_defaults",
  HR_ONE_AUTH_DEFAULT_TENANT: "tenant_suiyuecare_prod",
  HR_ONE_AUTH_DEFAULT_COMPANY: "company_suiyuecare_prod",
  HR_ONE_WEB_SESSION_MAX_AGE_SECONDS: "28800",
  HR_ONE_AI_PROVIDER: "disabled",
  HR_ONE_AI_PROMPT_STORAGE: "hashed",
  HR_ONE_RATE_LIMIT_PROVIDER: "vercel_firewall",
  HR_ONE_RATE_LIMIT_SECRET_REF: "vault://customer/hrone/rate-limit",
  HR_ONE_RATE_LIMIT_WINDOW_SECONDS: "60",
  HR_ONE_RATE_LIMIT_MAX_REQUESTS: "600",
  HR_ONE_BACKUP_ENABLED: "true",
  HR_ONE_BACKUP_RETENTION_DAYS: "35",
  HR_ONE_BACKUP_ENCRYPTION_KEY_REF: "vault://customer/hrone/backup-key",
  HR_ONE_BACKUP_RESTORE_TESTED_AT: "2026-05-20",
};

describe("health reports", () => {
  it("returns a safe liveness report", () => {
    const report = getLiveHealth({ now: new Date("2026-06-12T00:00:00.000Z") });

    expect(report).toEqual({
      status: "ok",
      service: "hr-one",
      timestamp: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "process",
          status: "ok",
          detail: "server process is running",
        },
      ],
    });
    expect(healthHttpStatus(report)).toBe(200);
  });

  it("keeps local readiness degraded but available without database", async () => {
    const report = await getReadyHealth({
      now: new Date("2026-06-12T00:00:00.000Z"),
      env: { HR_ONE_ENV: "local" },
    });

    expect(report.status).toBe("degraded");
    expect(healthHttpStatus(report)).toBe(200);
    expect(report.checks.find((check) => check.name === "database")).toMatchObject({
      status: "degraded",
      detail: "database not configured; demo fallback available",
    });
    expect(report.checks.find((check) => check.name === "demo auth")).toMatchObject({
      status: "ok",
      detail: "Demo auth is available for local development and smoke tests.",
    });
  });

  it("fails production readiness without exposing secret values", async () => {
    const report = await getReadyHealth({
      env: {
        ...productionEnv,
        DATABASE_URL: "postgresql://hrone:hrone@localhost:5432/hrone",
        HR_ONE_SESSION_SECRET: "change-me",
      },
      pingDatabase: async () => true,
    });

    expect(report.status).toBe("fail");
    expect(healthHttpStatus(report)).toBe(503);
    expect(JSON.stringify(report)).not.toContain("change-me");
    expect(JSON.stringify(report)).not.toContain("localhost:5432");
    expect(report.checks.find((check) => check.name === "environment")).toMatchObject({
      status: "fail",
      detail: "production environment verification failed",
    });
    expect(report.checks.find((check) => check.name === "demo auth")).toMatchObject({
      status: "ok",
      detail: "demo auth disabled for production runtime",
    });
  });

  it("passes production readiness when environment and database are available", async () => {
    const report = await getReadyHealth({
      env: productionEnv,
      now: new Date("2026-06-12T00:00:00.000Z"),
      pingDatabase: async () => true,
    });

    expect(report.status).toBe("ok");
    expect(healthHttpStatus(report)).toBe(200);
    expect(report.checks.find((check) => check.name === "demo auth")).toMatchObject({
      status: "ok",
      detail: "demo auth disabled for production runtime",
    });
  });

  it("returns a safe Supabase direct connection hint when production database ping fails", async () => {
    const report = await getReadyHealth({
      env: {
        ...productionEnv,
        DATABASE_URL: "postgresql://hrone:very-secret@db.aruncclorusswpfnpgsn.supabase.co:5432/postgres?schema=hr_one",
      },
      now: new Date("2026-06-12T00:00:00.000Z"),
      pingDatabase: async () => false,
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("very-secret");
    expect(serialized).not.toContain("aruncclorusswpfnpgsn");
    expect(report.checks.find((check) => check.name === "database")).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("Supabase direct database hosts require IPv6 or the IPv4 add-on"),
    });
  });

  it("returns a safe Supabase pooler hint when pooler database ping fails", async () => {
    const report = await getReadyHealth({
      env: {
        ...productionEnv,
        DATABASE_URL: "postgresql://postgres.project:very-secret@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one",
      },
      now: new Date("2026-06-12T00:00:00.000Z"),
      pingDatabase: async () => false,
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("very-secret");
    expect(serialized).not.toContain("aws-0-ap-northeast-2");
    expect(report.checks.find((check) => check.name === "database")).toMatchObject({
      status: "fail",
      detail: "database ping failed; verify Supabase pooler username, password, mode, schema, and prepared-statement settings.",
    });
  });
});
