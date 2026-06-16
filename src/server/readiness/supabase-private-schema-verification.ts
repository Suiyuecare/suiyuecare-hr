import { normalizePrivateSchemaName } from "./supabase-bootstrap";

export type SupabasePrivateSchemaVerificationSnapshot = {
  tableCount: number;
  enumTypeCount: number;
  prismaMigrationCount: number;
  exposedTablePrivilegeCount: number;
  tenantCount: number;
  companyCount: number;
  employeeCount: number;
  anonUsage: boolean;
  authenticatedUsage: boolean;
};

export type SupabasePrivateSchemaVerificationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type SupabasePrivateSchemaVerificationOptions = {
  allowTenantData?: boolean;
};

export function buildSupabasePrivateSchemaVerificationSql(schemaName = "hr_one"): string {
  const normalizedSchemaName = normalizePrivateSchemaName(schemaName);
  const quotedSchema = quoteIdentifier(normalizedSchemaName);
  const schemaLiteral = sqlStringLiteral(normalizedSchemaName);

  return [
    `SET search_path TO ${quotedSchema};`,
    "SELECT",
    "  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relkind IN ('r','p')) AS \"tableCount\",",
    "  (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = current_schema() AND t.typtype = 'e') AS \"enumTypeCount\",",
    "  (SELECT count(*)::int FROM \"_prisma_migrations\") AS \"prismaMigrationCount\",",
    "  (SELECT count(*)::int FROM information_schema.table_privileges WHERE table_schema = current_schema() AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')) AS \"exposedTablePrivilegeCount\",",
    "  (SELECT count(*)::int FROM \"Tenant\") AS \"tenantCount\",",
    "  (SELECT count(*)::int FROM \"Company\") AS \"companyCount\",",
    "  (SELECT count(*)::int FROM \"Employee\") AS \"employeeCount\",",
    `  has_schema_privilege('anon', ${schemaLiteral}, 'USAGE') AS "anonUsage",`,
    `  has_schema_privilege('authenticated', ${schemaLiteral}, 'USAGE') AS "authenticatedUsage";`,
    "",
  ].join("\n");
}

export function buildSupabasePrivateSchemaVerificationChecks(
  snapshot: SupabasePrivateSchemaVerificationSnapshot,
  expectedMigrationCount: number,
  options: SupabasePrivateSchemaVerificationOptions = {},
): SupabasePrivateSchemaVerificationCheck[] {
  return [
    check("HR One table count", snapshot.tableCount >= 70, `${snapshot.tableCount} table(s) in private schema`),
    check("HR One enum count", snapshot.enumTypeCount >= 10, `${snapshot.enumTypeCount} enum type(s) in private schema`),
    check(
      "Prisma migration baseline",
      snapshot.prismaMigrationCount === expectedMigrationCount,
      `${snapshot.prismaMigrationCount}/${expectedMigrationCount} migration row(s)`,
    ),
    check(
      "Supabase browser role schema usage",
      !snapshot.anonUsage && !snapshot.authenticatedUsage,
      `anon=${snapshot.anonUsage ? "allowed" : "blocked"}, authenticated=${snapshot.authenticatedUsage ? "allowed" : "blocked"}`,
    ),
    check(
      "Supabase browser table grants",
      snapshot.exposedTablePrivilegeCount === 0,
      `${snapshot.exposedTablePrivilegeCount} anon/authenticated table privilege(s)`,
    ),
    check(
      options.allowTenantData ? "Tenant data allowed" : "Tenant data not accidentally seeded",
      options.allowTenantData || (snapshot.tenantCount === 0 && snapshot.companyCount === 0 && snapshot.employeeCount === 0),
      `${snapshot.tenantCount} tenant(s), ${snapshot.companyCount} company record(s), ${snapshot.employeeCount} employee record(s)`,
    ),
  ];
}

export function supabasePrivateSchemaVerificationPassed(checks: SupabasePrivateSchemaVerificationCheck[]) {
  return checks.every((item) => item.passed);
}

function check(name: string, passed: boolean, detail: string): SupabasePrivateSchemaVerificationCheck {
  return { name, passed, detail };
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
