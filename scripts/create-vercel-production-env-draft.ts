import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVercelProductionEnvDraft,
  draftHasUnresolvedPlaceholders,
} from "../src/server/readiness/vercel-production-env-draft";

function main() {
  const args = process.argv.slice(2);
  const outputPath = resolve(readArg(args, "--output") ?? ".env.vercel.production");
  const force = args.includes("--force");

  if (existsSync(outputPath) && !force) {
    throw new Error(`Refusing to overwrite existing file: ${outputPath}. Pass --force to regenerate it.`);
  }

  const text = buildVercelProductionEnvDraft();
  writeFileSync(outputPath, text, { encoding: "utf8", mode: 0o600 });

  console.log(`Created ${outputPath}.`);
  console.log("Generated strong local secrets without printing them.");
  if (draftHasUnresolvedPlaceholders(text)) {
    console.log("Replace all REPLACE_WITH_* placeholders before running pnpm vercel:apply-production-env.");
  }
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
