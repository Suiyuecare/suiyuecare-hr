import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildOperationalResilienceRestoreEvidenceSql,
  buildRestoreDrillSchemaName,
  buildSupabaseRestoreDrillEvidence,
  buildSupabaseRestoreDrillPlan,
} from "../src/server/readiness/supabase-restore-drill";
import {
  buildSupabasePrivateSchemaVerificationChecks,
  supabasePrivateSchemaVerificationPassed,
  type SupabasePrivateSchemaVerificationSnapshot,
} from "../src/server/readiness/supabase-private-schema-verification";
import type { PrismaMigrationInput } from "../src/server/readiness/supabase-bootstrap";

type SupabaseCliQueryResult = {
  rows?: unknown[];
};

function main() {
  const args = process.argv.slice(2);
  const projectRef = readArg(args, "--project-ref") ?? process.env.SUPABASE_PROJECT_REF;
  const sourceSchemaName = readArg(args, "--schema") ?? "hr_one";
  const tenantSlug = readArg(args, "--tenant-slug") ?? "suiyuecare-pilot";
  const testedAt = readDateArg(args, "--tested-at") ?? startOfUtcDay(new Date());
  const ticket = readArg(args, "--ticket") ?? `RESTORE-${testedAt.toISOString().slice(0, 10).replace(/-/g, "")}`;
  const apply = args.includes("--apply");
  const drillSchemaName = readArg(args, "--drill-schema") ??
    buildRestoreDrillSchemaName(sourceSchemaName, testedAt, randomSuffix());

  if (!projectRef) {
    throw new Error("Missing --project-ref or SUPABASE_PROJECT_REF.");
  }

  const migrations = readPrismaMigrations();
  const plan = buildSupabaseRestoreDrillPlan({
    sourceSchemaName,
    drillSchemaName,
    tenantSlug,
    migrations,
    testedAt,
    ticket,
  });

  console.log("HR One Supabase restore drill starting.");
  console.log(`sourceSchema=${plan.sourceSchemaName}`);
  console.log(`drillSchema=${plan.drillSchemaName}`);
  console.log(`tenant=${tenantSlug}`);
  console.log(`ticket=${plan.ticket}`);
  console.log("mode=schema-only; tenant data export disabled");

  let cleanupPassed = false;
  let evidence = null as ReturnType<typeof buildSupabaseRestoreDrillEvidence> | null;
  try {
    runSupabaseLinkedQueryFile(projectRef, plan.bootstrapSql);
    const snapshot = runSupabaseLinkedQuery(projectRef, plan.verificationSql);
    evidence = buildSupabaseRestoreDrillEvidence(snapshot, migrations.length, testedAt, plan.ticket);
    const checks = buildSupabasePrivateSchemaVerificationChecks(snapshot, migrations.length);

    console.log("Restore drill verification:");
    for (const item of checks) {
      console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
    }
    console.log(`evidenceHash=${evidence.evidenceHash}`);
    console.log(`tables=${evidence.tableCount} enums=${evidence.enumTypeCount} migrations=${evidence.prismaMigrationCount}`);
    if (!supabasePrivateSchemaVerificationPassed(checks)) {
      throw new Error("Restore drill verification failed.");
    }
  } finally {
    try {
      runSupabaseLinkedQueryFile(projectRef, plan.cleanupSql);
      cleanupPassed = true;
      console.log("Temporary restore drill schema dropped.");
    } catch (error) {
      console.error(`Temporary restore drill schema cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!evidence?.passed || !cleanupPassed) {
    throw new Error("Restore drill did not complete cleanly; refusing to record evidence.");
  }

  if (!apply) {
    console.log("Dry record mode: restore drill completed, but DB evidence was not recorded. Re-run with --apply to update readiness.");
    return;
  }

  runSupabaseLinkedQueryFile(
    projectRef,
    buildOperationalResilienceRestoreEvidenceSql({
      sourceSchemaName,
      tenantSlug,
      testedAt,
      ticket: plan.ticket,
      evidenceHash: evidence.evidenceHash,
      tableCount: evidence.tableCount,
      enumTypeCount: evidence.enumTypeCount,
      prismaMigrationCount: evidence.prismaMigrationCount,
      actorUserId: "user_suiyuecare_pilot_owner",
      actorEmployeeId: "employee_suiyuecare_e001",
    }),
  );
  console.log("Operational resilience restore drill evidence recorded.");
  console.log(`HR_ONE_BACKUP_RESTORE_TESTED_AT=${testedAt.toISOString().slice(0, 10)}`);
}

function readPrismaMigrations(): PrismaMigrationInput[] {
  const migrationsRoot = join(process.cwd(), "prisma", "migrations");
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const filePath = join(migrationsRoot, name, "migration.sql");
      return {
        name,
        sql: readFileSync(filePath, "utf8"),
      };
    });
}

function runSupabaseLinkedQuery(projectRef: string, sql: string): SupabasePrivateSchemaVerificationSnapshot {
  const result = runSupabaseLinkedQueryFile(projectRef, sql);
  const queryResult = JSON.parse(extractFirstJsonObject(result.stdout)) as SupabaseCliQueryResult;
  const row = queryResult.rows?.[0];
  return parseSnapshot(row);
}

function runSupabaseLinkedQueryFile(projectRef: string, sql: string) {
  const workdir = mkdtempSync(join(tmpdir(), "hrone-supabase-restore-"));
  const tempDir = join(workdir, "supabase", ".temp");
  const sqlFile = join(workdir, "query.sql");
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(join(tempDir, "project-ref"), projectRef, "utf8");
  writeFileSync(sqlFile, sql, "utf8");

  try {
    const supabaseBinary = process.env.SUPABASE_CLI ?? "supabase";
    const result = spawnSync(supabaseBinary, [
      "db",
      "query",
      "--linked",
      "--file",
      sqlFile,
      "--workdir",
      workdir,
      "--output",
      "json",
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 40,
    });

    if (result.status !== 0) {
      throw new Error(redactCliOutput(result.stderr.trim() || result.stdout.trim() || `Supabase CLI exited with status ${result.status ?? "unknown"}.`));
    }
    return result;
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function parseSnapshot(row: unknown): SupabasePrivateSchemaVerificationSnapshot {
  if (!row || typeof row !== "object") {
    throw new Error("Restore drill verification query returned no rows.");
  }
  const record = row as Record<string, unknown>;
  return {
    tableCount: readNumber(record, "tableCount"),
    enumTypeCount: readNumber(record, "enumTypeCount"),
    prismaMigrationCount: readNumber(record, "prismaMigrationCount"),
    exposedTablePrivilegeCount: readNumber(record, "exposedTablePrivilegeCount"),
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

function readDateArg(args: string[], name: string) {
  const value = readArg(args, name);
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD.`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function redactCliOutput(output: string) {
  return output
    .replace(/postgres(?:ql)?:\/\/[^"\\\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/PASSWORD\s+'[^']+'/gi, "PASSWORD '[REDACTED]'");
}

main();
