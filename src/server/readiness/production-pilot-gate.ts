import type { HealthReport } from "@/server/readiness/health";

export type ProductionPilotGateStatus = "ready" | "blocked";

export type ProductionPilotGateCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type ProductionPilotGateReport = {
  status: ProductionPilotGateStatus;
  appUrl: string;
  readinessUrl: string;
  checkedAt: string;
  checks: ProductionPilotGateCheck[];
  nextActions: string[];
};

export type ProductionPilotGateOptions = {
  appUrl: string;
  healthReport?: HealthReport | null;
  checkedAt?: Date;
  expectedHost?: string | null;
};

const sensitiveValuePatterns = [
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /DATABASE_URL\s*=\s*[^\s"']+/gi,
  /sb_[A-Za-z0-9_-]+/g,
  /service_role[A-Za-z0-9_-]*/gi,
  /salary\s*[:=]\s*\d+/gi,
  /national[_\s-]?id\s*[:=]\s*[A-Za-z0-9-]+/gi,
  /bank[_\s-]?account\s*[:=]\s*[A-Za-z0-9-]+/gi,
];

export function buildProductionPilotGateReport(
  options: ProductionPilotGateOptions,
): ProductionPilotGateReport {
  const checkedAt = options.checkedAt ?? new Date();
  const appUrl = options.appUrl.trim();
  const readinessUrl = tryBuildReadinessUrl(appUrl);
  const healthReport = options.healthReport ?? null;
  const checks = [
    checkProductionUrl(appUrl, options.expectedHost),
    checkReadinessPayload(healthReport),
    checkHealthStatus(healthReport),
    checkProductionEnvironment(healthReport),
    checkDatabaseReady(healthReport),
    checkNoSensitiveHealthLeak(healthReport),
  ];
  const nextActions = buildNextActions(checks, healthReport);

  return {
    status: checks.every((check) => check.passed) ? "ready" : "blocked",
    appUrl: safeUrl(appUrl),
    readinessUrl: safeUrl(readinessUrl),
    checkedAt: checkedAt.toISOString(),
    checks,
    nextActions,
  };
}

export function productionPilotGatePassed(report: ProductionPilotGateReport) {
  return report.status === "ready" && report.checks.every((check) => check.passed);
}

export function formatProductionPilotGateReport(report: ProductionPilotGateReport) {
  const lines = [
    `HR One production pilot gate: ${report.status}`,
    `App: ${report.appUrl}`,
    `Readiness: ${report.readinessUrl}`,
    `Checked at: ${report.checkedAt}`,
    "",
    "Checks:",
    ...report.checks.map((check) => {
      const status = check.passed ? "PASS" : "BLOCK";
      return `- [${status}] ${check.name}: ${redactSensitiveDetail(check.detail)}`;
    }),
  ];

  if (report.nextActions.length > 0) {
    lines.push("", "Next actions:");
    lines.push(...report.nextActions.map((action) => `- ${redactSensitiveDetail(action)}`));
  }

  return lines.join("\n");
}

export function buildReadinessUrl(appUrl: string) {
  const url = new URL(appUrl);
  url.pathname = "/api/health/ready";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function tryBuildReadinessUrl(appUrl: string) {
  try {
    return buildReadinessUrl(appUrl);
  } catch {
    return "[invalid-url]";
  }
}

export function redactSensitiveDetail(value: string) {
  return sensitiveValuePatterns.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value,
  );
}

function checkProductionUrl(appUrl: string, expectedHost?: string | null): ProductionPilotGateCheck {
  try {
    const url = new URL(appUrl);
    const expectedHostMatches = !expectedHost || url.hostname === expectedHost;
    const productionHost = !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
    const https = url.protocol === "https:";
    return check(
      "production URL",
      https && productionHost && expectedHostMatches,
      https && productionHost && expectedHostMatches
        ? `${url.hostname} is an HTTPS production host`
        : buildProductionUrlFailureDetail(url.hostname, https, productionHost, expectedHost ?? null),
    );
  } catch {
    return check("production URL", false, "app URL is not a valid absolute URL");
  }
}

function checkReadinessPayload(healthReport: HealthReport | null): ProductionPilotGateCheck {
  return check(
    "readiness payload",
    healthReport?.service === "hr-one" && Array.isArray(healthReport.checks),
    healthReport ? "readiness endpoint returned an HR One health report" : "readiness endpoint did not return JSON",
  );
}

function checkHealthStatus(healthReport: HealthReport | null): ProductionPilotGateCheck {
  const status = healthReport?.status;
  return check(
    "overall readiness",
    status === "ok",
    status ? `health status is ${status}` : "health status is missing",
  );
}

function checkProductionEnvironment(healthReport: HealthReport | null): ProductionPilotGateCheck {
  const environment = findCheck(healthReport, "environment");
  const productionReady =
    environment?.status === "ok" &&
    /production environment posture verified/i.test(environment.detail) &&
    !/non-production/i.test(environment.detail);
  return check(
    "production environment",
    productionReady,
    environment
      ? `${environment.status}: ${environment.detail}`
      : "environment check is missing from readiness report",
  );
}

function checkDatabaseReady(healthReport: HealthReport | null): ProductionPilotGateCheck {
  const database = findCheck(healthReport, "database");
  const databaseReady =
    database?.status === "ok" &&
    /database ping succeeded/i.test(database.detail) &&
    !/demo fallback/i.test(database.detail);
  return check(
    "production database",
    databaseReady,
    database ? `${database.status}: ${database.detail}` : "database check is missing from readiness report",
  );
}

function checkNoSensitiveHealthLeak(healthReport: HealthReport | null): ProductionPilotGateCheck {
  if (!healthReport) return check("health payload redaction", false, "readiness payload is missing");
  const serialized = JSON.stringify(healthReport);
  return check(
    "health payload redaction",
    !containsSensitiveDetail(serialized),
    containsSensitiveDetail(serialized)
      ? "readiness payload contains sensitive value patterns"
      : "readiness payload does not expose database URLs, Supabase keys, salary, national ID, or bank data",
  );
}

function buildNextActions(checks: ProductionPilotGateCheck[], healthReport: HealthReport | null) {
  const failed = new Set(checks.filter((check) => !check.passed).map((check) => check.name));
  const actions: string[] = [];

  if (failed.has("production URL")) {
    actions.push("Use the production HTTPS URL, for example https://hr.suiyuecare.com.");
  }
  if (failed.has("readiness payload") || failed.has("overall readiness")) {
    actions.push("Open /api/health/ready on the deployed app and fix any failed readiness check before pilot use.");
  }
  if (failed.has("production environment")) {
    actions.push("Set HR_ONE_ENV=production and the required HR_ONE_* production variables in Vercel Production.");
  }
  if (failed.has("production database")) {
    const database = findCheck(healthReport, "database");
    if (database?.detail.includes("demo fallback") || database?.detail.includes("database is required")) {
      actions.push("Set a server-side Supabase PostgreSQL DATABASE_URL with ?schema=hr_one in Vercel Production.");
    } else {
      actions.push("Fix the production PostgreSQL connection until the readiness database ping succeeds.");
    }
  }
  if (failed.has("health payload redaction")) {
    actions.push("Remove sensitive values from readiness responses before exposing production health endpoints.");
  }
  if (actions.length > 0) {
    actions.push("Redeploy production and rerun pnpm pilot:gate:production before starting the 20-50 person trial.");
  }

  return dedupe(actions);
}

function buildProductionUrlFailureDetail(
  hostname: string,
  https: boolean,
  productionHost: boolean,
  expectedHost: string | null,
) {
  const reasons = [
    https ? null : "requires HTTPS",
    productionHost ? null : "local hosts are not production",
    expectedHost && hostname !== expectedHost ? `expected host ${expectedHost}` : null,
  ].filter(Boolean);
  return reasons.length > 0 ? reasons.join("; ") : "invalid production URL";
}

function findCheck(healthReport: HealthReport | null, name: string) {
  return healthReport?.checks.find((item) => item.name === name);
}

function containsSensitiveDetail(value: string) {
  return sensitiveValuePatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

function check(name: string, passed: boolean, detail: string): ProductionPilotGateCheck {
  return {
    name,
    passed,
    detail: redactSensitiveDetail(detail),
  };
}

function dedupe(items: string[]) {
  return Array.from(new Set(items));
}
