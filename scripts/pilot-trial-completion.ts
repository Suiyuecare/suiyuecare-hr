import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { buildHrOneKpis } from "../src/server/kpis/hr-one";
import { getHrOneKpis } from "../src/server/kpis/hr-one";
import {
  betaPilotCheckpointIds,
  getBetaPilotCheckpointCoverage,
  type BetaPilotCheckpointCoverage,
} from "../src/server/readiness/beta-pilot-checkpoints";
import { getDb } from "../src/server/db/client";
import {
  scanPilotEvidenceFiles,
  type PilotEvidenceScanInputFile,
  type PilotEvidenceScanReport,
} from "../src/server/readiness/pilot-evidence-scan";
import {
  buildPilotTrialCompletionReport,
  formatPilotTrialCompletionMarkdown,
  pilotTrialCompletionPassed,
} from "../src/server/readiness/pilot-trial-completion";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

const defaultEvidenceExtensions = new Set([".csv", ".json", ".md", ".txt"]);

async function main() {
  const args = process.argv.slice(2);
  const tenantSlug = readArg(args, "--tenant-slug");
  const companyId = readArg(args, "--company-id");
  const output = readArg(args, "--output");
  const json = args.includes("--json");
  const skipEvidenceScan = args.includes("--skip-evidence-scan");
  if (!tenantSlug) throw new Error("Missing --tenant-slug=<customer-slug>.");

  const context = await readTenantCompanyContext(tenantSlug, companyId);
  const checkpoints = context
    ? await getBetaPilotCheckpointCoverage(context)
    : emptyCheckpointCoverage();
  const kpis = context
    ? await getHrOneKpis(context)
    : buildHrOneKpis({
        averageLeaveSuccessSeconds: null,
        averageManagerApprovalSeconds: null,
        employeeMobileCompletionPercent: null,
        hrSelfServeFormPercent: null,
        eventCount: 0,
      }, { auditEventCount: 0 });
  const evidenceScan = maybeBuildEvidenceScan(args, skipEvidenceScan);
  const report = buildPilotTrialCompletionReport({
    checkpoints,
    kpis,
    evidenceScan,
    evidenceScanRequired: !skipEvidenceScan,
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatPilotTrialCompletionMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Trial completion output is redacted; keep raw pilot evidence in approved secure storage.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotTrialCompletionPassed(report) ? 0 : 1);
}

async function readTenantCompanyContext(tenantSlug: string, companyId: string | null) {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("REPLACE_WITH_")) {
    return null;
  }
  const tenant = await getDb().tenant.findUnique({
    where: { slug: tenantSlug.trim() },
    include: {
      companies: companyId ? { where: { id: companyId } } : { take: 1 },
    },
  });
  const company = tenant?.companies[0] ?? null;
  if (!tenant || !company) return null;
  return {
    role: "owner" as const,
    tenantId: tenant.id,
    companyId: company.id,
    user: { id: "pilot-trial-completion-cli", displayName: "Pilot Trial Completion CLI" },
    employee: null,
  };
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

function shouldScanEvidenceFile(path: string) {
  if (basename(path).startsWith(".")) return false;
  return defaultEvidenceExtensions.has(extname(path).toLowerCase());
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

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pilot trial completion failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
