import { isSafeAuthLoginUrl } from "@/server/auth/login-url";

export type EnvironmentVerificationMode = "local" | "production";

export type EnvironmentVerificationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type EnvironmentVerificationReport = {
  mode: EnvironmentVerificationMode;
  checks: EnvironmentVerificationCheck[];
};

const weakValuePatterns = [
  /changeme/i,
  /change-me/i,
  /replace/i,
  /placeholder/i,
  /example/i,
  /demo/i,
  /test/i,
  /localhost/i,
  /password/i,
];
const requiredSecretLength = 32;
const minimumBackupRetentionDays = 30;
const maximumRestoreDrillAgeDays = 90;
const minimumAuthTokenAgeSeconds = 300;
const maximumAuthTokenAgeSeconds = 86_400;
const minimumRateLimitWindowSeconds = 10;
const maximumRateLimitWindowSeconds = 3_600;
const minimumRateLimitMaxRequests = 10;
const maximumRateLimitMaxRequests = 10_000;
const allowedDeploymentTargets = new Set(["vercel", "self_hosted", "other"]);
const allowedDatabaseProviders = new Set(["supabase_postgres", "managed_postgres", "rds", "cloud_sql", "neon", "other"]);
const allowedRateLimitProviders = new Set([
  "cloudflare",
  "edge",
  "external_http",
  "redis",
  "upstash",
  "vercel_firewall",
  "waf",
]);

export function buildEnvironmentVerificationReport(
  env: Record<string, string | undefined>,
  mode: EnvironmentVerificationMode,
  now = new Date(),
): EnvironmentVerificationReport {
  const checks = mode === "production" ? buildProductionChecks(env, now) : buildLocalChecks(env);
  return { mode, checks };
}

export function environmentVerificationPassed(report: EnvironmentVerificationReport) {
  return report.checks.every((item) => item.passed);
}

function buildLocalChecks(env: Record<string, string | undefined>) {
  return [
    check(
      "app name",
      true,
      read(env, "NEXT_PUBLIC_APP_NAME") ? "configured" : "optional but recommended",
    ),
  ];
}

function buildProductionChecks(env: Record<string, string | undefined>, now: Date) {
  const databaseUrl = read(env, "DATABASE_URL");
  const appUrl = read(env, "HR_ONE_APP_URL") ?? read(env, "NEXT_PUBLIC_APP_URL");
  const deploymentTarget = read(env, "HR_ONE_DEPLOYMENT_TARGET");
  const databaseProvider = read(env, "HR_ONE_DATABASE_PROVIDER");
  const vercelProjectId = read(env, "VERCEL_PROJECT_ID");
  const supabaseUrl = read(env, "NEXT_PUBLIC_SUPABASE_URL");
  const supabasePublishableKey = read(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const aiProvider = read(env, "HR_ONE_AI_PROVIDER");
  const aiEnabled = Boolean(aiProvider && aiProvider !== "disabled");
  const authLoginUrl = read(env, "HR_ONE_AUTH_LOGIN_URL");
  const authLoginUrlSafe = isSafeAuthLoginUrl(authLoginUrl);
  const authMaxTokenAgeSeconds = readInteger(env, "HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS");
  const rawPromptStorage = read(env, "HR_ONE_AI_PROMPT_STORAGE") === "raw";
  const backupRetentionDays = readInteger(env, "HR_ONE_BACKUP_RETENTION_DAYS");
  const restoreDrillAgeDays = daysSince(read(env, "HR_ONE_BACKUP_RESTORE_TESTED_AT"), now);
  const rateLimitProvider = read(env, "HR_ONE_RATE_LIMIT_PROVIDER");
  const rateLimitWindowSeconds = readInteger(env, "HR_ONE_RATE_LIMIT_WINDOW_SECONDS");
  const rateLimitMaxRequests = readInteger(env, "HR_ONE_RATE_LIMIT_MAX_REQUESTS");
  const externalRateLimitProvider = rateLimitProvider === "external_http";

  return [
    check(
      "deployment environment",
      read(env, "HR_ONE_ENV") === "production",
      read(env, "HR_ONE_ENV") === "production" ? "production" : "set HR_ONE_ENV=production",
    ),
    check(
      "database url",
      isProductionPostgresUrl(databaseUrl),
      databaseUrl ? "PostgreSQL URL configured without local/demo host hints" : "missing DATABASE_URL",
    ),
    check(
      "public app url",
      isHttpsUrl(appUrl) && !hasWeakValue(appUrl),
      appUrl ? "HTTPS production URL configured" : "missing HR_ONE_APP_URL or NEXT_PUBLIC_APP_URL",
    ),
    check(
      "deployment target",
      Boolean(deploymentTarget && allowedDeploymentTargets.has(deploymentTarget)),
      deploymentTarget
        ? `${deploymentTarget} configured`
        : "missing HR_ONE_DEPLOYMENT_TARGET",
    ),
    check(
      "Vercel project binding",
      deploymentTarget !== "vercel" || isVercelProjectId(vercelProjectId),
      deploymentTarget === "vercel"
        ? vercelProjectId
          ? isVercelProjectId(vercelProjectId)
            ? "Vercel project id configured"
            : "invalid VERCEL_PROJECT_ID"
          : "missing VERCEL_PROJECT_ID"
        : "not required for this deployment target",
    ),
    check(
      "database provider",
      Boolean(databaseProvider && allowedDatabaseProviders.has(databaseProvider)),
      databaseProvider
        ? `${databaseProvider} configured`
        : "missing HR_ONE_DATABASE_PROVIDER",
    ),
    check(
      "database private schema",
      databaseProvider !== "supabase_postgres" || databaseUrlUsesSchema(databaseUrl, "hr_one"),
      databaseProvider === "supabase_postgres"
        ? databaseUrlUsesSchema(databaseUrl, "hr_one")
          ? "schema=hr_one configured"
          : "set DATABASE_URL query parameter schema=hr_one"
        : "not required for this database provider",
    ),
    check(
      "Supabase project url",
      databaseProvider !== "supabase_postgres" || isSupabaseProjectUrl(supabaseUrl),
      databaseProvider === "supabase_postgres"
        ? supabaseUrl
          ? isSupabaseProjectUrl(supabaseUrl)
            ? "Supabase project URL configured"
            : "invalid NEXT_PUBLIC_SUPABASE_URL"
          : "missing NEXT_PUBLIC_SUPABASE_URL"
        : "not required for this database provider",
    ),
    check(
      "Supabase publishable key",
      databaseProvider !== "supabase_postgres" || isSupabasePublishableKey(supabasePublishableKey),
      databaseProvider === "supabase_postgres"
        ? supabasePublishableKey
          ? isSupabasePublishableKey(supabasePublishableKey)
            ? "publishable key configured"
            : "invalid NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
          : "missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
        : "not required for this database provider",
    ),
    secretCheck(env, "HR_ONE_SESSION_SECRET"),
    secretCheck(env, "HR_ONE_ENCRYPTION_KEY"),
    secretCheck(env, "HR_ONE_AUDIT_LOG_SIGNING_KEY"),
    referenceCheck(env, "HR_ONE_OBJECT_STORAGE_SECRET_REF"),
    check(
      "auth provider",
      Boolean(read(env, "HR_ONE_AUTH_PROVIDER")),
      read(env, "HR_ONE_AUTH_PROVIDER") ? "configured" : "missing HR_ONE_AUTH_PROVIDER",
    ),
    check(
      "auth session source",
      read(env, "HR_ONE_AUTH_SESSION_SOURCE") === "oidc",
      read(env, "HR_ONE_AUTH_SESSION_SOURCE") === "oidc"
        ? "OIDC session source configured"
        : "set HR_ONE_AUTH_SESSION_SOURCE=oidc",
    ),
    check(
      "auth issuer url",
      isHttpsUrl(read(env, "HR_ONE_AUTH_ISSUER_URL")),
      read(env, "HR_ONE_AUTH_ISSUER_URL") ? "HTTPS issuer configured" : "missing HR_ONE_AUTH_ISSUER_URL",
    ),
    check(
      "auth login url",
      authLoginUrlSafe,
      authLoginUrl
        ? authLoginUrlSafe
          ? "production auth login URL configured"
          : "invalid HR_ONE_AUTH_LOGIN_URL"
        : "missing HR_ONE_AUTH_LOGIN_URL",
    ),
    check(
      "auth audience",
      Boolean(read(env, "HR_ONE_AUTH_AUDIENCE") && !hasWeakValue(read(env, "HR_ONE_AUTH_AUDIENCE"))),
      read(env, "HR_ONE_AUTH_AUDIENCE") ? "configured" : "missing HR_ONE_AUTH_AUDIENCE",
    ),
    check(
      "auth jwks url",
      isHttpsUrl(read(env, "HR_ONE_AUTH_JWKS_URL")),
      read(env, "HR_ONE_AUTH_JWKS_URL") ? "HTTPS JWKS configured" : "missing HR_ONE_AUTH_JWKS_URL",
    ),
    check(
      "auth token max age",
      authMaxTokenAgeSeconds !== null &&
        authMaxTokenAgeSeconds >= minimumAuthTokenAgeSeconds &&
        authMaxTokenAgeSeconds <= maximumAuthTokenAgeSeconds,
      authMaxTokenAgeSeconds !== null
        ? `${authMaxTokenAgeSeconds} second(s) configured`
        : "missing HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS",
    ),
    check(
      "AI provider posture",
      !aiEnabled || Boolean(read(env, "HR_ONE_AI_SECRET_REF")),
      aiEnabled ? "AI provider enabled with vault reference" : "AI provider disabled or not configured",
    ),
    check(
      "AI prompt storage",
      !rawPromptStorage,
      rawPromptStorage ? "raw prompt storage is blocked for production" : "raw sensitive prompt storage disabled",
    ),
    check(
      "app rate limiter",
      read(env, "HR_ONE_RATE_LIMIT_ENABLED") !== "false",
      read(env, "HR_ONE_RATE_LIMIT_ENABLED") === "false"
        ? "HR_ONE_RATE_LIMIT_ENABLED=false is blocked for production"
        : "application rate limiter enabled",
    ),
    check(
      "rate limit provider",
      Boolean(rateLimitProvider && allowedRateLimitProviders.has(rateLimitProvider)),
      rateLimitProvider
        ? `${rateLimitProvider} configured`
        : "missing HR_ONE_RATE_LIMIT_PROVIDER",
    ),
    referenceCheck(env, "HR_ONE_RATE_LIMIT_SECRET_REF"),
    check(
      "external rate limit endpoint",
      !externalRateLimitProvider ||
        (isHttpsUrl(read(env, "HR_ONE_RATE_LIMIT_HTTP_ENDPOINT")) &&
          !hasWeakValue(read(env, "HR_ONE_RATE_LIMIT_HTTP_ENDPOINT"))),
      externalRateLimitProvider
        ? read(env, "HR_ONE_RATE_LIMIT_HTTP_ENDPOINT")
          ? isHttpsUrl(read(env, "HR_ONE_RATE_LIMIT_HTTP_ENDPOINT")) &&
              !hasWeakValue(read(env, "HR_ONE_RATE_LIMIT_HTTP_ENDPOINT"))
            ? "HTTPS external rate limit endpoint configured"
            : "invalid HR_ONE_RATE_LIMIT_HTTP_ENDPOINT"
          : "missing HR_ONE_RATE_LIMIT_HTTP_ENDPOINT"
        : "not required for upstream provider",
    ),
    check(
      "external rate limit token",
      !externalRateLimitProvider || isStrongSecret(read(env, "HR_ONE_RATE_LIMIT_HTTP_TOKEN")),
      externalRateLimitProvider
        ? read(env, "HR_ONE_RATE_LIMIT_HTTP_TOKEN")
          ? isStrongSecret(read(env, "HR_ONE_RATE_LIMIT_HTTP_TOKEN"))
            ? "configured and not a weak placeholder"
            : "invalid HR_ONE_RATE_LIMIT_HTTP_TOKEN"
          : "missing HR_ONE_RATE_LIMIT_HTTP_TOKEN"
        : "not required for upstream provider",
    ),
    check(
      "rate limit window",
      rateLimitWindowSeconds !== null &&
        rateLimitWindowSeconds >= minimumRateLimitWindowSeconds &&
        rateLimitWindowSeconds <= maximumRateLimitWindowSeconds,
      rateLimitWindowSeconds !== null
        ? `${rateLimitWindowSeconds} second(s) configured`
        : "missing HR_ONE_RATE_LIMIT_WINDOW_SECONDS",
    ),
    check(
      "rate limit ceiling",
      rateLimitMaxRequests !== null &&
        rateLimitMaxRequests >= minimumRateLimitMaxRequests &&
        rateLimitMaxRequests <= maximumRateLimitMaxRequests,
      rateLimitMaxRequests !== null
        ? `${rateLimitMaxRequests} request(s) configured`
        : "missing HR_ONE_RATE_LIMIT_MAX_REQUESTS",
    ),
    check(
      "database backups",
      read(env, "HR_ONE_BACKUP_ENABLED") === "true",
      read(env, "HR_ONE_BACKUP_ENABLED") === "true" ? "enabled" : "set HR_ONE_BACKUP_ENABLED=true",
    ),
    check(
      "backup retention",
      backupRetentionDays !== null && backupRetentionDays >= minimumBackupRetentionDays,
      backupRetentionDays !== null
        ? `${backupRetentionDays} day(s) configured`
        : "missing HR_ONE_BACKUP_RETENTION_DAYS",
    ),
    referenceCheck(env, "HR_ONE_BACKUP_ENCRYPTION_KEY_REF"),
    check(
      "restore drill evidence",
      restoreDrillAgeDays !== null && restoreDrillAgeDays <= maximumRestoreDrillAgeDays,
      restoreDrillAgeDays !== null
        ? `last restore drill ${restoreDrillAgeDays} day(s) ago`
        : "missing or invalid HR_ONE_BACKUP_RESTORE_TESTED_AT",
    ),
  ];
}

function secretCheck(env: Record<string, string | undefined>, key: string) {
  const value = read(env, key);
  return check(
    key,
    isStrongSecret(value),
    value ? "configured and not a weak placeholder" : `missing ${key}`,
  );
}

function referenceCheck(env: Record<string, string | undefined>, key: string) {
  const value = read(env, key);
  return check(
    key,
    Boolean(value && !hasWeakValue(value) && value.length >= 8),
    value ? "vault/reference configured" : `missing ${key}`,
  );
}

function read(env: Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

function readInteger(env: Record<string, string | undefined>, key: string) {
  const value = read(env, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function isProductionPostgresUrl(value: string | null) {
  if (!value || hasWeakValue(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "postgresql:" || url.protocol === "postgres:";
  } catch {
    return false;
  }
}

function databaseUrlUsesSchema(value: string | null, schema: string) {
  if (!value) return false;
  try {
    return new URL(value).searchParams.get("schema") === schema;
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string | null) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isVercelProjectId(value: string | null) {
  return Boolean(value && /^prj_[A-Za-z0-9]+$/.test(value));
}

function isSupabaseProjectUrl(value: string | null) {
  if (!isHttpsUrl(value) || hasWeakValue(value)) return false;
  try {
    const host = new URL(value!).hostname;
    return host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function isSupabasePublishableKey(value: string | null) {
  return Boolean(value && value.startsWith("sb_publishable_") && value.length >= 32 && !hasWeakValue(value));
}

function isStrongSecret(value: string | null) {
  return Boolean(value && value.length >= requiredSecretLength && !hasWeakValue(value));
}

function hasWeakValue(value: string | null) {
  return Boolean(value && weakValuePatterns.some((pattern) => pattern.test(value)));
}

function daysSince(isoDate: string | null, now: Date) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime()) || date > now) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function check(name: string, passed: boolean, detail: string): EnvironmentVerificationCheck {
  return { name, passed, detail };
}
