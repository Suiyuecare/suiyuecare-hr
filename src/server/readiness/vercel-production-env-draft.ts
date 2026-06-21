import { randomBytes } from "node:crypto";
import {
  classifyDatabaseConnection,
  hasPrismaTransactionPoolerParams,
  type DatabaseConnectionPosture,
} from "@/server/readiness/database-url";

export type VercelProductionEnvDraftOptions = {
  now?: Date;
  appUrl?: string;
  projectId?: string;
  supabaseUrl?: string;
  supabaseRegion?: string;
  supabasePublishableKey?: string;
  randomSecret?: () => string;
};

export type VercelProductionEnvDraftRefreshResult = {
  text: string;
  changedKeys: string[];
  appendedKeys: string[];
};

export type VercelProductionDatabaseUrlUpdateResult = VercelProductionEnvDraftRefreshResult & {
  connectionPosture: DatabaseConnectionPosture;
};

export type VercelProductionEnvDraftRefreshOptions = VercelProductionEnvDraftOptions & {
  restoreDrillTestedAt?: string;
};

export type VercelProductionDatabaseUrlUpdateOptions = {
  supabaseIpv4AddonEnabled?: boolean;
};

const defaultAppUrl = "https://hr.suiyuecare.com";
const defaultProjectId = "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N";
const defaultSupabaseUrl = "https://aruncclorusswpfnpgsn.supabase.co";
const defaultSupabaseRegion = "ap-northeast-2";
const defaultSupabasePublishableKey = "sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M";
const defaultSupabaseAuthIssuerUrl = `${defaultSupabaseUrl}/auth/v1`;
const defaultSupabaseAuthJwksUrl = `${defaultSupabaseAuthIssuerUrl}/.well-known/jwks.json`;
const defaultAuthLoginUrl = `${defaultAppUrl}/auth/sign-in`;
const defaultPilotTenantId = "tenant_suiyuecare_pilot";
const defaultPilotCompanyId = "company_suiyuecare_pilot";
const defaultObjectStorageBucket = "suiyuecare-hrone-documents";

const refreshableKnownValueKeys = new Set([
  "HR_ONE_ENV",
  "NEXT_PUBLIC_APP_NAME",
  "HR_ONE_APP_URL",
  "HR_ONE_DEPLOYMENT_TARGET",
  "VERCEL_PROJECT_ID",
  "HR_ONE_DATABASE_PROVIDER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "HR_ONE_SUPABASE_REGION",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "HR_ONE_AUTH_PROVIDER",
  "HR_ONE_AUTH_SESSION_SOURCE",
  "HR_ONE_AUTH_ISSUER_URL",
  "HR_ONE_AUTH_LOGIN_URL",
  "HR_ONE_AUTH_AUDIENCE",
  "HR_ONE_AUTH_JWKS_URL",
  "HR_ONE_AUTH_DEFAULT_TENANT",
  "HR_ONE_AUTH_DEFAULT_COMPANY",
  "HR_ONE_CRON_TENANT_ID",
  "HR_ONE_CRON_COMPANY_ID",
  "HR_ONE_OBJECT_STORAGE_PROVIDER",
  "HR_ONE_OBJECT_STORAGE_BUCKET",
  "HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS",
  "HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS",
  "HR_ONE_WEB_SESSION_MAX_AGE_SECONDS",
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
    ["HR_ONE_SUPABASE_REGION", options.supabaseRegion ?? defaultSupabaseRegion],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", options.supabasePublishableKey ?? defaultSupabasePublishableKey],
    ["DATABASE_URL", "REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL_SCHEMA_HR_ONE"],
    ["HR_ONE_SESSION_SECRET", secret()],
    ["HR_ONE_ENCRYPTION_KEY", secret()],
    ["HR_ONE_AUDIT_LOG_SIGNING_KEY", secret()],
    ["CRON_SECRET", secret()],
    ["HR_ONE_OBJECT_STORAGE_PROVIDER", "supabase_storage"],
    ["HR_ONE_OBJECT_STORAGE_BUCKET", defaultObjectStorageBucket],
    ["HR_ONE_OBJECT_STORAGE_SECRET_REF", "vault://suiyuecare/hr-one/storage"],
    ["HR_ONE_OBJECT_STORAGE_KMS_KEY_REF", "vault://suiyuecare/hr-one/document-storage-key"],
    ["HR_ONE_OBJECT_STORAGE_LIFECYCLE_POLICY_REF", `supabase://${defaultObjectStorageBucket}/lifecycle/hr-documents-7y`],
    ["HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS", "600"],
    ["HR_ONE_AUTH_PROVIDER", "supabase_auth"],
    ["HR_ONE_AUTH_SESSION_SOURCE", "oidc"],
    ["HR_ONE_AUTH_ISSUER_URL", defaultSupabaseAuthIssuerUrl],
    ["HR_ONE_AUTH_LOGIN_URL", defaultAuthLoginUrl],
    ["HR_ONE_AUTH_AUDIENCE", "authenticated"],
    ["HR_ONE_AUTH_JWKS_URL", defaultSupabaseAuthJwksUrl],
    ["HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS", "3600"],
    ["HR_ONE_WEB_SESSION_MAX_AGE_SECONDS", "28800"],
    ["HR_ONE_AUTH_DEFAULT_TENANT", defaultPilotTenantId],
    ["HR_ONE_AUTH_DEFAULT_COMPANY", defaultPilotCompanyId],
    ["HR_ONE_CRON_TENANT_ID", defaultPilotTenantId],
    ["HR_ONE_CRON_COMPANY_ID", defaultPilotCompanyId],
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
  options: VercelProductionEnvDraftRefreshOptions = {},
): VercelProductionEnvDraftRefreshResult {
  const defaults = new Map(buildVercelProductionEnvDraftValues({
    ...options,
    randomSecret: () => "unused-generated-secret-with-more-than-32-characters",
  }));
  const refreshableKeys = new Set(refreshableKnownValueKeys);
  if (options.restoreDrillTestedAt) {
    defaults.set("HR_ONE_BACKUP_RESTORE_TESTED_AT", normalizeDate(options.restoreDrillTestedAt));
    refreshableKeys.add("HR_ONE_BACKUP_RESTORE_TESTED_AT");
  }
  const seen = new Set<string>();
  const changedKeys: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || !refreshableKeys.has(parsed.key)) return line;
    seen.add(parsed.key);
    const nextValue = defaults.get(parsed.key);
    if (!nextValue || parsed.value === nextValue) return line;
    changedKeys.push(parsed.key);
    return `${parsed.key}=${quoteEnvValue(nextValue)}`;
  });
  const appendedKeys = [...refreshableKeys]
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

export function setVercelProductionDatabaseUrl(
  text: string,
  databaseUrl: string,
  options: VercelProductionDatabaseUrlUpdateOptions = {},
): VercelProductionDatabaseUrlUpdateResult {
  const normalizedDatabaseUrl = databaseUrl.trim();
  const connectionPosture = validateVercelProductionDatabaseUrl(normalizedDatabaseUrl, options);
  const values = new Map<string, string>([["DATABASE_URL", normalizedDatabaseUrl]]);
  if (connectionPosture === "supabase-direct" && options.supabaseIpv4AddonEnabled) {
    values.set("HR_ONE_SUPABASE_IPV4_ADDON_ENABLED", "true");
  }
  const result = updateEnvValues(text, values);
  return {
    ...result,
    connectionPosture,
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

function updateEnvValues(text: string, values: Map<string, string>): VercelProductionEnvDraftRefreshResult {
  const seen = new Set<string>();
  const changedKeys: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || !values.has(parsed.key)) return line;
    seen.add(parsed.key);
    const nextValue = values.get(parsed.key)!;
    if (parsed.value === nextValue) return line;
    changedKeys.push(parsed.key);
    return `${parsed.key}=${quoteEnvValue(nextValue)}`;
  });
  const appendedKeys = [...values.keys()].filter((key) => !seen.has(key)).sort();

  if (appendedKeys.length > 0) {
    const insertAt = lines.length > 0 && lines.at(-1) === "" ? lines.length - 1 : lines.length;
    lines.splice(
      insertAt,
      0,
      "# Updated operator-managed HR One production values.",
      ...appendedKeys.map((key) => `${key}=${quoteEnvValue(values.get(key)!)}`
      ),
    );
  }

  return {
    text: lines.join("\n"),
    changedKeys: changedKeys.sort(),
    appendedKeys,
  };
}

function validateVercelProductionDatabaseUrl(
  value: string,
  options: VercelProductionDatabaseUrlUpdateOptions,
): DatabaseConnectionPosture {
  if (!value) throw new Error("DATABASE_URL is required.");
  if (/REPLACE_WITH|placeholder|example|demo|localhost|password/i.test(value)) {
    throw new Error("DATABASE_URL contains a placeholder, demo, local, or weak value.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must start with postgresql:// or postgres://.");
  }
  if (url.searchParams.get("schema") !== "hr_one") {
    throw new Error("DATABASE_URL must include schema=hr_one.");
  }

  const posture = classifyDatabaseConnection(value);
  if (posture === "supabase-pooler-transaction") {
    if (!hasPrismaTransactionPoolerParams(value)) {
      throw new Error("Supabase transaction pooler DATABASE_URL requires pgbouncer=true and connection_limit=1.");
    }
    return posture;
  }
  if (posture === "supabase-direct") {
    if (!options.supabaseIpv4AddonEnabled) {
      throw new Error("Supabase direct DATABASE_URL requires --supabase-ipv4-addon-enabled for Vercel/serverless.");
    }
    return posture;
  }
  if (posture === "supabase-pooler-session") {
    throw new Error("Use Supabase transaction pooler port 6543 for Vercel/serverless, not session pooler port 5432.");
  }
  if (posture === "supabase-pooler-unknown") {
    throw new Error("Supabase pooler DATABASE_URL must use transaction mode port 6543 for Vercel/serverless.");
  }
  if (posture === "invalid") {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  throw new Error("DATABASE_URL must be a recognized Supabase transaction pooler URL, or a direct Supabase host with IPv4 add-on attestation.");
}

function normalizeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Expected restore drill date in YYYY-MM-DD format.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Expected restore drill date in YYYY-MM-DD format.");
  }
  return value;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
