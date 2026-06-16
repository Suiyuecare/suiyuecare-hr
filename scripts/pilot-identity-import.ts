import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  applyPilotIdentityImport,
  buildPilotIdentityImportPlan,
  formatPilotIdentityImportReport,
  readPilotIdentityImportContext,
} from "../src/server/provisioning/pilot-identity-import";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const tenantSlug = readArg(args, "--tenant-slug");
  const companyId = readArg(args, "--company-id");
  const csvPath = readArg(args, "--csv");
  const output = readArg(args, "--output");
  const apply = args.includes("--apply");
  const json = args.includes("--json");
  if (!tenantSlug) throw new Error("Missing --tenant-slug=<customer-slug>.");
  if (!csvPath) throw new Error("Missing --csv=<identity-import.csv>.");
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("REPLACE_WITH_")) {
    throw new Error("DATABASE_URL is required for pilot identity import.");
  }

  const rawCsv = readFileSync(resolve(csvPath), "utf8");
  const context = await readPilotIdentityImportContext(prisma, {
    tenantSlug,
    companyId,
  });
  const ssoProvider = readArg(args, "--sso-provider") ?? context.ssoProvider;
  const ssoIssuer = readArg(args, "--sso-issuer") ?? context.ssoIssuer;
  const result = apply
    ? await applyPilotIdentityImport(prisma, {
        rawCsv,
        context,
        actorUserId: readArg(args, "--actor-user-id"),
        ssoProvider,
        ssoIssuer,
      })
    : {
        plan: buildPilotIdentityImportPlan({
          rawCsv,
          context,
          ssoProvider,
          ssoIssuer,
        }),
      };
  const content = json
    ? `${JSON.stringify(result, null, 2)}\n`
    : formatPilotIdentityImportReport(result.plan, apply);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Identity import output is redacted; keep raw identity CSV files in approved secure storage.");
  } else {
    process.stdout.write(content);
  }

  process.exit(result.plan.status === "ready" ? 0 : 1);
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Pilot identity import failed unexpectedly: ${redactSensitiveDetail(message)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
