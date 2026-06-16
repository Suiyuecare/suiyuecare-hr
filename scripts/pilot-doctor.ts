import { spawnSync } from "node:child_process";
import type { HealthReport, HealthStatus } from "../src/server/readiness/health";
import {
  buildPilotDoctorReport,
  formatPilotDoctorReport,
  pilotDoctorPassed,
} from "../src/server/readiness/pilot-doctor";
import {
  buildProductionPilotGateReport,
  buildReadinessUrl,
  redactSensitiveDetail,
} from "../src/server/readiness/production-pilot-gate";

type VercelEnvList = {
  envs?: unknown[];
};

async function main() {
  const args = process.argv.slice(2);
  const appUrl =
    readArg(args, "--url") ??
    process.env.HR_ONE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://hr.suiyuecare.com";
  const expectedHost = readArg(args, "--expected-host") ?? new URL(appUrl).hostname;
  const timeoutMs = parsePositiveInteger(readArg(args, "--timeout-ms"), 10_000);
  const projectRef = readArg(args, "--project-ref") ?? process.env.SUPABASE_PROJECT_REF ?? "aruncclorusswpfnpgsn";
  const schemaName = readArg(args, "--schema") ?? "hr_one";
  const skipSupabase = args.includes("--skip-supabase");
  const json = args.includes("--json");

  const [healthReport, vercelEnvNames, supabasePilot] = await Promise.all([
    fetchHealthReport(buildReadinessUrl(appUrl), timeoutMs),
    Promise.resolve(readVercelProductionEnvNames()),
    Promise.resolve(skipSupabase ? {
      status: "skipped" as const,
      detail: "Supabase pilot verification skipped by --skip-supabase.",
    } : verifySupabasePilot(projectRef, schemaName)),
  ]);
  const productionGate = buildProductionPilotGateReport({
    appUrl,
    expectedHost,
    healthReport,
  });
  const report = buildPilotDoctorReport({
    productionGate,
    vercelEnvNames,
    supabasePilot,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatPilotDoctorReport(report));
  }
  process.exit(pilotDoctorPassed(report) ? 0 : 1);
}

async function fetchHealthReport(readinessUrl: string, timeoutMs: number): Promise<HealthReport | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(readinessUrl, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (isHealthReport(parsed)) return parsed;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readVercelProductionEnvNames() {
  const result = spawnSync("pnpm", ["dlx", "vercel@latest", "env", "ls", "production", "--format", "json"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 5,
  });
  if (result.status !== 0) {
    throw new Error([
      "Unable to read Vercel production env keys.",
      redactSensitiveDetail(result.stdout.trim()),
      redactSensitiveDetail(result.stderr.trim()),
    ].filter(Boolean).join("\n"));
  }

  const parsed = JSON.parse(extractFirstJsonObject(result.stdout)) as VercelEnvList;
  return Array.from(new Set((parsed.envs ?? []).map(readVercelEnvName).filter(isString))).sort();
}

function verifySupabasePilot(projectRef: string, schemaName: string) {
  const result = spawnSync("pnpm", [
    "db:supabase:seed-pilot",
    "--",
    `--project-ref=${projectRef}`,
    `--schema=${schemaName}`,
    "--verify-only",
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
    env: {
      ...process.env,
      SUPABASE_CLI: process.env.SUPABASE_CLI ?? "supabase",
    },
  });

  if (result.status === 0) {
    return {
      status: "passed" as const,
      detail: `pilot seed verified in Supabase project ${projectRef}, schema ${schemaName}`,
    };
  }

  return {
    status: "failed" as const,
    detail: redactSensitiveDetail([
      `pilot seed verification failed for Supabase project ${projectRef}, schema ${schemaName}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join("\n")),
  };
}

function isHealthReport(value: unknown): value is HealthReport {
  if (!isRecord(value)) return false;
  if (value.service !== "hr-one") return false;
  if (!isHealthStatus(value.status)) return false;
  if (typeof value.timestamp !== "string") return false;
  if (!Array.isArray(value.checks)) return false;
  return value.checks.every((item) => {
    if (!isRecord(item)) return false;
    return typeof item.name === "string" && isHealthStatus(item.status) && typeof item.detail === "string";
  });
}

function isHealthStatus(value: unknown): value is HealthStatus {
  return value === "ok" || value === "degraded" || value === "fail";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readVercelEnvName(value: unknown) {
  if (!isRecord(value)) return null;
  const key = value.key ?? value.name;
  return typeof key === "string" ? key : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function extractFirstJsonObject(output: string): string {
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Command did not return JSON output.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return output.slice(start, index + 1);
    }
  }

  throw new Error("Could not parse JSON output.");
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

main().catch((error: unknown) => {
  console.error(`Pilot doctor failed unexpectedly: ${redactSensitiveDetail(errorMessage(error))}`);
  process.exit(1);
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
