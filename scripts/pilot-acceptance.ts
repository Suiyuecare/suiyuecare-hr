import { spawnSync } from "node:child_process";
import type { BetaPilotRehearsalReport } from "../src/server/readiness/beta-pilot-rehearsal";
import { runBetaPilotRehearsal } from "../src/server/readiness/beta-pilot-rehearsal";
import {
  buildPilotAcceptanceReport,
  formatPilotAcceptanceReport,
  type PilotAcceptanceCohort,
  type PilotAcceptanceFinalReview,
  type PilotAcceptanceRehearsalEvidence,
} from "../src/server/readiness/pilot-acceptance";
import {
  readPilotCohortFromDatabase,
  unknownCohort,
} from "../src/server/readiness/pilot-cohort";
import type { PilotDoctorReport } from "../src/server/readiness/pilot-doctor";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const skipDemoRehearsal = args.includes("--skip-demo-rehearsal");
  const doctor = runPilotDoctor(args);
  const rehearsal = skipDemoRehearsal
    ? notRunRehearsal()
    : mapRehearsal(await runDemoRehearsal());
  const report = buildPilotAcceptanceReport({
    doctor,
    cohort: await readCohort(args),
    rehearsal,
    finalReview: parseFinalReview(args),
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatPilotAcceptanceReport(report));
  }
  process.exit(report.readyToStart ? 0 : 1);
}

function runPilotDoctor(args: string[]): PilotDoctorReport {
  const forwardedArgs = [
    "pilot:doctor",
    "--",
    "--json",
    ...forwardArg(args, "--url"),
    ...forwardArg(args, "--expected-host"),
    ...forwardArg(args, "--project-ref"),
    ...forwardArg(args, "--schema"),
    ...forwardArg(args, "--env-file"),
    ...(args.includes("--skip-supabase") ? ["--skip-supabase"] : []),
    ...(args.includes("--skip-local-env") ? ["--skip-local-env"] : []),
  ];
  const result = spawnSync("pnpm", forwardedArgs, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  const parsed = JSON.parse(extractFirstJsonObject(result.stdout)) as PilotDoctorReport;
  if (!parsed || !Array.isArray(parsed.checks)) {
    throw new Error("pilot:doctor did not return a valid report.");
  }
  return parsed;
}

async function runDemoRehearsal(): Promise<BetaPilotRehearsalReport> {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    return await runBetaPilotRehearsal({
      role: "hr_admin",
      tenantId: null,
      companyId: null,
      user: { id: "pilot-acceptance-cli", displayName: "Pilot Acceptance CLI" },
      employee: null,
    });
  } finally {
    if (previousDatabaseUrl) {
      process.env.DATABASE_URL = previousDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
}

function mapRehearsal(report: BetaPilotRehearsalReport): PilotAcceptanceRehearsalEvidence {
  return {
    status: report.status,
    stepIds: report.steps.map((step) => step.id),
    sensitiveValuesReturned: report.sensitiveValuesReturned,
  };
}

function notRunRehearsal(): PilotAcceptanceRehearsalEvidence {
  return {
    status: "not_run",
    stepIds: [],
    sensitiveValuesReturned: null,
  };
}

function parseCohort(args: string[]): PilotAcceptanceCohort {
  const source = readArg(args, "--cohort-source") ?? "synthetic";
  if (source !== "real_customer" && source !== "synthetic" && source !== "unknown") {
    throw new Error("Unsupported --cohort-source. Use real_customer, synthetic, or unknown.");
  }
  return {
    source,
    employeeCount: readIntegerArg(args, "--employee-count") ?? (source === "synthetic" ? 25 : null),
    managerCount: readIntegerArg(args, "--manager-count") ?? (source === "synthetic" ? 3 : null),
  };
}

async function readCohort(args: string[]): Promise<PilotAcceptanceCohort> {
  const tenantSlug = readArg(args, "--tenant-slug");
  if (!tenantSlug) return parseCohort(args);
  try {
    return await readPilotCohortFromDatabase({
      tenantSlug,
      companyId: readArg(args, "--company-id"),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Could not read pilot cohort from database: ${redactSensitiveDetail(message)}`);
    return unknownCohort();
  }
}

function parseFinalReview(args: string[]): PilotAcceptanceFinalReview {
  const status = readArg(args, "--final-review") ?? "not_run";
  if (status !== "verified" && status !== "action_required" && status !== "blocked" && status !== "not_run") {
    throw new Error("Unsupported --final-review. Use verified, action_required, blocked, or not_run.");
  }
  return { status };
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pilot acceptance failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
