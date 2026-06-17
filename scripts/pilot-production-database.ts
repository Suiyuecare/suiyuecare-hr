import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatProductionDatabaseRemediationMarkdown,
  getProductionDatabaseRemediationReport,
} from "../src/server/readiness/production-database-remediation";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

async function main() {
  const args = process.argv.slice(2);
  const appUrl =
    readArg(args, "--url") ??
    process.env.HR_ONE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://hr.suiyuecare.com";
  const expectedHost = readArg(args, "--expected-host") ?? new URL(appUrl).hostname;
  const timeoutMs = parsePositiveInteger(readArg(args, "--timeout-ms"), 5000);
  const output = readArg(args, "--output");
  const json = args.includes("--json");
  const report = await getProductionDatabaseRemediationReport({
    appUrl,
    expectedHost,
    timeoutMs,
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatProductionDatabaseRemediationMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Production database report is redacted; keep DATABASE_URL and secret values outside reports.");
  } else {
    process.stdout.write(content);
  }

  process.exit(report.status === "ready" ? 0 : 1);
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
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Production database gate failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
