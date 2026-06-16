import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVercelCliEnvCommand,
  buildVercelProductionEnvPlan,
  parseEnvFile,
  summarizeVercelProductionEnvPlan,
  type VercelEnvPayloadItem,
} from "../src/server/readiness/vercel-production-env";

type ApplyMethod = "api" | "cli" | "auto";

async function main() {
  const args = process.argv.slice(2);
  const envFile = resolve(readArg(args, "--env-file") ?? ".env.vercel.production");
  const projectId = readArg(args, "--project-id") ?? process.env.VERCEL_PROJECT_ID ?? "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N";
  const teamId = readArg(args, "--team-id") ?? process.env.VERCEL_TEAM_ID ?? "team_LGag47eU8tKbsK6ixAmVa5Uq";
  const method = parseApplyMethod(readArg(args, "--method") ?? process.env.HR_ONE_VERCEL_ENV_APPLY_METHOD ?? "auto");
  const dryRun = args.includes("--dry-run");

  if (!existsSync(envFile)) {
    throw new Error(`Env file not found: ${envFile}`);
  }

  const env = parseEnvFile(readFileSync(envFile, "utf8"));
  const plan = buildVercelProductionEnvPlan({ env, projectId, teamId });

  console.log("HR One Vercel production env apply plan:");
  for (const line of summarizeVercelProductionEnvPlan(plan)) {
    console.log(`- ${line}`);
  }
  for (const item of plan.checks) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }

  if (!plan.passed) {
    console.error("Production env verification failed. Refusing to write Vercel env variables.");
    process.exit(1);
  }

  console.log("Variables to write:");
  for (const item of plan.items) {
    console.log(`- ${item.key}: ${item.type}`);
  }

  if (dryRun) {
    console.log("Dry run only; no Vercel environment variable write was sent.");
    return;
  }

  const resolvedMethod = resolveApplyMethod(method, Boolean(process.env.VERCEL_TOKEN));
  if (resolvedMethod === "api") {
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      throw new Error("Missing VERCEL_TOKEN. Create a Vercel access token with access to the target team and rerun.");
    }

    await createVercelProjectEnv({
      token,
      projectId,
      teamId,
      items: plan.items,
    });
    return;
  }

  writeVercelProjectEnvWithCli(plan.items);
}

async function createVercelProjectEnv(options: {
  token: string;
  projectId: string;
  teamId: string;
  items: VercelEnvPayloadItem[];
}) {
  const response = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(options.projectId)}/env?teamId=${encodeURIComponent(options.teamId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options.items),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vercel env API failed with ${response.status}: ${redactResponse(body)}`);
  }

  console.log(`Created ${options.items.length} Vercel production env variable(s).`);
  console.log("Trigger a new production deployment so the new values are applied.");
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
  console.log(`Created or updated ${items.length} Vercel production env variable(s).`);
  console.log("Trigger a new production deployment so the new values are applied.");
}

function parseApplyMethod(method: string): ApplyMethod {
  if (method === "api" || method === "cli" || method === "auto") return method;
  throw new Error(`Unsupported --method ${method}. Use api, cli, or auto.`);
}

function resolveApplyMethod(method: ApplyMethod, hasToken: boolean): Exclude<ApplyMethod, "auto"> {
  if (method !== "auto") return method;
  return hasToken ? "api" : "cli";
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
