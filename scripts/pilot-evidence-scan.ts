import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  formatPilotEvidenceScanReport,
  pilotEvidenceScanPassed,
  scanPilotEvidenceFiles,
  type PilotEvidenceScanInputFile,
} from "../src/server/readiness/pilot-evidence-scan";

const defaultExtensions = new Set([".csv", ".json", ".md", ".txt"]);

function main() {
  const args = process.argv.slice(2);
  const pathArg = readArg(args, "--path") ?? readArg(args, "--dir") ?? readArg(args, "--file");
  const json = args.includes("--json");
  const recursive = args.includes("--recursive");
  if (!pathArg) throw new Error("Missing --path=<file-or-directory>.");

  const files = collectFiles(resolve(pathArg), recursive);
  const report = scanPilotEvidenceFiles(files);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatPilotEvidenceScanReport(report));
  }

  process.exit(pilotEvidenceScanPassed(report) ? 0 : 1);
}

function collectFiles(path: string, recursive: boolean): PilotEvidenceScanInputFile[] {
  const stats = statSync(path);
  if (stats.isFile()) {
    return shouldScanFile(path)
      ? [{ path, content: readFileSync(path, "utf8") }]
      : [];
  }
  if (!stats.isDirectory()) return [];

  return readdirSync(path).flatMap((entry) => {
    const childPath = join(path, entry);
    const childStats = statSync(childPath);
    if (childStats.isDirectory()) return recursive ? collectFiles(childPath, recursive) : [];
    if (!childStats.isFile() || !shouldScanFile(childPath)) return [];
    return [{ path: childPath, content: readFileSync(childPath, "utf8") }];
  });
}

function shouldScanFile(path: string) {
  if (basename(path).startsWith(".")) return false;
  return defaultExtensions.has(extname(path).toLowerCase());
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
