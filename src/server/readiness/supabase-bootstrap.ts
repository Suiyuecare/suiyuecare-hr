import { createHash } from "node:crypto";

export type PrismaMigrationInput = {
  name: string;
  sql: string;
};

export type SupabasePrivateSchemaBootstrapOptions = {
  schemaName?: string;
  migrations: PrismaMigrationInput[];
  generatedAt?: Date;
};

const defaultSchemaName = "hr_one";
const reservedSchemaNames = new Set(["public", "information_schema"]);

export function buildSupabasePrivateSchemaBootstrapSql(
  options: SupabasePrivateSchemaBootstrapOptions,
): string {
  const schemaName = normalizePrivateSchemaName(options.schemaName ?? defaultSchemaName);
  if (options.migrations.length === 0) {
    throw new Error("At least one Prisma migration is required.");
  }

  const generatedAt = options.generatedAt ?? new Date();
  const sections = options.migrations.map((migration) => {
    assertSafeMigrationSql(migration.sql, migration.name);
    const sql = rewriteMigrationForPrivateSchema(migration.sql, schemaName);
    assertNoPublicSchemaReferences(sql, migration.name);

    return [
      `-- BEGIN MIGRATION: ${migration.name}`,
      sql.trim(),
      `-- END MIGRATION: ${migration.name}`,
    ].join("\n");
  });

  return [
    "-- HR One Supabase private schema bootstrap.",
    "-- Review before running. Apply only to an empty private schema for HR One.",
    `-- Generated at: ${generatedAt.toISOString()}`,
    `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`,
    `REVOKE ALL ON SCHEMA "${schemaName}" FROM anon;`,
    `REVOKE ALL ON SCHEMA "${schemaName}" FROM authenticated;`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" REVOKE ALL ON TABLES FROM anon, authenticated;`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" REVOKE ALL ON SEQUENCES FROM anon, authenticated;`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" REVOKE ALL ON FUNCTIONS FROM anon, authenticated;`,
    `SET search_path TO "${schemaName}";`,
    "",
    ...sections,
    "",
    `SET search_path TO "${schemaName}";`,
    buildPrismaMigrationBaselineSql(options.migrations, generatedAt),
    buildPrivateSchemaPostureSql(schemaName),
    "-- HR One private schema bootstrap complete.",
    "",
  ].join("\n");
}

export function normalizePrivateSchemaName(input: string): string {
  const schemaName = input.trim();
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error("Schema name must use lowercase letters, digits, and underscores, and start with a letter.");
  }
  if (reservedSchemaNames.has(schemaName) || schemaName.startsWith("pg_")) {
    throw new Error(`Schema "${schemaName}" is reserved. Use a private application schema such as "${defaultSchemaName}".`);
  }
  return schemaName;
}

export function assertSafeMigrationSql(sql: string, migrationName = "migration"): void {
  const lines = stripBlockCommentsPreservingLines(sql).split(/\r?\n/);
  const unsafePatterns = [
    { pattern: /\bDROP\b/i, reason: "DROP statements are not allowed in bootstrap SQL" },
    { pattern: /\bTRUNCATE\b/i, reason: "TRUNCATE statements are not allowed in bootstrap SQL" },
    { pattern: /\bDELETE\s+FROM\b/i, reason: "DELETE FROM statements are not allowed in bootstrap SQL" },
    { pattern: /\bSECURITY\s+DEFINER\b/i, reason: "SECURITY DEFINER functions need a manual security review" },
  ];

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.replace(/--.*$/, "");
    for (const { pattern, reason } of unsafePatterns) {
      if (pattern.test(line)) {
        throw new Error(`${migrationName}:${index + 1}: ${reason}.`);
      }
    }
  }
}

export function buildPrismaMigrationBaselineSql(migrations: PrismaMigrationInput[], appliedAt: Date): string {
  const appliedAtLiteral = sqlStringLiteral(appliedAt.toISOString());
  const rows = migrations.map((migration) => {
    const checksum = createHash("sha256").update(migration.sql).digest("hex");
    const id = buildDeterministicMigrationId(migration.name, checksum);
    return [
      sqlStringLiteral(id),
      sqlStringLiteral(checksum),
      `${appliedAtLiteral}::timestamptz`,
      sqlStringLiteral(migration.name),
      "NULL",
      "NULL",
      `${appliedAtLiteral}::timestamptz`,
      "1",
    ].join(", ");
  });

  return [
    "-- Baseline Prisma migration history so future prisma migrate deploy runs do not replay this bootstrap.",
    'CREATE TABLE IF NOT EXISTS "_prisma_migrations" (',
    '    "id" VARCHAR(36) PRIMARY KEY NOT NULL,',
    '    "checksum" VARCHAR(64) NOT NULL,',
    '    "finished_at" TIMESTAMPTZ,',
    '    "migration_name" VARCHAR(255) NOT NULL,',
    '    "logs" TEXT,',
    '    "rolled_back_at" TIMESTAMPTZ,',
    '    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),',
    '    "applied_steps_count" INTEGER NOT NULL DEFAULT 0',
    ");",
    'INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count") VALUES',
    rows.map((row) => `(${row})`).join(",\n"),
    'ON CONFLICT ("id") DO NOTHING;',
    "",
  ].join("\n");
}

export function buildDeterministicMigrationId(migrationName: string, checksum: string): string {
  const hash = createHash("sha256").update(`${migrationName}:${checksum}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

export function buildPrivateSchemaPostureSql(schemaName: string): string {
  const normalized = normalizePrivateSchemaName(schemaName);
  return [
    "-- Lock browser API roles out after all bootstrap objects are created.",
    `REVOKE ALL ON ALL TABLES IN SCHEMA "${normalized}" FROM anon, authenticated;`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA "${normalized}" FROM anon, authenticated;`,
    `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "${normalized}" FROM anon, authenticated;`,
    "-- Enable RLS on every private-schema table as defense in depth if a grant is accidentally added later.",
    "DO $$",
    "DECLARE",
    "  table_record record;",
    "BEGIN",
    "  FOR table_record IN",
    "    SELECT n.nspname AS schema_name, c.relname AS table_name",
    "    FROM pg_class c",
    "    JOIN pg_namespace n ON n.oid = c.relnamespace",
    `    WHERE n.nspname = ${sqlStringLiteral(normalized)}`,
    "      AND c.relkind IN ('r','p')",
    "  LOOP",
    "    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_record.schema_name, table_record.table_name);",
    "  END LOOP;",
    "END $$;",
    "",
  ].join("\n");
}

function rewriteMigrationForPrivateSchema(sql: string, schemaName: string): string {
  return sql
    .replace(/^\s*-- CreateSchema\s*\r?\n\s*CREATE SCHEMA IF NOT EXISTS "public";\s*/m, "")
    .replace(/^\s*CREATE SCHEMA IF NOT EXISTS "public";\s*$/gm, `-- Private schema "${schemaName}" is created by the bootstrap header.`);
}

function assertNoPublicSchemaReferences(sql: string, migrationName: string): void {
  const withoutComments = stripBlockCommentsPreservingLines(sql)
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

  if (/\bpublic\s*\./i.test(withoutComments) || /"public"\s*\./i.test(withoutComments)) {
    throw new Error(`${migrationName}: explicit public schema references are not allowed in private schema bootstrap SQL.`);
  }
  if (/\bCREATE\s+SCHEMA\s+(IF\s+NOT\s+EXISTS\s+)?"public"/i.test(withoutComments)) {
    throw new Error(`${migrationName}: public schema creation was not removed from bootstrap SQL.`);
  }
}

function stripBlockCommentsPreservingLines(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, (match) => "\n".repeat(match.split(/\r?\n/).length - 1));
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
