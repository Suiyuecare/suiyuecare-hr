import {
  buildEnvironmentVerificationReport,
  environmentVerificationPassed,
  type EnvironmentVerificationMode,
} from "../src/server/readiness/environment-verification";

function main() {
  const mode = parseMode(process.argv.slice(2));
  const report = buildEnvironmentVerificationReport(process.env, mode);

  console.log(`HR One environment verification: ${report.mode}`);
  for (const item of report.checks) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }

  if (!environmentVerificationPassed(report)) {
    console.error("Environment verification failed.");
    process.exit(1);
  }

  console.log("Environment verification passed.");
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
