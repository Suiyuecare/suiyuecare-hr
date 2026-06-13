import { spawnSync } from "node:child_process";
import {
  buildReleaseGatePlan,
  parseReleaseGateArgs,
  type ReleaseGateCommand,
} from "../src/server/readiness/release-gate";

function main() {
  const options = parseReleaseGateArgs(process.argv.slice(2));
  const plan = buildReleaseGatePlan(options);

  console.log(`HR One release gate: ${plan.mode}`);

  if (plan.blockers.length > 0) {
    console.error("Release gate blocked before checks:");
    for (const blocker of plan.blockers) {
      console.error(`- ${blocker}`);
    }
    process.exit(1);
  }

  for (const command of plan.commands) {
    runCommand(command);
  }

  console.log("HR One release gate passed.");
}

function runCommand(command: ReleaseGateCommand) {
  console.log(`\n> ${command.name}`);
  console.log(`$ ${[command.command, ...command.args].join(" ")}`);

  const result = spawnSync(command.command, command.args, {
    env: {
      ...process.env,
      ...command.env,
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`Release gate failed at: ${command.name}`);
    process.exit(result.status ?? 1);
  }
}

main();
