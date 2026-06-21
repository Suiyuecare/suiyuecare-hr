import { normalizePrivateSchemaName } from "./supabase-bootstrap";

export type SupabasePrivateSchemaVerificationSnapshot = {
  tableCount: number;
  enumTypeCount: number;
  prismaMigrationCount: number;
  rlsEnabledTableCount: number;
  rlsDisabledTableCount: number;
  exposedTablePrivilegeCount: number;
  exposedSecurityDefinerFunctionCount: number;
  publicSchemaShadowTableCount: number;
  publicSecurityDefinerExecuteCount: number;
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
    "  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relkind IN ('r','p') AND c.relrowsecurity) AS \"rlsEnabledTableCount\",",
    "  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relkind IN ('r','p') AND NOT c.relrowsecurity) AS \"rlsDisabledTableCount\",",
    "  (SELECT count(*)::int FROM information_schema.table_privileges WHERE table_schema = current_schema() AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')) AS \"exposedTablePrivilegeCount\",",
    "  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = current_schema() AND p.prosecdef AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) AS \"exposedSecurityDefinerFunctionCount\",",
    "  (SELECT count(*)::int FROM pg_class private_c JOIN pg_namespace private_n ON private_n.oid = private_c.relnamespace JOIN pg_class public_c ON public_c.relname = private_c.relname AND public_c.relkind IN ('r','p') JOIN pg_namespace public_n ON public_n.oid = public_c.relnamespace WHERE private_n.nspname = current_schema() AND public_n.nspname = 'public' AND private_c.relkind IN ('r','p')) AS \"publicSchemaShadowTableCount\",",
    "  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) AS \"publicSecurityDefinerExecuteCount\",",
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
      "Supabase private schema RLS defense",
      snapshot.tableCount > 0 && snapshot.rlsDisabledTableCount === 0 && snapshot.rlsEnabledTableCount >= snapshot.tableCount,
      `${snapshot.rlsEnabledTableCount}/${snapshot.tableCount} table(s) have RLS enabled; ${snapshot.rlsDisabledTableCount} disabled`,
    ),
    check(
      "Supabase public schema shadow tables",
      snapshot.publicSchemaShadowTableCount === 0,
      `${snapshot.publicSchemaShadowTableCount} public table(s) share HR One private table names`,
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
      "Supabase private security-definer exposure",
      snapshot.exposedSecurityDefinerFunctionCount === 0,
      `${snapshot.exposedSecurityDefinerFunctionCount} callable private security-definer function(s)`,
    ),
    check(
      "Supabase public security-definer RPC exposure",
      snapshot.publicSecurityDefinerExecuteCount === 0,
      `${snapshot.publicSecurityDefinerExecuteCount} callable public security-definer function(s)`,
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
