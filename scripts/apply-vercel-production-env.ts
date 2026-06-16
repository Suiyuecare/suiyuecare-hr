import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVercelProductionEnvPlan,
  parseEnvFile,
  summarizeVercelProductionEnvPlan,
  type VercelEnvPayloadItem,
} from "../src/server/readiness/vercel-production-env";

function main() {
  const args = process.argv.slice(2);
  const envFile = resolve(readArg(args, "--env-file") ?? ".env.vercel.production");
  const projectId = readArg(args, "--project-id") ?? process.env.VERCEL_PROJECT_ID ?? "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N";
  const teamId = readArg(args, "--team-id") ?? process.env.VERCEL_TEAM_ID ?? "team_LGag47eU8tKbsK6ixAmVa5Uq";
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
    console.log("Dry run only; no Vercel API request was sent.");
    return;
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error("Missing VERCEL_TOKEN. Create a Vercel access token with access to the target team and rerun.");
  }

  createVercelProjectEnv({
    token,
    projectId,
    teamId,
    items: plan.items,
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
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

function redactResponse(body: string): string {
  return body
    .replace(/postgres(?:ql)?:\/\/[^"\\\s]+/gi, "[REDACTED_DATABASE_URL]")
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
