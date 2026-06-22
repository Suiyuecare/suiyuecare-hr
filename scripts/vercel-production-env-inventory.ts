import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVercelProductionEnvInventoryCommand,
  buildVercelProductionEnvInventoryReport,
  formatVercelProductionEnvInventoryMarkdown,
} from "../src/server/readiness/vercel-production-env-inventory";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

async function main() {
  const args = process.argv.slice(2);
  const teamId = readArg(args, "--team-id") ?? process.env.VERCEL_TEAM_ID ?? "team_LGag47eU8tKbsK6ixAmVa5Uq";
  const inputFile = readArg(args, "--input");
  const outputFile = readArg(args, "--output");
  const source = inputFile ? inputFile : "Vercel CLI env ls production --format json";
  const command = buildVercelProductionEnvInventoryCommand(teamId);
  const payload = inputFile
    ? readJsonFile(inputFile)
    : args.includes("--stdin")
      ? JSON.parse(readFileSync(0, "utf8")) as unknown
      : readVercelEnvInventory({ teamId });
  const report = buildVercelProductionEnvInventoryReport(payload, {
    source,
    command,
  });
  const content = args.includes("--json")
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatVercelProductionEnvInventoryMarkdown(report);

  if (outputFile) {
    const outputPath = resolve(outputFile);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Vercel env inventory report contains key metadata only; it does not contain env values.");
  } else {
    process.stdout.write(content);
  }

  process.exit(report.status === "ready" ? 0 : 1);
}

function readVercelEnvInventory(options: { teamId: string }) {
  const result = spawnSync(
    "pnpm",
    ["dlx", "vercel@latest", "env", "ls", "production", "--format", "json", "--scope", options.teamId],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 5,
    },
  );
  if (result.status !== 0) {
    throw new Error([
      "Unable to read Vercel Production env inventory.",
      redactSensitiveDetail(result.stdout.trim()),
      redactSensitiveDetail(result.stderr.trim()),
    ].filter(Boolean).join("\n"));
  }
  return JSON.parse(extractFirstJsonObject(result.stdout)) as unknown;
}

function readJsonFile(path: string) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`Input file does not exist: ${resolved}`);
  return JSON.parse(readFileSync(resolved, "utf8")) as unknown;
}

function extractFirstJsonObject(output: string): string {
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Command did not return JSON output.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return output.slice(start, index + 1);
    }
  }

  throw new Error("Could not parse JSON output.");
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
  console.error(`Vercel Production env inventory failed: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
