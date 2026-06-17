import { randomBytes } from "node:crypto";

export type VercelProductionEnvDraftOptions = {
  now?: Date;
  appUrl?: string;
  projectId?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  randomSecret?: () => string;
};

export type VercelProductionEnvDraftRefreshResult = {
  text: string;
  changedKeys: string[];
  appendedKeys: string[];
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

const refreshableKnownValueKeys = new Set([
  "HR_ONE_ENV",
  "NEXT_PUBLIC_APP_NAME",
  "HR_ONE_APP_URL",
  "HR_ONE_DEPLOYMENT_TARGET",
  "VERCEL_PROJECT_ID",
  "HR_ONE_DATABASE_PROVIDER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "HR_ONE_AUTH_PROVIDER",
  "HR_ONE_AUTH_SESSION_SOURCE",
  "HR_ONE_AUTH_ISSUER_URL",
  "HR_ONE_AUTH_LOGIN_URL",
  "HR_ONE_AUTH_AUDIENCE",
  "HR_ONE_AUTH_JWKS_URL",
  "HR_ONE_AUTH_DEFAULT_TENANT",
  "HR_ONE_AUTH_DEFAULT_COMPANY",
  "HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS",
  "HR_ONE_AI_PROVIDER",
  "HR_ONE_AI_PROMPT_STORAGE",
  "HR_ONE_RATE_LIMIT_ENABLED",
  "HR_ONE_RATE_LIMIT_PROVIDER",
  "HR_ONE_RATE_LIMIT_WINDOW_SECONDS",
  "HR_ONE_RATE_LIMIT_MAX_REQUESTS",
  "HR_ONE_BACKUP_ENABLED",
  "HR_ONE_BACKUP_RETENTION_DAYS",
]);

export function buildVercelProductionEnvDraft(options: VercelProductionEnvDraftOptions = {}) {
  const env = buildVercelProductionEnvDraftValues(options);

  return [
    "# Generated HR One Vercel Production env draft.",
    "# Do not commit this file. It is intentionally listed in .gitignore.",
    "# Replace all REPLACE_WITH_* values with real production values before running vercel:apply-production-env.",
    "# DATABASE_URL must be the Supabase transaction pooler URL for Vercel, with pgbouncer=true, connection_limit=1, and schema=hr_one.",
    "",
    ...env.map(([key, value]) => `${key}=${quoteEnvValue(value)}`),
    "",
  ].join("\n");
}

export function buildVercelProductionEnvDraftValues(options: VercelProductionEnvDraftOptions = {}) {
  const secret = options.randomSecret ?? generateSecret;
  const now = options.now ?? new Date();
  const checkedDate = formatDate(now);
  return [
    ["HR_ONE_ENV", "production"],
    ["NEXT_PUBLIC_APP_NAME", "HR One"],
    ["HR_ONE_APP_URL", options.appUrl ?? defaultAppUrl],
    ["HR_ONE_DEPLOYMENT_TARGET", "vercel"],
    ["VERCEL_PROJECT_ID", options.projectId ?? defaultProjectId],
    ["HR_ONE_DATABASE_PROVIDER", "supabase_postgres"],
    ["NEXT_PUBLIC_SUPABASE_URL", options.supabaseUrl ?? defaultSupabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", options.supabasePublishableKey ?? defaultSupabasePublishableKey],
    ["DATABASE_URL", "REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE"],
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
  ] satisfies Array<[string, string]>;
}

export function refreshVercelProductionEnvDraftKnownValues(
  text: string,
  options: VercelProductionEnvDraftOptions = {},
): VercelProductionEnvDraftRefreshResult {
  const defaults = new Map(buildVercelProductionEnvDraftValues({
    ...options,
    randomSecret: () => "unused-generated-secret-with-more-than-32-characters",
  }));
  const seen = new Set<string>();
  const changedKeys: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || !refreshableKnownValueKeys.has(parsed.key)) return line;
    seen.add(parsed.key);
    const nextValue = defaults.get(parsed.key);
    if (!nextValue || parsed.value === nextValue) return line;
    changedKeys.push(parsed.key);
    return `${parsed.key}=${quoteEnvValue(nextValue)}`;
  });
  const appendedKeys = [...refreshableKnownValueKeys]
    .filter((key) => !seen.has(key))
    .filter((key) => defaults.has(key))
    .sort();

  if (appendedKeys.length > 0) {
    const insertAt = lines.length > 0 && lines.at(-1) === "" ? lines.length - 1 : lines.length;
    lines.splice(
      insertAt,
      0,
      "# Refreshed known non-secret HR One production values.",
      ...appendedKeys.map((key) => `${key}=${quoteEnvValue(defaults.get(key)!)}`
      ),
    );
  }

  return {
    text: lines.join("\n"),
    changedKeys: changedKeys.sort(),
    appendedKeys,
  };
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

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex <= 0) return null;
  const key = trimmed.slice(0, equalsIndex).trim();
  const rawValue = trimmed.slice(equalsIndex + 1).trim();
  if (!/^[A-Z0-9_]+$/.test(key)) return null;
  return {
    key,
    value: parseEnvValue(rawValue),
  };
}

function parseEnvValue(rawValue: string) {
  if (!rawValue) return "";
  if (
    (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }
  const commentIndex = rawValue.indexOf(" #");
  return commentIndex >= 0 ? rawValue.slice(0, commentIndex).trim() : rawValue;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
