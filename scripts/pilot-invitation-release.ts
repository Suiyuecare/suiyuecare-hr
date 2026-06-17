import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPilotInvitationReleaseReport,
  formatPilotInvitationReleaseMarkdown,
  pilotInvitationReleasePassed,
} from "../src/server/readiness/pilot-invitation-release";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const output = readArg(args, "--output");
  const productionDatabaseReportPath = readArg(args, "--production-database-report");
  const goNoGoReportPath = readArg(args, "--go-no-go-report");
  const inviteReadinessReportPath = readArg(args, "--invite-readiness-report");

  const report = buildPilotInvitationReleaseReport({
    productionDatabaseReport: readReportFile(productionDatabaseReportPath),
    goNoGoReport: readReportFile(goNoGoReportPath),
    inviteReadinessReport: readReportFile(inviteReadinessReportPath),
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatPilotInvitationReleaseMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Invitation release output is redacted; send invitations only when status is released.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotInvitationReleasePassed(report) ? 0 : 1);
}

function readReportFile(path: string | null) {
  if (!path) return null;
  const resolved = resolve(path);
  return {
    path,
    content: readFileSync(resolved, "utf8"),
  };
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pilot invitation release failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
}
