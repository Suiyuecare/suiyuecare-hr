import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  betaPilotCheckpointIds,
  getBetaPilotCheckpointCoverage,
  type BetaPilotCheckpointCoverage,
} from "../src/server/readiness/beta-pilot-checkpoints";
import { getDb } from "../src/server/db/client";
import type { PilotAcceptanceReport } from "../src/server/readiness/pilot-acceptance";
import { buildPilotDailyStatusReport } from "../src/server/readiness/pilot-daily-status";
import {
  scanPilotEvidenceFiles,
  type PilotEvidenceScanInputFile,
  type PilotEvidenceScanReport,
} from "../src/server/readiness/pilot-evidence-scan";
import {
  buildPilotInviteReadinessReport,
  readPilotInviteReadinessSnapshotFromDatabase,
  type PilotInviteReadinessReport,
} from "../src/server/readiness/pilot-invite-readiness";
import {
  buildPilotGoNoGoReport,
  formatPilotGoNoGoMarkdown,
  pilotGoNoGoPassed,
} from "../src/server/readiness/pilot-go-no-go";
import {
  buildPilotImportPreflightReport,
  type PilotImportPreflightReport,
} from "../src/server/readiness/pilot-import-preflight";
import {
  buildPilotWorkflowReadinessReport,
  type PilotWorkflowReadinessReport,
} from "../src/server/readiness/pilot-workflow-readiness";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

const defaultEvidenceExtensions = new Set([".csv", ".json", ".md", ".txt"]);

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const output = readArg(args, "--output");
  const skipImportPreflight = args.includes("--skip-import-preflight");
  const skipInviteReadiness = args.includes("--skip-invite-readiness");
  const skipWorkflowReadiness = args.includes("--skip-workflow-readiness");
  const skipEvidenceScan = args.includes("--skip-evidence-scan");
  const acceptance = runPilotAcceptance(args);
  const day0 = buildPilotDailyStatusReport({
    acceptance,
    day: 0,
  });
  const importPreflight = maybeBuildImportPreflight(args, skipImportPreflight);
  const inviteReadiness = await maybeBuildInviteReadiness(args, skipInviteReadiness);
  const workflowReadiness = await maybeBuildWorkflowReadiness(args, acceptance, skipWorkflowReadiness);
  const evidenceScan = maybeBuildEvidenceScan(args, skipEvidenceScan);
  const report = buildPilotGoNoGoReport({
    acceptance,
    day0,
    importPreflight,
    inviteReadiness,
    workflowReadiness,
    evidenceScan,
    importPreflightRequired: !skipImportPreflight,
    inviteReadinessRequired: !skipInviteReadiness,
    workflowReadinessRequired: !skipWorkflowReadiness,
    evidenceScanRequired: !skipEvidenceScan,
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatPilotGoNoGoMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Go/no-go output is redacted; keep raw CSV files and private evidence in approved secure storage.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotGoNoGoPassed(report) ? 0 : 1);
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
    maxBuffer: 1024 * 1024 * 20,
  });
  const parsed = JSON.parse(extractFirstJsonObject(result.stdout)) as PilotAcceptanceReport;
  if (!parsed || !Array.isArray(parsed.items) || typeof parsed.readyToStart !== "boolean") {
    throw new Error("pilot:acceptance did not return a valid report.");
  }
  return parsed;
}

function maybeBuildImportPreflight(
  args: string[],
  skipped: boolean,
): PilotImportPreflightReport | null {
  if (skipped) return null;
  const employeeCsvPath = readArg(args, "--employee-csv");
  const identityCsvPath = readArg(args, "--identity-csv");
  const payrollCsvPath = readArg(args, "--payroll-csv");
  if (!employeeCsvPath || !identityCsvPath || !payrollCsvPath) return null;

  return buildPilotImportPreflightReport({
    employeeCsv: readFileSync(resolve(employeeCsvPath), "utf8"),
    identityCsv: readFileSync(resolve(identityCsvPath), "utf8"),
    payrollCsv: readFileSync(resolve(payrollCsvPath), "utf8"),
  });
}

async function maybeBuildInviteReadiness(
  args: string[],
  skipped: boolean,
): Promise<PilotInviteReadinessReport | null> {
  if (skipped) return null;
  const tenantSlug = readArg(args, "--tenant-slug");
  if (!tenantSlug) return null;
  const snapshot = await readPilotInviteReadinessSnapshotFromDatabase({
    tenantSlug,
    companyId: readArg(args, "--company-id"),
  });
  return buildPilotInviteReadinessReport({ snapshot });
}

async function maybeBuildWorkflowReadiness(
  args: string[],
  acceptance: PilotAcceptanceReport,
  skipped: boolean,
): Promise<PilotWorkflowReadinessReport | null> {
  if (skipped) return null;
  const tenantSlug = readArg(args, "--tenant-slug");
  const checkpoints = tenantSlug
    ? await readCheckpointCoverage(tenantSlug, readArg(args, "--company-id"))
    : emptyCheckpointCoverage();
  return buildPilotWorkflowReadinessReport({
    acceptance,
    checkpoints,
    requireProductionEvidence: args.includes("--require-workflow-production-evidence"),
  });
}

function maybeBuildEvidenceScan(args: string[], skipped: boolean): PilotEvidenceScanReport | null {
  if (skipped) return null;
  const pathArg = readArg(args, "--evidence-path") ?? readArg(args, "--path") ?? readArg(args, "--dir");
  if (!pathArg) return null;
  const targetPath = resolve(pathArg);
  if (!existsSync(targetPath)) {
    throw new Error(`Evidence path does not exist: ${redactSensitiveDetail(targetPath)}`);
  }
  return scanPilotEvidenceFiles(collectEvidenceFiles(targetPath, args.includes("--recursive")));
}

function collectEvidenceFiles(path: string, recursive: boolean): PilotEvidenceScanInputFile[] {
  const stats = statSync(path);
  if (stats.isFile()) {
    return shouldScanEvidenceFile(path)
      ? [{ path, content: readFileSync(path, "utf8") }]
      : [];
  }
  if (!stats.isDirectory()) return [];

  return readdirSync(path).flatMap((entry) => {
    const childPath = join(path, entry);
    const childStats = statSync(childPath);
    if (childStats.isDirectory()) return recursive ? collectEvidenceFiles(childPath, recursive) : [];
    if (!childStats.isFile() || !shouldScanEvidenceFile(childPath)) return [];
    return [{ path: childPath, content: readFileSync(childPath, "utf8") }];
  });
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
    user: { id: "pilot-go-no-go-cli", displayName: "Pilot Go/No-Go CLI" },
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

function shouldScanEvidenceFile(path: string) {
  if (basename(path).startsWith(".")) return false;
  return defaultEvidenceExtensions.has(extname(path).toLowerCase());
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
  console.error(`Pilot go/no-go failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
