import {
  buildEnvironmentVerificationReport,
  environmentVerificationPassed,
  type EnvironmentVerificationCheck,
} from "./environment-verification";

export type ParsedEnvFile = Record<string, string>;

export type VercelEnvPayloadItem = {
  key: string;
  value: string;
  type: "encrypted" | "sensitive";
  target: ["production"];
  comment: string;
};

export type VercelCliEnvCommand = {
  command: "pnpm";
  args: string[];
  stdin: string;
  redactedCommand: string;
};

export type VercelProductionEnvPlan = {
  projectId: string;
  teamId: string;
  items: VercelEnvPayloadItem[];
  checks: EnvironmentVerificationCheck[];
  passed: boolean;
};

export type VercelKnownProductionEnvPlan = {
  projectId: string;
  teamId: string;
  items: VercelEnvPayloadItem[];
  skippedPlaceholderKeys: string[];
  operatorManagedKeys: string[];
};

const sensitiveNamePatterns = [
  /^DATABASE_URL$/,
  /SECRET/,
  /TOKEN/,
  /KEY/,
  /PASSWORD/,
  /PRIVATE/,
  /REF$/,
];

const nonSensitiveKeys = new Set([
  "HR_ONE_ENV",
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
  "HR_ONE_AUTH_TENANT_CONTEXT_SOURCE",
  "HR_ONE_AUTH_DEFAULT_COMPANY",
  "HR_ONE_AUTH_DEFAULT_TENANT",
  "HR_ONE_CRON_COMPANY_ID",
  "HR_ONE_CRON_TENANT_ID",
  "HR_ONE_OBJECT_STORAGE_BUCKET",
  "HR_ONE_OBJECT_STORAGE_PROVIDER",
  "HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS",
  "HR_ONE_AUTH_JWKS_URL",
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
  "HR_ONE_BACKUP_RESTORE_TESTED_AT",
]);

export const knownProductionBootstrapKeys = [
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
  "HR_ONE_AUTH_TENANT_CONTEXT_SOURCE",
  "HR_ONE_AUTH_DEFAULT_TENANT",
  "HR_ONE_AUTH_DEFAULT_COMPANY",
  "HR_ONE_WEB_SESSION_MAX_AGE_SECONDS",
  "HR_ONE_CRON_TENANT_ID",
  "HR_ONE_CRON_COMPANY_ID",
  "HR_ONE_OBJECT_STORAGE_PROVIDER",
  "HR_ONE_OBJECT_STORAGE_BUCKET",
  "HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS",
  "HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS",
  "HR_ONE_AI_PROVIDER",
  "HR_ONE_AI_PROMPT_STORAGE",
  "HR_ONE_RATE_LIMIT_ENABLED",
  "HR_ONE_RATE_LIMIT_PROVIDER",
  "HR_ONE_RATE_LIMIT_WINDOW_SECONDS",
  "HR_ONE_RATE_LIMIT_MAX_REQUESTS",
  "HR_ONE_BACKUP_ENABLED",
  "HR_ONE_BACKUP_RETENTION_DAYS",
] as const;

export const generatedSecretBootstrapKeys = [
  "HR_ONE_SESSION_SECRET",
  "HR_ONE_ENCRYPTION_KEY",
  "HR_ONE_AUDIT_LOG_SIGNING_KEY",
  "CRON_SECRET",
] as const;

export const operatorManagedProductionKeys = [
  "DATABASE_URL",
  "HR_ONE_OBJECT_STORAGE_SECRET_REF",
  "HR_ONE_OBJECT_STORAGE_KMS_KEY_REF",
  "HR_ONE_OBJECT_STORAGE_LIFECYCLE_POLICY_REF",
  "HR_ONE_RATE_LIMIT_SECRET_REF",
  "HR_ONE_BACKUP_ENCRYPTION_KEY_REF",
  "HR_ONE_BACKUP_RESTORE_TESTED_AT",
] as const;

export function parseEnvFile(text: string): ParsedEnvFile {
  const env: ParsedEnvFile = {};

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      throw new Error(`Invalid env file line ${index + 1}. Expected KEY=value.`);
    }
    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error(`Invalid env key on line ${index + 1}.`);
    }
    env[key] = parseEnvValue(rawValue);
  }

  return env;
}

export function buildVercelProductionEnvPlan(options: {
  env: Record<string, string | undefined>;
  projectId: string;
  teamId: string;
  now?: Date;
}): VercelProductionEnvPlan {
  const report = buildEnvironmentVerificationReport(options.env, "production", options.now);
  const items = Object.entries(options.env)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => buildVercelEnvPayloadItem(key, value));

  return {
    projectId: options.projectId,
    teamId: options.teamId,
    items,
    checks: report.checks,
    passed: environmentVerificationPassed(report),
  };
}

export function buildVercelKnownProductionEnvPlan(options: {
  env: Record<string, string | undefined>;
  projectId: string;
  teamId: string;
}): VercelKnownProductionEnvPlan {
  const bootstrapKeys = new Set<string>([
    ...knownProductionBootstrapKeys,
    ...generatedSecretBootstrapKeys,
  ]);
  const skippedPlaceholderKeys: string[] = [];
  const operatorManagedKeys: string[] = [];
  const items = Object.entries(options.env)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .filter(([key, value]) => {
      if (hasUnresolvedPlaceholder(value)) {
        skippedPlaceholderKeys.push(key);
        return false;
      }
      if (operatorManagedProductionKeys.includes(key as (typeof operatorManagedProductionKeys)[number])) {
        operatorManagedKeys.push(key);
        return false;
      }
      if (!bootstrapKeys.has(key)) return false;
      if (generatedSecretBootstrapKeys.includes(key as (typeof generatedSecretBootstrapKeys)[number])) {
        return isStrongGeneratedSecret(value);
      }
      return true;
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => buildVercelEnvPayloadItem(key, value));

  return {
    projectId: options.projectId,
    teamId: options.teamId,
    items,
    skippedPlaceholderKeys: skippedPlaceholderKeys.sort(),
    operatorManagedKeys: [...new Set(operatorManagedKeys)].sort(),
  };
}

export function buildVercelEnvPayloadItem(key: string, value: string): VercelEnvPayloadItem {
  return {
    key,
    value,
    type: isSensitiveVercelEnvKey(key) ? "sensitive" : "encrypted",
    target: ["production"],
    comment: "HR One production environment managed by repository bootstrap script.",
  };
}

export function buildVercelCliEnvCommand(item: VercelEnvPayloadItem): VercelCliEnvCommand {
  const sensitivityFlag = item.type === "sensitive" ? "--sensitive" : "--no-sensitive";
  const args = [
    "dlx",
    "vercel@latest",
    "env",
    "add",
    item.key,
    "production",
    sensitivityFlag,
    "--force",
    "--yes",
  ];

  return {
    command: "pnpm",
    args,
    stdin: item.value,
    redactedCommand: ["pnpm", ...args, "<value via stdin>"].join(" "),
  };
}

export function isSensitiveVercelEnvKey(key: string): boolean {
  if (key.startsWith("NEXT_PUBLIC_")) return false;
  if (nonSensitiveKeys.has(key)) return false;
  return sensitiveNamePatterns.some((pattern) => pattern.test(key));
}

export function summarizeVercelProductionEnvPlan(plan: VercelProductionEnvPlan): string[] {
  const sensitiveCount = plan.items.filter((item) => item.type === "sensitive").length;
  const encryptedCount = plan.items.length - sensitiveCount;

  return [
    `project=${plan.projectId}`,
    `team=${plan.teamId}`,
    `${plan.items.length} variable(s): ${sensitiveCount} sensitive, ${encryptedCount} encrypted`,
    `verification=${plan.passed ? "passed" : "failed"}`,
  ];
}

export function summarizeVercelKnownProductionEnvPlan(plan: VercelKnownProductionEnvPlan): string[] {
  const sensitiveCount = plan.items.filter((item) => item.type === "sensitive").length;
  const encryptedCount = plan.items.length - sensitiveCount;

  return [
    `project=${plan.projectId}`,
    `team=${plan.teamId}`,
    `${plan.items.length} bootstrap variable(s): ${sensitiveCount} sensitive, ${encryptedCount} encrypted`,
    `${plan.operatorManagedKeys.length} operator-managed key(s): ${plan.operatorManagedKeys.join(", ") || "none"}`,
    `${plan.skippedPlaceholderKeys.length} placeholder key(s) skipped: ${plan.skippedPlaceholderKeys.join(", ") || "none"}`,
  ];
}

function parseEnvValue(rawValue: string): string {
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

function hasUnresolvedPlaceholder(value: string) {
  return /REPLACE_WITH_[A-Z0-9_]+/.test(value);
}

function isStrongGeneratedSecret(value: string) {
  return value.length >= 32 && !/changeme|change-me|replace|placeholder|example|demo|test|localhost|password/i.test(value);
}
