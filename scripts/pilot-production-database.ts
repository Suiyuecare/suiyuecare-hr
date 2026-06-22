import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildProductionDatabaseEnvDraftReport,
  buildProductionDatabasePrivateSchemaReport,
  buildProductionDatabasePrivateSchemaReportFromPayload,
  formatProductionDatabaseRemediationMarkdown,
  getProductionDatabaseRemediationReport,
} from "../src/server/readiness/production-database-remediation";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";
import { parseEnvFile } from "../src/server/readiness/vercel-production-env";

async function main() {
  const args = process.argv.slice(2);
  const appUrl =
    readArg(args, "--url") ??
    process.env.HR_ONE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://hr.suiyuecare.com";
  const expectedHost = readArg(args, "--expected-host") ?? new URL(appUrl).hostname;
  const timeoutMs = parsePositiveInteger(readArg(args, "--timeout-ms"), 5000);
  const output = readArg(args, "--output");
  const json = args.includes("--json");
  const skipEnvFile = args.includes("--skip-env-file");
  const envFileSource = readArg(args, "--env-file") ?? ".env.vercel.production";
  const envFilePath = resolve(envFileSource);
  const envDraft = loadEnvDraftReport(envFilePath, envFileSource, skipEnvFile);
  const schemaName = readArg(args, "--schema") ?? "hr_one";
  const privateSchemaSnapshotFile = readArg(args, "--private-schema-snapshot-file");
  const privateSchema = loadPrivateSchemaReport({
    file: privateSchemaSnapshotFile,
    schemaName,
    expectedMigrationCount: parsePositiveInteger(
      readArg(args, "--expected-migrations"),
      countLocalPrismaMigrations(),
    ),
    allowTenantData: args.includes("--allow-tenant-data"),
  });
  const report = await getProductionDatabaseRemediationReport({
    appUrl,
    expectedHost,
    envDraft,
    privateSchema,
    timeoutMs,
  });
  const content = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatProductionDatabaseRemediationMarkdown(report);

  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Production database report is redacted; keep DATABASE_URL and secret values outside reports.");
  } else {
    process.stdout.write(content);
  }

  process.exit(report.status === "ready" ? 0 : 1);
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadEnvDraftReport(envFile: string, source: string, skipped: boolean) {
  if (skipped) {
    return buildProductionDatabaseEnvDraftReport(null, {
      source,
      skipped: true,
    });
  }
  if (!existsSync(envFile)) {
    return buildProductionDatabaseEnvDraftReport(null, {
      source,
    });
  }
  const env = parseEnvFile(readFileSync(envFile, "utf8"));
  return buildProductionDatabaseEnvDraftReport(env, {
    source,
  });
}

function loadPrivateSchemaReport(options: {
  file: string | null;
  schemaName: string;
  expectedMigrationCount: number;
  allowTenantData: boolean;
}) {
  const command = `pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=${options.schemaName} ${options.allowTenantData ? "--allow-tenant-data " : ""}--json --output=/tmp/hr-one-supabase-private-schema.json`;
  if (!options.file) {
    return buildProductionDatabasePrivateSchemaReport({
      schemaName: options.schemaName,
      command,
    });
  }
  const filePath = resolve(options.file);
  if (!existsSync(filePath)) {
    return buildProductionDatabasePrivateSchemaReport({
      schemaName: options.schemaName,
      command,
    });
  }
  const payload = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return buildProductionDatabasePrivateSchemaReportFromPayload(payload, {
    expectedMigrationCount: options.expectedMigrationCount,
    schemaName: options.schemaName,
    allowTenantData: options.allowTenantData,
    command,
  });
}

function countLocalPrismaMigrations() {
  const migrationsDir = resolve("prisma/migrations");
  return readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Production database gate failed unexpectedly: ${redactSensitiveDetail(message)}`);
  process.exit(1);
});
