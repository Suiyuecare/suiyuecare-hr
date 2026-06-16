import { describe, expect, it } from "vitest";
import {
  buildEnvironmentVerificationReport,
  environmentVerificationPassed,
} from "@/server/readiness/environment-verification";

const productionEnv = {
  HR_ONE_ENV: "production",
  DATABASE_URL: "postgresql://hrone:secret@db.customer.internal:5432/hrone?schema=hr_one",
  HR_ONE_APP_URL: "https://hr.customer.co",
  HR_ONE_DEPLOYMENT_TARGET: "vercel",
  VERCEL_PROJECT_ID: "prj_Ueh6m200Y21GRuTjXKWZxTWc6IQa",
  HR_ONE_DATABASE_PROVIDER: "supabase_postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://aruncclorusswpfnpgsn.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M",
  HR_ONE_SESSION_SECRET: "session-secret-with-at-least-32-characters",
  HR_ONE_ENCRYPTION_KEY: "encryption-key-with-at-least-32-chars",
  HR_ONE_AUDIT_LOG_SIGNING_KEY: "audit-log-signing-key-with-32-chars",
  HR_ONE_OBJECT_STORAGE_SECRET_REF: "vault://customer/hrone/storage",
  HR_ONE_AUTH_PROVIDER: "entra_id",
  HR_ONE_AUTH_SESSION_SOURCE: "oidc",
  HR_ONE_AUTH_ISSUER_URL: "https://login.customer.co/customer/v2.0",
  HR_ONE_AUTH_AUDIENCE: "hr-one-api",
  HR_ONE_AUTH_JWKS_URL: "https://login.customer.co/customer/keys",
  HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS: "3600",
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

describe("environment verification", () => {
  it("passes a production posture without exposing secret values", () => {
    const report = buildEnvironmentVerificationReport(
      productionEnv,
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(environmentVerificationPassed(report)).toBe(true);
    expect(report.checks.find((item) => item.name === "HR_ONE_SESSION_SECRET")).toMatchObject({
      passed: true,
      detail: "configured and not a weak placeholder",
    });
  });

  it("blocks demo/local placeholders in production", () => {
    const report = buildEnvironmentVerificationReport(
      {
        ...productionEnv,
        DATABASE_URL: "postgresql://hrone:hrone@localhost:5432/hrone",
        HR_ONE_APP_URL: "http://localhost:3000",
        HR_ONE_SESSION_SECRET: "change-me",
        HR_ONE_ENCRYPTION_KEY: "replace-with-at-least-32-random-characters",
      },
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(environmentVerificationPassed(report)).toBe(false);
    expect(report.checks.find((item) => item.name === "database url")).toMatchObject({ passed: false });
    expect(report.checks.find((item) => item.name === "public app url")).toMatchObject({ passed: false });
    expect(report.checks.find((item) => item.name === "HR_ONE_SESSION_SECRET")).toMatchObject({ passed: false });
    expect(report.checks.find((item) => item.name === "HR_ONE_ENCRYPTION_KEY")).toMatchObject({ passed: false });
  });

  it("requires Vercel and Supabase production bindings when selected", () => {
    const report = buildEnvironmentVerificationReport(
      {
        ...productionEnv,
        VERCEL_PROJECT_ID: "customer-project",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.com",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      },
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(report.checks.find((item) => item.name === "deployment target")).toMatchObject({
      passed: true,
      detail: "vercel configured",
    });
    expect(report.checks.find((item) => item.name === "Vercel project binding")).toMatchObject({
      passed: false,
      detail: "invalid VERCEL_PROJECT_ID",
    });
    expect(report.checks.find((item) => item.name === "database provider")).toMatchObject({
      passed: true,
      detail: "supabase_postgres configured",
    });
    expect(report.checks.find((item) => item.name === "database private schema")).toMatchObject({
      passed: true,
      detail: "schema=hr_one configured",
    });
    expect(report.checks.find((item) => item.name === "Supabase project url")).toMatchObject({
      passed: false,
      detail: "invalid NEXT_PUBLIC_SUPABASE_URL",
    });
    expect(report.checks.find((item) => item.name === "Supabase publishable key")).toMatchObject({
      passed: false,
      detail: "invalid NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    });
  });

  it("requires Supabase production URLs to target the HR One private schema", () => {
    const report = buildEnvironmentVerificationReport(
      {
        ...productionEnv,
        DATABASE_URL: "postgresql://hrone:secret@db.customer.internal:5432/hrone",
      },
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(environmentVerificationPassed(report)).toBe(false);
    expect(report.checks.find((item) => item.name === "database private schema")).toMatchObject({
      passed: false,
      detail: "set DATABASE_URL query parameter schema=hr_one",
    });
  });

  it("blocks demo auth posture and missing token verification settings in production", () => {
    const report = buildEnvironmentVerificationReport(
      {
        ...productionEnv,
        HR_ONE_AUTH_SESSION_SOURCE: "demo",
        HR_ONE_AUTH_AUDIENCE: "",
        HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS: "120",
      },
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(report.checks.find((item) => item.name === "auth session source")).toMatchObject({
      passed: false,
      detail: "set HR_ONE_AUTH_SESSION_SOURCE=oidc",
    });
    expect(report.checks.find((item) => item.name === "auth audience")).toMatchObject({
      passed: false,
      detail: "missing HR_ONE_AUTH_AUDIENCE",
    });
    expect(report.checks.find((item) => item.name === "auth token max age")).toMatchObject({
      passed: false,
      detail: "120 second(s) configured",
    });
  });

  it("blocks raw AI prompt storage and enabled AI without a vault reference", () => {
    const report = buildEnvironmentVerificationReport(
      {
        ...productionEnv,
        HR_ONE_AI_PROVIDER: "openai",
        HR_ONE_AI_PROMPT_STORAGE: "raw",
        HR_ONE_AI_SECRET_REF: "",
      },
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(report.checks.find((item) => item.name === "AI provider posture")).toMatchObject({ passed: false });
    expect(report.checks.find((item) => item.name === "AI prompt storage")).toMatchObject({ passed: false });
  });

  it("blocks missing or unsafe rate limit posture in production", () => {
    const report = buildEnvironmentVerificationReport(
      {
        ...productionEnv,
        HR_ONE_RATE_LIMIT_ENABLED: "false",
        HR_ONE_RATE_LIMIT_PROVIDER: "demo",
        HR_ONE_RATE_LIMIT_SECRET_REF: "",
        HR_ONE_RATE_LIMIT_WINDOW_SECONDS: "5",
        HR_ONE_RATE_LIMIT_MAX_REQUESTS: "20000",
      },
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(report.checks.find((item) => item.name === "app rate limiter")).toMatchObject({
      passed: false,
      detail: "HR_ONE_RATE_LIMIT_ENABLED=false is blocked for production",
    });
    expect(report.checks.find((item) => item.name === "rate limit provider")).toMatchObject({
      passed: false,
      detail: "demo configured",
    });
    expect(report.checks.find((item) => item.name === "HR_ONE_RATE_LIMIT_SECRET_REF")).toMatchObject({
      passed: false,
    });
    expect(report.checks.find((item) => item.name === "rate limit window")).toMatchObject({
      passed: false,
      detail: "5 second(s) configured",
    });
    expect(report.checks.find((item) => item.name === "rate limit ceiling")).toMatchObject({
      passed: false,
      detail: "20000 request(s) configured",
    });
  });

  it("requires endpoint and runtime token for the external HTTP rate limit provider", () => {
    const report = buildEnvironmentVerificationReport(
      {
        ...productionEnv,
        HR_ONE_RATE_LIMIT_PROVIDER: "external_http",
        HR_ONE_RATE_LIMIT_HTTP_ENDPOINT: "http://limits.example.com/check",
        HR_ONE_RATE_LIMIT_HTTP_TOKEN: "change-me",
      },
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(report.checks.find((item) => item.name === "rate limit provider")).toMatchObject({
      passed: true,
      detail: "external_http configured",
    });
    expect(report.checks.find((item) => item.name === "external rate limit endpoint")).toMatchObject({
      passed: false,
      detail: "invalid HR_ONE_RATE_LIMIT_HTTP_ENDPOINT",
    });
    expect(report.checks.find((item) => item.name === "external rate limit token")).toMatchObject({
      passed: false,
      detail: "invalid HR_ONE_RATE_LIMIT_HTTP_TOKEN",
    });
  });

  it("blocks missing backup posture and stale restore drills in production", () => {
    const report = buildEnvironmentVerificationReport(
      {
        ...productionEnv,
        HR_ONE_BACKUP_ENABLED: "false",
        HR_ONE_BACKUP_RETENTION_DAYS: "7",
        HR_ONE_BACKUP_ENCRYPTION_KEY_REF: "",
        HR_ONE_BACKUP_RESTORE_TESTED_AT: "2025-12-01",
      },
      "production",
      new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(report.checks.find((item) => item.name === "database backups")).toMatchObject({ passed: false });
    expect(report.checks.find((item) => item.name === "backup retention")).toMatchObject({
      passed: false,
      detail: "7 day(s) configured",
    });
    expect(report.checks.find((item) => item.name === "HR_ONE_BACKUP_ENCRYPTION_KEY_REF")).toMatchObject({
      passed: false,
    });
    expect(report.checks.find((item) => item.name === "restore drill evidence")).toMatchObject({
      passed: false,
      detail: "last restore drill 193 day(s) ago",
    });
  });
});
