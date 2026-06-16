import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPilotImportPreflightReport,
  formatPilotImportPreflightMarkdown,
  pilotImportPreflightPassed,
} from "../src/server/readiness/pilot-import-preflight";

function main() {
  const args = process.argv.slice(2);
  const employeeCsvPath = readArg(args, "--employee-csv");
  const identityCsvPath = readArg(args, "--identity-csv");
  const payrollCsvPath = readArg(args, "--payroll-csv");
  const output = readArg(args, "--output");
  const json = args.includes("--json");

  if (!employeeCsvPath) throw new Error("Missing --employee-csv=<path>.");
  if (!identityCsvPath) throw new Error("Missing --identity-csv=<path>.");
  if (!payrollCsvPath) throw new Error("Missing --payroll-csv=<path>.");

  const report = buildPilotImportPreflightReport({
    employeeCsv: readFileSync(resolve(employeeCsvPath), "utf8"),
    identityCsv: readFileSync(resolve(identityCsvPath), "utf8"),
    payrollCsv: readFileSync(resolve(payrollCsvPath), "utf8"),
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatPilotImportPreflightMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Preflight output is redacted; review completed CSV files only through approved secure channels.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotImportPreflightPassed(report) ? 0 : 1);
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
