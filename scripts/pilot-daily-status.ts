import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PilotAcceptanceReport } from "../src/server/readiness/pilot-acceptance";
import {
  buildPilotDailyStatusReport,
  formatPilotDailyStatusMarkdown,
  pilotDailyStatusPassed,
} from "../src/server/readiness/pilot-daily-status";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const output = readArg(args, "--output");
  const day = readIntegerArg(args, "--day") ?? 0;
  const acceptance = runPilotAcceptance(args);
  const report = buildPilotDailyStatusReport({ acceptance, day });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatPilotDailyStatusMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Daily status is redacted; still review before sharing outside the pilot team.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotDailyStatusPassed(report) ? 0 : 1);
}

function runPilotAcceptance(args: string[]): PilotAcceptanceReport {
  const forwardedArgs = [
    "pilot:acceptance",
    "--",
    "--json",
    ...forwardArg(args, "--url"),
    ...forwardArg(args, "--expected-host"),
    ...forwardArg(args, "--project-ref"),
    ...forwardArg(args, "--schema"),
    ...forwardArg(args, "--env-file"),
    ...forwardArg(args, "--tenant-slug"),
    ...forwardArg(args, "--company-id"),
    ...forwardArg(args, "--cohort-source"),
    ...forwardArg(args, "--employee-count"),
    ...forwardArg(args, "--manager-count"),
    ...forwardArg(args, "--final-review"),
    ...(args.includes("--skip-supabase") ? ["--skip-supabase"] : []),
    ...(args.includes("--skip-local-env") ? ["--skip-local-env"] : []),
    ...(args.includes("--skip-demo-rehearsal") ? ["--skip-demo-rehearsal"] : []),
  ];
  const result = spawnSync("pnpm", forwardedArgs, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  });
  const parsed = JSON.parse(extractFirstJsonObject(result.stdout)) as PilotAcceptanceReport;
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error("pilot:acceptance did not return a valid report.");
  }
  return parsed;
}

function forwardArg(args: string[], name: string) {
  const value = readArg(args, name);
  return value ? [`${name}=${value}`] : [];
}

function readIntegerArg(args: string[], name: string) {
  const value = readArg(args, name);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function extractFirstJsonObject(output: string): string {
  const start = output.indexOf("{");
  if (start < 0) throw new Error(`Command did not return JSON output: ${redactSensitiveDetail(output)}`);

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

main();
