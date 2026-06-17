import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPilotRolloutKit,
  formatPilotRolloutKitMarkdown,
  pilotRolloutKitPassed,
  redactRolloutText,
} from "../src/server/readiness/pilot-rollout-kit";

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const output = readArg(args, "--output");
  const kit = buildPilotRolloutKit({
    companyName: readArg(args, "--company-name"),
    appUrl: readArg(args, "--app-url") ?? readArg(args, "--url"),
    supportContact: readArg(args, "--support-contact"),
  });
  const content = json
    ? `${JSON.stringify(kit, null, 2)}\n`
    : formatPilotRolloutKitMarkdown(kit);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Rollout kit is redacted; publish only when status is ready.");
  } else {
    process.stdout.write(content);
  }

  process.exit(pilotRolloutKitPassed(kit) ? 0 : 1);
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
  console.error(`Pilot rollout kit failed unexpectedly: ${redactRolloutText(message)}`);
  process.exit(1);
}
