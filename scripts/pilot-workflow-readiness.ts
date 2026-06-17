import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  betaPilotCheckpointIds,
  getBetaPilotCheckpointCoverage,
  type BetaPilotCheckpointCoverage,
} from "../src/server/readiness/beta-pilot-checkpoints";
import { getDb } from "../src/server/db/client";
import type { PilotAcceptanceReport } from "../src/server/readiness/pilot-acceptance";
import {
  buildPilotWorkflowReadinessReport,
  formatPilotWorkflowReadinessMarkdown,
  pilotWorkflowReadinessPassed,
} from "../src/server/readiness/pilot-workflow-readiness";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const output = readArg(args, "--output");
  const tenantSlug = readArg(args, "--tenant-slug");
  const acceptance = runPilotAcceptance(args);
  const checkpoints = tenantSlug
    ? await readCheckpointCoverage(tenantSlug, readArg(args, "--company-id"))
    : emptyCheckpointCoverage();
  const report = buildPilotWorkflowReadinessReport({
    acceptance,
    checkpoints,
    requireProductionEvidence: args.includes("--require-production-evidence"),
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatPilotWorkflowReadinessMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Workflow readiness output is redacted; keep raw pilot evidence in approved secure storage.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotWorkflowReadinessPassed(report) ? 0 : 1);
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
  if (!parsed || !Array.isArray(parsed.items) || typeof parsed.readyToStart !== "boolean") {
    throw new Error("pilot:acceptance did not return a valid report.");
  }
  return parsed;
}

async function readCheckpointCoverage(
  tenantSlug: string,
  companyId: string | null,
): Promise<BetaPilotCheckpointCoverage[]> {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("REPLACE_WITH_")) {
    return emptyCheckpointCoverage();
  }
  const tenant = await getDb().tenant.findUnique({
    where: { slug: tenantSlug.trim() },
    include: {
      companies: companyId ? { where: { id: companyId } } : { take: 1 },
    },
  });
  const company = tenant?.companies[0] ?? null;
  if (!tenant || !company) return emptyCheckpointCoverage();
  return getBetaPilotCheckpointCoverage({
    role: "owner",
    tenantId: tenant.id,
    companyId: company.id,
    user: { id: "pilot-workflow-readiness-cli", displayName: "Pilot Workflow Readiness CLI" },
    employee: null,
  });
}

function emptyCheckpointCoverage(): BetaPilotCheckpointCoverage[] {
  return betaPilotCheckpointIds.map((checkpointId) => ({
    checkpointId,
    latestStatus: "not_started",
    evidenceTypes: [],
    recordedCount: 0,
    latestRecordedAt: null,
  }));
}

function forwardArg(args: string[], name: string) {
  const value = readArg(args, name);
  return value ? [`${name}=${value}`] : [];
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
  console.error(`Pilot workflow readiness failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
