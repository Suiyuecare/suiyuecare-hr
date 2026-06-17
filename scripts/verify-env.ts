import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildEnvironmentVerificationReport,
  environmentVerificationPassed,
  type EnvironmentVerificationMode,
} from "../src/server/readiness/environment-verification";
import { parseEnvFile } from "../src/server/readiness/vercel-production-env";

function main() {
  const args = process.argv.slice(2);
  const mode = parseMode(args);
  const envFile = readArg(args, "--env-file");
  const env = envFile ? readEnvFile(envFile) : process.env;
  const report = buildEnvironmentVerificationReport(env, mode);

  console.log(`HR One environment verification: ${report.mode}`);
  if (envFile) {
    console.log(`Source: ${resolve(envFile)}`);
  }
  for (const item of report.checks) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }

  if (!environmentVerificationPassed(report)) {
    console.error("Environment verification failed.");
    process.exit(1);
  }

  console.log("Environment verification passed.");
}

function readEnvFile(path: string) {
  const envFile = resolve(path);
  if (!existsSync(envFile)) {
    throw new Error(`Env file not found: ${envFile}`);
  }
  return parseEnvFile(readFileSync(envFile, "utf8"));
}

function parseMode(args: string[]): EnvironmentVerificationMode {
  const mode = readArg(args, "--mode") ?? process.env.HR_ONE_ENV_VERIFY_MODE ?? "local";
  if (mode !== "local" && mode !== "production") {
    throw new Error(`Unsupported --mode ${mode}. Use local or production.`);
  }
  return mode;
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
