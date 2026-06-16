import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildPilotImportTemplatePack } from "../src/server/readiness/pilot-import-template";

function main() {
  const args = process.argv.slice(2);
  const outputDir = resolve(readArg(args, "--output") ?? "/tmp/hr-one-pilot-import-template");
  const cohortSize = parseIntegerArg(args, "--cohort-size") ?? 25;
  const force = args.includes("--force");

  if (existsSync(outputDir) && !force) {
    throw new Error(`Refusing to write into existing directory: ${outputDir}. Pass --force to refresh it.`);
  }

  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const pack = buildPilotImportTemplatePack({ cohortSize });

  for (const file of pack.files) {
    writeFileSync(join(outputDir, file.path), file.content, { encoding: "utf8", mode: 0o600 });
  }

  console.log(`Created HR One pilot import template pack in ${outputDir}.`);
  console.log(`Files: ${pack.files.map((file) => file.path).join(", ")}`);
  console.log("All generated rows are synthetic samples. Replace them with secure customer source data before importing.");
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function parseIntegerArg(args: string[], name: string) {
  const value = readArg(args, name);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

main();
