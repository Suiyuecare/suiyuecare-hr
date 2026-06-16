import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPilotInviteReadinessReport,
  formatPilotInviteReadinessMarkdown,
  pilotInviteReadinessPassed,
  readPilotInviteReadinessSnapshotFromDatabase,
} from "../src/server/readiness/pilot-invite-readiness";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

async function main() {
  const args = process.argv.slice(2);
  const tenantSlug = readArg(args, "--tenant-slug");
  const companyId = readArg(args, "--company-id");
  const output = readArg(args, "--output");
  const json = args.includes("--json");
  if (!tenantSlug) throw new Error("Missing --tenant-slug=<customer-slug>.");

  const snapshot = await readPilotInviteReadinessSnapshotFromDatabase({
    tenantSlug,
    companyId,
  });
  const report = buildPilotInviteReadinessReport({ snapshot });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatPilotInviteReadinessMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Invite readiness output is redacted; keep IdP exports and invitation lists in approved secure storage.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotInviteReadinessPassed(report) ? 0 : 1);
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
  console.error(`Pilot invite readiness failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
