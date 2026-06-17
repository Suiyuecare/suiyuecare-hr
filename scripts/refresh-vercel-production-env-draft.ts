import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { refreshVercelProductionEnvDraftKnownValues } from "../src/server/readiness/vercel-production-env-draft";

function main() {
  const args = process.argv.slice(2);
  const envFile = resolve(readArg(args, "--env-file") ?? ".env.vercel.production");
  const apply = args.includes("--apply");

  if (!existsSync(envFile)) {
    throw new Error(`Env file not found: ${envFile}. Run pnpm vercel:create-production-env-draft first.`);
  }

  const result = refreshVercelProductionEnvDraftKnownValues(readFileSync(envFile, "utf8"), {
    appUrl: readArg(args, "--app-url") ?? undefined,
    projectId: readArg(args, "--project-id") ?? undefined,
    supabaseUrl: readArg(args, "--supabase-url") ?? undefined,
    supabasePublishableKey: readArg(args, "--supabase-publishable-key") ?? undefined,
    restoreDrillTestedAt: readArg(args, "--restore-tested-at") ?? undefined,
  });

  console.log("HR One Vercel production env draft refresh:");
  console.log(`- source=${envFile}`);
  console.log(`- changed key(s): ${result.changedKeys.join(", ") || "none"}`);
  console.log(`- appended key(s): ${result.appendedKeys.join(", ") || "none"}`);
  console.log(
    args.some((arg) => arg.startsWith("--restore-tested-at"))
      ? "- preserved sensitive/operator-managed keys: DATABASE_URL, generated secrets, vault refs"
      : "- preserved sensitive/operator-managed keys: DATABASE_URL, generated secrets, vault refs, restore drill evidence",
  );

  if (!apply) {
    console.log("Dry run only; pass --apply to update the local env draft.");
    return;
  }

  writeFileSync(envFile, result.text, { encoding: "utf8", mode: 0o600 });
  console.log("Updated local env draft without printing secret values.");
  console.log("Run pnpm env:verify:production -- --env-file=.env.vercel.production next.");
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
