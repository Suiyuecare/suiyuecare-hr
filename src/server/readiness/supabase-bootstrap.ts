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
