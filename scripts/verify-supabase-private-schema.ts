import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildSupabasePrivateSchemaVerificationChecks,
  buildSupabasePrivateSchemaVerificationSql,
  supabasePrivateSchemaVerificationPassed,
  type SupabasePrivateSchemaVerificationSnapshot,
} from "../src/server/readiness/supabase-private-schema-verification";

type SupabaseCliQueryResult = {
  rows?: unknown[];
};

function main() {
  const args = process.argv.slice(2);
  const schemaName = readArg(args, "--schema") ?? "hr_one";
  const projectRef = readArg(args, "--project-ref") ?? process.env.SUPABASE_PROJECT_REF;
  const expectedMigrationCount = Number(readArg(args, "--expected-migrations") ?? countLocalPrismaMigrations());
  const allowTenantData = args.includes("--allow-tenant-data");
  const verificationSql = buildSupabasePrivateSchemaVerificationSql(schemaName);

  if (args.includes("--print-sql")) {
    process.stdout.write(verificationSql);
    return;
  }

  if (!projectRef) {
    throw new Error("Missing --project-ref or SUPABASE_PROJECT_REF.");
  }

  const snapshot = runSupabaseLinkedQuery(projectRef, verificationSql);
  const checks = buildSupabasePrivateSchemaVerificationChecks(snapshot, expectedMigrationCount, { allowTenantData });

  console.log(`HR One Supabase private schema verification: ${schemaName}`);
  for (const item of checks) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }

  if (!supabasePrivateSchemaVerificationPassed(checks)) {
    console.error("Supabase private schema verification failed.");
    process.exit(1);
  }

  console.log("Supabase private schema verification passed.");
}

function runSupabaseLinkedQuery(projectRef: string, sql: string): SupabasePrivateSchemaVerificationSnapshot {
  const workdir = mkdtempSync(join(tmpdir(), "hrone-supabase-"));
  const tempDir = join(workdir, "supabase", ".temp");
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(join(tempDir, "project-ref"), projectRef, "utf8");

  try {
    const supabaseBinary = process.env.SUPABASE_CLI ?? "supabase";
    const result = spawnSync(supabaseBinary, [
      "db",
      "query",
      "--linked",
      sql,
      "--workdir",
      workdir,
      "--output",
      "json",
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });

    if (result.status !== 0) {
      const stderr = result.stderr.trim();
      throw new Error(stderr || `Supabase CLI exited with status ${result.status ?? "unknown"}.`);
    }

    const queryResult = JSON.parse(extractFirstJsonObject(result.stdout)) as SupabaseCliQueryResult;
    const row = queryResult.rows?.[0];
    return parseSnapshot(row);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function parseSnapshot(row: unknown): SupabasePrivateSchemaVerificationSnapshot {
  if (!row || typeof row !== "object") {
    throw new Error("Supabase verification query returned no rows.");
  }
  const record = row as Record<string, unknown>;

  return {
    tableCount: readNumber(record, "tableCount"),
    enumTypeCount: readNumber(record, "enumTypeCount"),
    prismaMigrationCount: readNumber(record, "prismaMigrationCount"),
    rlsEnabledTableCount: readNumber(record, "rlsEnabledTableCount"),
    rlsDisabledTableCount: readNumber(record, "rlsDisabledTableCount"),
    exposedTablePrivilegeCount: readNumber(record, "exposedTablePrivilegeCount"),
    exposedSecurityDefinerFunctionCount: readNumber(record, "exposedSecurityDefinerFunctionCount"),
    publicSchemaShadowTableCount: readNumber(record, "publicSchemaShadowTableCount"),
    publicSecurityDefinerExecuteCount: readNumber(record, "publicSecurityDefinerExecuteCount"),
    tenantCount: readNumber(record, "tenantCount"),
    companyCount: readNumber(record, "companyCount"),
    employeeCount: readNumber(record, "employeeCount"),
    anonUsage: readBoolean(record, "anonUsage"),
    authenticatedUsage: readBoolean(record, "authenticatedUsage"),
  };
}

function extractFirstJsonObject(output: string): string {
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Supabase CLI did not return JSON output.");

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

  throw new Error("Could not parse Supabase CLI JSON output.");
}

function countLocalPrismaMigrations() {
  const migrationsDir = resolve("prisma/migrations");
  return readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) throw new Error(`Invalid numeric value for ${key}.`);
  return numberValue;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`Invalid boolean value for ${key}.`);
  return value;
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
