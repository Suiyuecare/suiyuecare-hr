import { randomBytes } from "node:crypto";

export type VercelProductionEnvDraftOptions = {
  now?: Date;
  appUrl?: string;
  projectId?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  randomSecret?: () => string;
};

const defaultAppUrl = "https://hr.suiyuecare.com";
const defaultProjectId = "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N";
const defaultSupabaseUrl = "https://aruncclorusswpfnpgsn.supabase.co";
const defaultSupabasePublishableKey = "sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M";
const defaultSupabaseAuthIssuerUrl = `${defaultSupabaseUrl}/auth/v1`;
const defaultSupabaseAuthJwksUrl = `${defaultSupabaseAuthIssuerUrl}/.well-known/jwks.json`;
const defaultAuthLoginUrl = `${defaultAppUrl}/auth/sign-in`;
const defaultPilotTenantId = "tenant_suiyuecare_pilot";
const defaultPilotCompanyId = "company_suiyuecare_pilot";

export function buildVercelProductionEnvDraft(options: VercelProductionEnvDraftOptions = {}) {
  const secret = options.randomSecret ?? generateSecret;
  const now = options.now ?? new Date();
  const checkedDate = formatDate(now);
  const env: Array<[string, string]> = [
    ["HR_ONE_ENV", "production"],
    ["NEXT_PUBLIC_APP_NAME", "HR One"],
    ["HR_ONE_APP_URL", options.appUrl ?? defaultAppUrl],
    ["HR_ONE_DEPLOYMENT_TARGET", "vercel"],
    ["VERCEL_PROJECT_ID", options.projectId ?? defaultProjectId],
    ["HR_ONE_DATABASE_PROVIDER", "supabase_postgres"],
    ["NEXT_PUBLIC_SUPABASE_URL", options.supabaseUrl ?? defaultSupabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", options.supabasePublishableKey ?? defaultSupabasePublishableKey],
    ["DATABASE_URL", "REPLACE_WITH_SUPABASE_POSTGRES_URL_SCHEMA_HR_ONE"],
    ["HR_ONE_SESSION_SECRET", secret()],
    ["HR_ONE_ENCRYPTION_KEY", secret()],
    ["HR_ONE_AUDIT_LOG_SIGNING_KEY", secret()],
    ["HR_ONE_OBJECT_STORAGE_SECRET_REF", "vault://suiyuecare/hr-one/storage"],
    ["HR_ONE_AUTH_PROVIDER", "supabase_auth"],
    ["HR_ONE_AUTH_SESSION_SOURCE", "oidc"],
    ["HR_ONE_AUTH_ISSUER_URL", defaultSupabaseAuthIssuerUrl],
    ["HR_ONE_AUTH_LOGIN_URL", defaultAuthLoginUrl],
    ["HR_ONE_AUTH_AUDIENCE", "authenticated"],
    ["HR_ONE_AUTH_JWKS_URL", defaultSupabaseAuthJwksUrl],
    ["HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS", "3600"],
    ["HR_ONE_AUTH_DEFAULT_TENANT", defaultPilotTenantId],
    ["HR_ONE_AUTH_DEFAULT_COMPANY", defaultPilotCompanyId],
    ["HR_ONE_AI_PROVIDER", "disabled"],
    ["HR_ONE_AI_PROMPT_STORAGE", "hashed"],
    ["HR_ONE_RATE_LIMIT_ENABLED", "true"],
    ["HR_ONE_RATE_LIMIT_PROVIDER", "vercel_firewall"],
    ["HR_ONE_RATE_LIMIT_SECRET_REF", "vault://suiyuecare/hr-one/rate-limit"],
    ["HR_ONE_RATE_LIMIT_WINDOW_SECONDS", "60"],
    ["HR_ONE_RATE_LIMIT_MAX_REQUESTS", "600"],
    ["HR_ONE_BACKUP_ENABLED", "true"],
    ["HR_ONE_BACKUP_RETENTION_DAYS", "35"],
    ["HR_ONE_BACKUP_ENCRYPTION_KEY_REF", "vault://suiyuecare/hr-one/backup-key"],
    ["HR_ONE_BACKUP_RESTORE_TESTED_AT", `REPLACE_WITH_RESTORE_DRILL_DATE_AFTER_${checkedDate}`],
  ];

  return [
    "# Generated HR One Vercel Production env draft.",
    "# Do not commit this file. It is intentionally listed in .gitignore.",
    "# Replace all REPLACE_WITH_* values with real production values before running vercel:apply-production-env.",
    "# DATABASE_URL must be a server-side Supabase Postgres URL that includes ?schema=hr_one.",
    "",
    ...env.map(([key, value]) => `${key}=${quoteEnvValue(value)}`),
    "",
  ].join("\n");
}

export function draftHasUnresolvedPlaceholders(text: string) {
  return /REPLACE_WITH_[A-Z0-9_]+/.test(text);
}

export function getUnresolvedEnvPlaceholderKeys(env: Record<string, string | undefined>) {
  return Object.entries(env)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .filter(([, value]) => /REPLACE_WITH_[A-Z0-9_]+/.test(value))
    .map(([key]) => key)
    .sort();
}

function generateSecret() {
  return randomBytes(32).toString("base64url");
}

function quoteEnvValue(value: string) {
  return JSON.stringify(value);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
