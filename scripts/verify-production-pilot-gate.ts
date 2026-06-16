import type { HealthReport, HealthStatus } from "../src/server/readiness/health";
import {
  buildProductionPilotGateReport,
  buildReadinessUrl,
  formatProductionPilotGateReport,
  productionPilotGatePassed,
  redactSensitiveDetail,
} from "../src/server/readiness/production-pilot-gate";

async function main() {
  const args = process.argv.slice(2);
  const appUrl =
    readArg(args, "--url") ??
    process.env.HR_ONE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://hr.suiyuecare.com";
  const expectedHost = readArg(args, "--expected-host") ?? new URL(appUrl).hostname;
  const timeoutMs = parsePositiveInteger(readArg(args, "--timeout-ms"), 10_000);
  const readinessUrl = buildReadinessUrl(appUrl);

  const healthReport = await fetchHealthReport(readinessUrl, timeoutMs);
  const report = buildProductionPilotGateReport({
    appUrl,
    expectedHost,
    healthReport,
  });

  console.log(formatProductionPilotGateReport(report));
  process.exit(productionPilotGatePassed(report) ? 0 : 1);
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
    console.error(`Readiness endpoint did not return a valid HR One health report. HTTP ${response.status}.`);
    return null;
  } catch (error) {
    console.error(`Readiness fetch failed: ${redactSensitiveDetail(errorMessage(error))}`);
    return null;
  } finally {
    clearTimeout(timeout);
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  console.error(`Production pilot gate failed unexpectedly: ${redactSensitiveDetail(errorMessage(error))}`);
  process.exit(1);
});
