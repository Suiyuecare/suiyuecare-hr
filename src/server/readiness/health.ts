import { getDb } from "@/server/db/client";
import { getDemoAuthRuntimeStatus } from "@/server/auth/demo-mode";
import {
  buildEnvironmentVerificationReport,
  environmentVerificationPassed,
} from "@/server/readiness/environment-verification";

export type HealthStatus = "ok" | "degraded" | "fail";

export type HealthReport = {
  status: HealthStatus;
  service: "hr-one";
  timestamp: string;
  checks: Array<{
    name: string;
    status: HealthStatus;
    detail: string;
  }>;
};

export type HealthOptions = {
  now?: Date;
  env?: Record<string, string | undefined>;
  pingDatabase?: () => Promise<boolean>;
};

export function getLiveHealth(options: HealthOptions = {}): HealthReport {
  return {
    status: "ok",
    service: "hr-one",
    timestamp: (options.now ?? new Date()).toISOString(),
    checks: [
      {
        name: "process",
        status: "ok",
        detail: "server process is running",
      },
    ],
  };
}

export async function getReadyHealth(options: HealthOptions = {}): Promise<HealthReport> {
  const env = options.env ?? process.env;
  const production = env.HR_ONE_ENV === "production";
  const checks: HealthReport["checks"] = [];

  if (production) {
    const envReport = buildEnvironmentVerificationReport(env, "production");
    checks.push({
      name: "environment",
      status: environmentVerificationPassed(envReport) ? "ok" : "fail",
      detail: environmentVerificationPassed(envReport)
        ? "production environment posture verified"
        : "production environment verification failed",
    });
  } else {
    checks.push({
      name: "environment",
      status: "ok",
      detail: "non-production environment",
    });
  }

  if (env.DATABASE_URL) {
    const databaseOk = await (options.pingDatabase ?? pingDatabase)();
    checks.push({
      name: "database",
      status: databaseOk ? "ok" : "fail",
      detail: databaseOk ? "database ping succeeded" : buildDatabaseFailureDetail(env.DATABASE_URL),
    });
  } else {
    checks.push({
      name: "database",
      status: production ? "fail" : "degraded",
      detail: production ? "database is required in production" : "database not configured; demo fallback available",
    });
  }

  const demoAuthStatus = getDemoAuthRuntimeStatus(env);
  checks.push({
    name: "demo auth",
    status: production
      ? demoAuthStatus.allowed ? "fail" : "ok"
      : demoAuthStatus.allowed ? "ok" : "degraded",
    detail: production
      ? demoAuthStatus.allowed
        ? "demo auth is still enabled in production"
        : "demo auth disabled for production runtime"
      : demoAuthStatus.reason,
  });

  const status = summarizeStatus(checks.map((check) => check.status));
  return {
    status,
    service: "hr-one",
    timestamp: (options.now ?? new Date()).toISOString(),
    checks,
  };
}

export function healthHttpStatus(report: HealthReport) {
  return report.status === "fail" ? 503 : 200;
}

async function pingDatabase() {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function buildDatabaseFailureDetail(databaseUrl: string) {
  const connectionPosture = classifyDatabaseConnection(databaseUrl);
  if (connectionPosture === "supabase-direct") {
    return "database ping failed; Supabase direct database hosts require IPv6 or the IPv4 add-on, so Vercel/serverless deployments should use a compatible pooler URL or enable IPv4.";
  }
  if (connectionPosture === "supabase-pooler") {
    return "database ping failed; verify Supabase pooler username, password, mode, schema, and prepared-statement settings.";
  }
  return "database ping failed";
}

function classifyDatabaseConnection(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = url.port || "5432";
    if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(host) && port === "5432") {
      return "supabase-direct";
    }
    if (/\.pooler\.supabase\.com$/i.test(host)) {
      return "supabase-pooler";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

function summarizeStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("degraded")) return "degraded";
  return "ok";
}
