import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  refreshVercelProductionEnvDraftKnownValues,
  setVercelProductionDatabaseUrl,
} from "../src/server/readiness/vercel-production-env-draft";

function main() {
  const args = process.argv.slice(2);
  const envFile = resolve(readArg(args, "--env-file") ?? ".env.vercel.production");
  const apply = args.includes("--apply");
  const databaseUrlFromStdin = args.includes("--database-url-stdin");

  if (!existsSync(envFile)) {
    throw new Error(`Env file not found: ${envFile}. Run pnpm vercel:create-production-env-draft first.`);
  }

  const baseText = readFileSync(envFile, "utf8");
  const refreshed = refreshVercelProductionEnvDraftKnownValues(baseText, {
    appUrl: readArg(args, "--app-url") ?? undefined,
    projectId: readArg(args, "--project-id") ?? undefined,
    supabaseUrl: readArg(args, "--supabase-url") ?? undefined,
    supabasePublishableKey: readArg(args, "--supabase-publishable-key") ?? undefined,
    restoreDrillTestedAt: readArg(args, "--restore-tested-at") ?? undefined,
  });
  const databaseUrlResult = databaseUrlFromStdin
    ? setVercelProductionDatabaseUrl(refreshed.text, readStdinSecret(), {
        supabaseIpv4AddonEnabled: args.includes("--supabase-ipv4-addon-enabled"),
      })
    : null;
  const nextText = databaseUrlResult?.text ?? refreshed.text;

  console.log("HR One Vercel production env draft refresh:");
  console.log(`- source=${envFile}`);
  console.log(`- changed key(s): ${mergeKeys(refreshed.changedKeys, databaseUrlResult?.changedKeys).join(", ") || "none"}`);
  console.log(`- appended key(s): ${mergeKeys(refreshed.appendedKeys, databaseUrlResult?.appendedKeys).join(", ") || "none"}`);
  if (databaseUrlResult) {
    console.log(`- DATABASE_URL accepted as ${databaseUrlResult.connectionPosture}; value was read from stdin and not printed`);
  }
  console.log(`- preserved sensitive/operator-managed keys: ${preservedOperatorManagedKeys({
    databaseUrlFromStdin,
    restoreDrillTestedAt: args.some((arg) => arg.startsWith("--restore-tested-at")),
  }).join(", ") || "none"}`);

  if (!apply) {
    console.log("Dry run only; pass --apply to update the local env draft.");
    return;
  }

  writeFileSync(envFile, nextText, { encoding: "utf8", mode: 0o600 });
  console.log("Updated local env draft without printing secret values.");
  console.log("Run pnpm env:verify:production -- --env-file=.env.vercel.production next.");
}

function readStdinSecret() {
  const value = readFileSync(0, "utf8").trim();
  if (!value) throw new Error("Missing DATABASE_URL on stdin.");
  return value;
}

function mergeKeys(left: string[], right: string[] = []) {
  return [...new Set([...left, ...right])].sort();
}

function preservedOperatorManagedKeys(options: {
  databaseUrlFromStdin: boolean;
  restoreDrillTestedAt: boolean;
}) {
  return [
    options.databaseUrlFromStdin ? null : "DATABASE_URL",
    "generated secrets",
    "vault refs",
    options.restoreDrillTestedAt ? null : "restore drill evidence",
  ].filter((item): item is string => Boolean(item));
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
