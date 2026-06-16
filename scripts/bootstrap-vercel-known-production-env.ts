import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVercelCliEnvCommand,
  buildVercelKnownProductionEnvPlan,
  parseEnvFile,
  summarizeVercelKnownProductionEnvPlan,
  type VercelEnvPayloadItem,
} from "../src/server/readiness/vercel-production-env";

function main() {
  const args = process.argv.slice(2);
  const envFile = resolve(readArg(args, "--env-file") ?? ".env.vercel.production");
  const projectId = readArg(args, "--project-id") ?? process.env.VERCEL_PROJECT_ID ?? "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N";
  const teamId = readArg(args, "--team-id") ?? process.env.VERCEL_TEAM_ID ?? "team_LGag47eU8tKbsK6ixAmVa5Uq";
  const apply = args.includes("--apply");

  if (!existsSync(envFile)) {
    throw new Error(`Env file not found: ${envFile}`);
  }

  const env = parseEnvFile(readFileSync(envFile, "utf8"));
  const plan = buildVercelKnownProductionEnvPlan({ env, projectId, teamId });

  console.log("HR One known Vercel production env bootstrap plan:");
  for (const line of summarizeVercelKnownProductionEnvPlan(plan)) {
    console.log(`- ${line}`);
  }
  console.log("Variables eligible for bootstrap:");
  for (const item of plan.items) {
    console.log(`- ${item.key}: ${item.type}`);
  }

  if (plan.items.length === 0) {
    console.log("No known production env variables are eligible for bootstrap.");
    return;
  }

  if (!apply) {
    console.log("Dry run only; pass --apply to write these known values to Vercel Production.");
    console.log("Operator-managed keys still require real DATABASE_URL, vault references, and restore-drill evidence before pilot use.");
    return;
  }

  writeVercelProjectEnvWithCli(plan.items);
}

function writeVercelProjectEnvWithCli(items: VercelEnvPayloadItem[]) {
  for (const item of items) {
    const command = buildVercelCliEnvCommand(item);
    console.log(`$ ${command.redactedCommand}`);
    const result = spawnSync(command.command, command.args, {
      input: command.stdin,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 5,
    });

    if (result.status !== 0) {
      throw new Error([
        `Vercel CLI env write failed for ${item.key}.`,
        redactResponse(result.stdout.trim()),
        redactResponse(result.stderr.trim()),
      ].filter(Boolean).join("\n"));
    }

    console.log(`Created or updated ${item.key} in Vercel Production.`);
  }
  console.log(`Created or updated ${items.length} known Vercel production env variable(s).`);
  console.log("A production redeploy is still blocked until DATABASE_URL, vault references, and restore-drill evidence are configured.");
}

function redactResponse(body: string): string {
  return body
    .replace(/postgres(?:ql)?:\/\/[^"\\\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/--value\s+[^"\\\s]+/gi, "--value [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
