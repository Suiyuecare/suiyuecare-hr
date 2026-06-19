import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HealthReport, HealthStatus } from "../src/server/readiness/health";
import { buildEnvironmentVerificationReport } from "../src/server/readiness/environment-verification";
import {
  buildPilotDoctorReport,
  formatPilotDoctorReport,
  pilotDoctorPassed,
  type PilotDoctorExternalCheck,
  type PilotDoctorLocalEnvDraft,
} from "../src/server/readiness/pilot-doctor";
import {
  buildProductionPilotGateReport,
  buildReadinessUrl,
  redactSensitiveDetail,
} from "../src/server/readiness/production-pilot-gate";
import { getUnresolvedEnvPlaceholderKeys } from "../src/server/readiness/vercel-production-env-draft";
import { parseEnvFile } from "../src/server/readiness/vercel-production-env";

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
  const skipLocalEnv = args.includes("--skip-local-env");
  const envFile = resolve(readArg(args, "--env-file") ?? ".env.vercel.production");
  const json = args.includes("--json");

  const [healthReport, vercelEnvInspection, supabasePilot, localEnvDraft] = await Promise.all([
    fetchHealthReport(buildReadinessUrl(appUrl), timeoutMs),
    Promise.resolve(readVercelProductionEnvInspection()),
    Promise.resolve(skipSupabase ? {
      status: "skipped" as const,
      detail: "Supabase pilot verification skipped by --skip-supabase.",
    } : verifySupabasePilot(projectRef, schemaName)),
    Promise.resolve(skipLocalEnv
      ? {
          status: "skipped" as const,
          detail: "Local env draft check skipped by --skip-local-env.",
        }
      : inspectLocalEnvDraft(envFile)),
  ]);
  const productionGate = buildProductionPilotGateReport({
    appUrl,
    expectedHost,
    healthReport,
  });
  const report = buildPilotDoctorReport({
    productionGate,
    vercelEnvNames: vercelEnvInspection.names,
    vercelEnvInspection: vercelEnvInspection.check,
    supabasePilot,
    localEnvDraft,
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

function readVercelProductionEnvInspection(): {
  names: string[];
  check: PilotDoctorExternalCheck;
} {
  try {
    const names = readVercelProductionEnvNames();
    return {
      names,
      check: {
        status: "passed",
        detail: `${names.length} Vercel production env key(s) are readable.`,
      },
    };
  } catch (error) {
    return {
      names: [],
      check: {
        status: "failed",
        detail: `Unable to read Vercel production env keys: ${redactSensitiveDetail(errorMessage(error))}`,
      },
    };
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
    detail: summarizeSupabasePilotFailure(projectRef, schemaName, [
      `pilot seed verification failed for Supabase project ${projectRef}, schema ${schemaName}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join("\n")),
  };
}

function summarizeSupabasePilotFailure(projectRef: string, schemaName: string, detail: string) {
  const redacted = redactSensitiveDetail(detail);
  if (/IPv6 is not supported|no[-\s]?route|Supabase CLI could not reach/i.test(redacted)) {
    return [
      `pilot seed verification could not reach Supabase project ${projectRef}, schema ${schemaName}.`,
      "Supabase CLI reported an IPv6/no-route database network failure.",
      `Run supabase link --project-ref ${projectRef} to set up the CLI connection, or rerun verification from a network path that can reach the Supabase database host.`,
    ].join(" ");
  }
  return redacted;
}

function inspectLocalEnvDraft(envFile: string): PilotDoctorLocalEnvDraft {
  if (!existsSync(envFile)) {
    return {
      status: "missing",
      detail: `${envFile} does not exist`,
    };
  }

  try {
    const env = parseEnvFile(readFileSync(envFile, "utf8"));
    const unresolvedPlaceholderKeys = getUnresolvedEnvPlaceholderKeys(env);
    const verification = buildEnvironmentVerificationReport(env, "production");
    const failedCheckNames = verification.checks.filter((check) => !check.passed).map((check) => check.name);
    const ready = unresolvedPlaceholderKeys.length === 0 && failedCheckNames.length === 0;
    return {
      status: ready ? "ready" : "blocked",
      detail: ready
        ? `${envFile} is ready for pnpm vercel:apply-production-env dry-run`
        : `${envFile} has ${unresolvedPlaceholderKeys.length} unresolved placeholder key(s) and ${failedCheckNames.length} failed verifier check(s)`,
      unresolvedPlaceholderKeys,
      failedCheckNames,
    };
  } catch (error) {
    return {
      status: "blocked",
      detail: `Unable to inspect ${envFile}: ${redactSensitiveDetail(errorMessage(error))}`,
    };
  }
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
