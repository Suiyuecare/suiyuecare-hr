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

export type VercelProductionEnvPlan = {
  projectId: string;
  teamId: string;
  items: VercelEnvPayloadItem[];
  checks: EnvironmentVerificationCheck[];
  passed: boolean;
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
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "HR_ONE_AUTH_PROVIDER",
  "HR_ONE_AUTH_SESSION_SOURCE",
  "HR_ONE_AUTH_ISSUER_URL",
  "HR_ONE_AUTH_AUDIENCE",
  "HR_ONE_AUTH_JWKS_URL",
  "HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS",
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

export function buildVercelEnvPayloadItem(key: string, value: string): VercelEnvPayloadItem {
  return {
    key,
    value,
    type: isSensitiveVercelEnvKey(key) ? "sensitive" : "encrypted",
    target: ["production"],
    comment: "HR One production environment managed by repository bootstrap script.",
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
