import { describe, expect, it } from "vitest";
import {
  buildVercelCliEnvCommand,
  buildVercelKnownProductionEnvPlan,
  buildVercelProductionEnvPlan,
  isSensitiveVercelEnvKey,
  parseEnvFile,
  summarizeVercelKnownProductionEnvPlan,
  summarizeVercelProductionEnvPlan,
} from "@/server/readiness/vercel-production-env";
import { buildVercelProductionEnvDraft } from "@/server/readiness/vercel-production-env-draft";

const productionEnv = {
  HR_ONE_ENV: "production",
  DATABASE_URL: "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one",
  HR_ONE_APP_URL: "https://hr.suiyuecare.com",
  HR_ONE_DEPLOYMENT_TARGET: "vercel",
  VERCEL_PROJECT_ID: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
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

describe("Vercel production env bootstrap", () => {
  it("parses dotenv-style files without leaking comments into values", () => {
    expect(parseEnvFile([
      "# comment",
      "HR_ONE_ENV=production",
      "DATABASE_URL=\"postgresql://user:pass@host/db?schema=hr_one\"",
      "HR_ONE_BACKUP_ENABLED=true # inline note",
    ].join("\n"))).toEqual({
      HR_ONE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host/db?schema=hr_one",
      HR_ONE_BACKUP_ENABLED: "true",
    });
  });

  it("classifies secrets and browser-safe values for Vercel", () => {
    expect(isSensitiveVercelEnvKey("DATABASE_URL")).toBe(true);
    expect(isSensitiveVercelEnvKey("HR_ONE_SESSION_SECRET")).toBe(true);
    expect(isSensitiveVercelEnvKey("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")).toBe(false);
    expect(isSensitiveVercelEnvKey("HR_ONE_ENV")).toBe(false);
  });

  it("builds CLI env add commands without putting secret values in argv", () => {
    const command = buildVercelCliEnvCommand({
      key: "DATABASE_URL",
      value: "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one",
      type: "sensitive",
      target: ["production"],
      comment: "test",
    });

    expect(command.command).toBe("pnpm");
    expect(command.args).toEqual([
      "dlx",
      "vercel@latest",
      "env",
      "add",
      "DATABASE_URL",
      "production",
      "--sensitive",
      "--force",
      "--yes",
    ]);
    expect(command.stdin).toContain("secret@aws-0-ap-northeast-1.pooler.supabase.com");
    expect(command.redactedCommand).not.toContain("secret@aws-0-ap-northeast-1.pooler.supabase.com");
    expect(command.redactedCommand).toContain("<value via stdin>");
  });

  it("builds a production apply plan only after the production verifier passes", () => {
    const plan = buildVercelProductionEnvPlan({
      env: productionEnv,
      projectId: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
      teamId: "team_LGag47eU8tKbsK6ixAmVa5Uq",
      now: new Date("2026-06-16T00:00:00.000Z"),
    });

    expect(plan.passed).toBe(true);
    expect(plan.items.find((item) => item.key === "DATABASE_URL")).toMatchObject({
      type: "sensitive",
      target: ["production"],
    });
    expect(summarizeVercelProductionEnvPlan(plan)).toContain("verification=passed");
  });

  it("fails the plan when DATABASE_URL is missing the private schema", () => {
    const plan = buildVercelProductionEnvPlan({
      env: {
        ...productionEnv,
        DATABASE_URL: "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1",
      },
      projectId: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
      teamId: "team_LGag47eU8tKbsK6ixAmVa5Uq",
      now: new Date("2026-06-16T00:00:00.000Z"),
    });

    expect(plan.passed).toBe(false);
    expect(plan.checks.find((item) => item.name === "database private schema")).toMatchObject({
      passed: false,
      detail: "set DATABASE_URL query parameter schema=hr_one",
    });
  });

  it("builds a partial known-env bootstrap plan while deferring operator-managed values", () => {
    const draft = buildVercelProductionEnvDraft({
      now: new Date("2026-06-17T00:00:00.000Z"),
      randomSecret: () => "generated-secret-with-more-than-32-characters",
    });
    const plan = buildVercelKnownProductionEnvPlan({
      env: parseEnvFile(draft),
      projectId: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
      teamId: "team_LGag47eU8tKbsK6ixAmVa5Uq",
    });
    const keys = plan.items.map((item) => item.key);
    const summary = summarizeVercelKnownProductionEnvPlan(plan);

    expect(keys).toContain("HR_ONE_ENV");
    expect(keys).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(keys).toContain("HR_ONE_AUTH_ISSUER_URL");
    expect(keys).toContain("HR_ONE_AUTH_LOGIN_URL");
    expect(keys).toContain("HR_ONE_AUTH_TENANT_CONTEXT_SOURCE");
    expect(keys).toContain("HR_ONE_WEB_SESSION_MAX_AGE_SECONDS");
    expect(keys).toContain("HR_ONE_SESSION_SECRET");
    expect(keys).toContain("CRON_SECRET");
    expect(keys).toContain("HR_ONE_CRON_TENANT_ID");
    expect(keys).toContain("HR_ONE_CRON_COMPANY_ID");
    expect(keys).toContain("HR_ONE_OBJECT_STORAGE_PROVIDER");
    expect(keys).toContain("HR_ONE_OBJECT_STORAGE_BUCKET");
    expect(keys).toContain("HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS");
    expect(keys).not.toContain("DATABASE_URL");
    expect(keys).not.toContain("HR_ONE_OBJECT_STORAGE_SECRET_REF");
    expect(plan.skippedPlaceholderKeys).toEqual([
      "DATABASE_URL",
      "HR_ONE_BACKUP_RESTORE_TESTED_AT",
    ]);
    expect(plan.operatorManagedKeys).toEqual([
      "HR_ONE_BACKUP_ENCRYPTION_KEY_REF",
      "HR_ONE_OBJECT_STORAGE_KMS_KEY_REF",
      "HR_ONE_OBJECT_STORAGE_LIFECYCLE_POLICY_REF",
      "HR_ONE_OBJECT_STORAGE_SECRET_REF",
      "HR_ONE_RATE_LIMIT_SECRET_REF",
    ]);
    expect(summary).toContain("37 bootstrap variable(s): 4 sensitive, 33 encrypted");
  });

  it("does not include generated secret values in known-env command text", () => {
    const plan = buildVercelKnownProductionEnvPlan({
      env: {
        HR_ONE_SESSION_SECRET: "generated-secret-with-more-than-32-characters",
      },
      projectId: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
      teamId: "team_LGag47eU8tKbsK6ixAmVa5Uq",
    });
    const command = buildVercelCliEnvCommand(plan.items[0]!);

    expect(command.stdin).toContain("generated-secret");
    expect(command.redactedCommand).not.toContain("generated-secret");
    expect(command.redactedCommand).toContain("<value via stdin>");
  });

  it("can limit known-env bootstrap to missing inventory keys without rotating unrelated secrets", () => {
    const plan = buildVercelKnownProductionEnvPlan({
      env: productionEnv,
      projectId: "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N",
      teamId: "team_LGag47eU8tKbsK6ixAmVa5Uq",
      onlyKeys: [
        "CRON_SECRET",
        "HR_ONE_CRON_TENANT_ID",
        "HR_ONE_OBJECT_STORAGE_KMS_KEY_REF",
        "DATABASE_URL",
        "HR_ONE_WEB_SESSION_MAX_AGE_SECONDS",
      ],
    });
    const keys = plan.items.map((item) => item.key);
    const summary = summarizeVercelKnownProductionEnvPlan(plan);

    expect(keys).toEqual([
      "CRON_SECRET",
      "HR_ONE_CRON_TENANT_ID",
      "HR_ONE_WEB_SESSION_MAX_AGE_SECONDS",
    ]);
    expect(keys).not.toContain("HR_ONE_SESSION_SECRET");
    expect(keys).not.toContain("DATABASE_URL");
    expect(keys).not.toContain("HR_ONE_OBJECT_STORAGE_KMS_KEY_REF");
    expect(plan.requestedKeys).toEqual([
      "CRON_SECRET",
      "DATABASE_URL",
      "HR_ONE_CRON_TENANT_ID",
      "HR_ONE_OBJECT_STORAGE_KMS_KEY_REF",
      "HR_ONE_WEB_SESSION_MAX_AGE_SECONDS",
    ]);
    expect(plan.omittedRequestedKeys).toEqual([
      "DATABASE_URL",
      "HR_ONE_OBJECT_STORAGE_KMS_KEY_REF",
    ]);
    expect(summary.join("\n")).toContain("requested key filter: CRON_SECRET, DATABASE_URL");
    expect(JSON.stringify(plan)).not.toContain("secret@aws-0-ap-northeast-1.pooler.supabase.com");
  });
});
