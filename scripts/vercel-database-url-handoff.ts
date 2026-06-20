import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVercelDatabaseUrlHandoffReport,
  formatVercelDatabaseUrlHandoffMarkdown,
} from "../src/server/readiness/vercel-database-url-handoff";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

async function main() {
  const args = process.argv.slice(2);
  const envFileSource = readArg(args, "--env-file") ?? ".env.vercel.production";
  const envFile = resolve(envFileSource);
  const projectId = readArg(args, "--project-id") ?? process.env.VERCEL_PROJECT_ID ?? "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N";
  const teamId = readArg(args, "--team-id") ?? process.env.VERCEL_TEAM_ID ?? "team_LGag47eU8tKbsK6ixAmVa5Uq";
  const output = readArg(args, "--output");
  const json = args.includes("--json");

  if (!existsSync(envFile)) {
    throw new Error(`Env file not found: ${envFile}. Run pnpm vercel:create-production-env-draft first.`);
  }

  const report = buildVercelDatabaseUrlHandoffReport({
    baseEnvText: readFileSync(envFile, "utf8"),
    databaseUrl: readStdinSecret(),
    envFileSource,
    projectId,
    teamId,
    supabaseIpv4AddonEnabled: args.includes("--supabase-ipv4-addon-enabled"),
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatVercelDatabaseUrlHandoffMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Vercel database URL handoff is redacted; keep the real DATABASE_URL outside reports.");
  } else {
    process.stdout.write(content);
  }

  process.exit(report.status === "ready" ? 0 : 1);
}

function readStdinSecret() {
  const value = readFileSync(0, "utf8").trim();
  if (!value) throw new Error("Missing DATABASE_URL on stdin.");
  return value;
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
  console.error(`Vercel database URL handoff failed: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
