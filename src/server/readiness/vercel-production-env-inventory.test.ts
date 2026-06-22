import { describe, expect, it } from "vitest";
import {
  buildVercelProductionEnvInventoryReport,
  formatVercelProductionEnvInventoryMarkdown,
} from "@/server/readiness/vercel-production-env-inventory";

describe("Vercel production env inventory", () => {
  it("passes when all required keys are present on production with safe metadata types", () => {
    const report = buildVercelProductionEnvInventoryReport(
      {
        envs: completeInventoryPayload(),
      },
      {
        generatedAt: new Date("2026-06-18T08:00:00.000Z"),
        command: "pnpm dlx vercel@latest env ls production --format json --scope team_LGag47eU8tKbsK6ixAmVa5Uq",
      },
    );

    expect(report.status).toBe("ready");
    expect(report.missingKeys).toEqual([]);
    expect(report.wrongTargetKeys).toEqual([]);
    expect(report.unsafeTypeKeys).toEqual([]);
    expect(report.presentRequiredCount).toBe(report.requiredKeyCount);
    expect(report.groups.find((group) => group.id === "database_connection")).toMatchObject({
      status: "ready",
      missingKeys: [],
    });
  });

  it("blocks missing, wrong-target, and unsafe sensitive env keys without storing values", () => {
    const payload = completeInventoryPayload()
      .filter((entry) => entry.key !== "CRON_SECRET")
      .map((entry) => {
        if (entry.key === "HR_ONE_APP_URL") return { ...entry, target: ["preview"] };
        if (entry.key === "DATABASE_URL") {
          return {
            ...entry,
            type: "encrypted",
            value: "postgresql://hrone:secret@db.example.com/postgres?schema=hr_one",
          };
        }
        return entry;
      });
    const report = buildVercelProductionEnvInventoryReport(
      { envs: payload },
      {
        generatedAt: new Date("2026-06-18T08:00:00.000Z"),
      },
    );
    const markdown = formatVercelProductionEnvInventoryMarkdown(report);
    const serialized = JSON.stringify(report);

    expect(report.status).toBe("blocked");
    expect(report.missingKeys).toContain("CRON_SECRET");
    expect(report.wrongTargetKeys).toContain("HR_ONE_APP_URL");
    expect(report.unsafeTypeKeys).toContain("DATABASE_URL");
    expect(report.nextActions.join("\n")).toContain("After fixing env key inventory");
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("secret@db.example.com");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
  });

  it("returns an explicit not-checked report before inventory is attached", () => {
    const report = buildVercelProductionEnvInventoryReport(null, {
      generatedAt: new Date("2026-06-18T08:00:00.000Z"),
    });

    expect(report.status).toBe("not_checked");
    expect(report.totalKeyCount).toBe(0);
    expect(report.groups.every((group) => group.status === "not_checked")).toBe(true);
    expect(report.nextActions.join("\n")).toContain("env ls production");
  });
});

function completeInventoryPayload() {
  return requiredKeys().map((key) => ({
    key,
    type: sensitiveKeys().has(key) ? "sensitive" : "encrypted",
    target: ["production"],
    createdAt: "2026-06-18T07:00:00.000Z",
    updatedAt: 1781756400000,
  }));
}

function requiredKeys() {
  return [
    "HR_ONE_ENV",
    "HR_ONE_APP_URL",
    "HR_ONE_DEPLOYMENT_TARGET",
    "VERCEL_PROJECT_ID",
    "HR_ONE_DATABASE_PROVIDER",
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "HR_ONE_SESSION_SECRET",
    "HR_ONE_ENCRYPTION_KEY",
    "HR_ONE_AUDIT_LOG_SIGNING_KEY",
    "CRON_SECRET",
    "HR_ONE_CRON_TENANT_ID",
    "HR_ONE_CRON_COMPANY_ID",
    "HR_ONE_OBJECT_STORAGE_PROVIDER",
    "HR_ONE_OBJECT_STORAGE_BUCKET",
    "HR_ONE_OBJECT_STORAGE_SECRET_REF",
    "HR_ONE_OBJECT_STORAGE_KMS_KEY_REF",
    "HR_ONE_OBJECT_STORAGE_LIFECYCLE_POLICY_REF",
    "HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS",
    "HR_ONE_AUTH_PROVIDER",
    "HR_ONE_AUTH_SESSION_SOURCE",
    "HR_ONE_AUTH_ISSUER_URL",
    "HR_ONE_AUTH_LOGIN_URL",
    "HR_ONE_AUTH_AUDIENCE",
    "HR_ONE_AUTH_JWKS_URL",
    "HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS",
    "HR_ONE_AUTH_TENANT_CONTEXT_SOURCE",
    "HR_ONE_AUTH_DEFAULT_TENANT",
    "HR_ONE_AUTH_DEFAULT_COMPANY",
    "HR_ONE_WEB_SESSION_MAX_AGE_SECONDS",
    "HR_ONE_AI_PROVIDER",
    "HR_ONE_AI_PROMPT_STORAGE",
    "HR_ONE_RATE_LIMIT_ENABLED",
    "HR_ONE_RATE_LIMIT_PROVIDER",
    "HR_ONE_RATE_LIMIT_SECRET_REF",
    "HR_ONE_RATE_LIMIT_WINDOW_SECONDS",
    "HR_ONE_RATE_LIMIT_MAX_REQUESTS",
    "HR_ONE_BACKUP_ENABLED",
    "HR_ONE_BACKUP_RETENTION_DAYS",
    "HR_ONE_BACKUP_ENCRYPTION_KEY_REF",
    "HR_ONE_BACKUP_RESTORE_TESTED_AT",
  ];
}

function sensitiveKeys() {
  return new Set([
    "DATABASE_URL",
    "HR_ONE_SESSION_SECRET",
    "HR_ONE_ENCRYPTION_KEY",
    "HR_ONE_AUDIT_LOG_SIGNING_KEY",
    "CRON_SECRET",
  ]);
}
