import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  buildPilotEvidenceFolderReport,
  formatPilotEvidenceFolderMarkdown,
  pilotEvidenceFolderPassed,
  type PilotEvidenceFolderInputFile,
} from "../src/server/readiness/pilot-evidence-folder";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

const defaultEvidenceExtensions = new Set([".csv", ".json", ".md", ".txt"]);

function main() {
  const args = process.argv.slice(2);
  const pathArg = readArg(args, "--path") ?? readArg(args, "--dir");
  const output = readArg(args, "--output");
  const json = args.includes("--json");
  const recursive = args.includes("--recursive");
  if (!pathArg) throw new Error("Missing --path=<pilot-evidence-folder>.");

  const targetPath = resolve(pathArg);
  if (!existsSync(targetPath)) {
    throw new Error(`Evidence folder does not exist: ${redactSensitiveDetail(targetPath)}`);
  }

  const report = buildPilotEvidenceFolderReport({
    files: collectEvidenceFiles(targetPath, recursive),
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatPilotEvidenceFolderMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Evidence package output is redacted; share only when status is ready.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotEvidenceFolderPassed(report) ? 0 : 1);
}

function collectEvidenceFiles(path: string, recursive: boolean): PilotEvidenceFolderInputFile[] {
  const stats = statSync(path);
  if (stats.isFile()) {
    return shouldReadEvidenceFile(path)
      ? [{ path, content: readFileSync(path, "utf8") }]
      : [];
  }
  if (!stats.isDirectory()) return [];

  return readdirSync(path).flatMap((entry) => {
    const childPath = join(path, entry);
    const childStats = statSync(childPath);
    if (childStats.isDirectory()) {
      return recursive ? collectEvidenceFiles(childPath, recursive) : [];
    }
    if (!childStats.isFile() || !shouldReadEvidenceFile(childPath)) return [];
    return [{ path: childPath, content: readFileSync(childPath, "utf8") }];
  });
}

function shouldReadEvidenceFile(path: string) {
  if (basename(path).startsWith(".")) return false;
  return defaultEvidenceExtensions.has(extname(path).toLowerCase());
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pilot evidence package failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
}
