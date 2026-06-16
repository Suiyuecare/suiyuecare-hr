import { createHash } from "node:crypto";
import {
  buildSupabasePrivateSchemaBootstrapSql,
  normalizePrivateSchemaName,
  type PrismaMigrationInput,
} from "./supabase-bootstrap";
import {
  buildSupabasePrivateSchemaVerificationChecks,
  buildSupabasePrivateSchemaVerificationSql,
  supabasePrivateSchemaVerificationPassed,
  type SupabasePrivateSchemaVerificationSnapshot,
} from "./supabase-private-schema-verification";

export type SupabaseRestoreDrillOptions = {
  sourceSchemaName?: string;
  drillSchemaName: string;
  tenantSlug: string;
  migrations: PrismaMigrationInput[];
  testedAt: Date;
  ticket?: string | null;
};

export type SupabaseRestoreDrillPlan = {
  sourceSchemaName: string;
  drillSchemaName: string;
  tenantSlug: string;
  testedAt: Date;
  ticket: string;
  bootstrapSql: string;
  verificationSql: string;
  cleanupSql: string;
};

export type SupabaseRestoreDrillEvidence = {
  passed: boolean;
  ticket: string;
  evidenceHash: string;
  tableCount: number;
  enumTypeCount: number;
  prismaMigrationCount: number;
  checkedAt: Date;
  detail: string;
};

export function buildSupabaseRestoreDrillPlan(options: SupabaseRestoreDrillOptions): SupabaseRestoreDrillPlan {
  const sourceSchemaName = normalizePrivateSchemaName(options.sourceSchemaName ?? "hr_one");
  const drillSchemaName = normalizePrivateSchemaName(options.drillSchemaName);
  if (sourceSchemaName === drillSchemaName) {
    throw new Error("Restore drill schema must be different from the source schema.");
  }
  if (!drillSchemaName.startsWith(`${sourceSchemaName}_restore_drill_`)) {
    throw new Error(`Restore drill schema must start with "${sourceSchemaName}_restore_drill_".`);
  }
  if (options.migrations.length === 0) {
    throw new Error("Restore drill requires at least one migration.");
  }

  return {
    sourceSchemaName,
    drillSchemaName,
    tenantSlug: options.tenantSlug,
    testedAt: options.testedAt,
    ticket: options.ticket?.trim() || buildRestoreDrillTicket(options.testedAt),
    bootstrapSql: buildSupabasePrivateSchemaBootstrapSql({
      schemaName: drillSchemaName,
      migrations: options.migrations,
      generatedAt: options.testedAt,
    }),
    verificationSql: buildSupabasePrivateSchemaVerificationSql(drillSchemaName),
    cleanupSql: buildSupabaseRestoreDrillCleanupSql(drillSchemaName),
  };
}

export function buildSupabaseRestoreDrillEvidence(
  snapshot: SupabasePrivateSchemaVerificationSnapshot,
  expectedMigrationCount: number,
  checkedAt: Date,
  ticket: string,
): SupabaseRestoreDrillEvidence {
  const checks = buildSupabasePrivateSchemaVerificationChecks(snapshot, expectedMigrationCount);
  const passed = supabasePrivateSchemaVerificationPassed(checks);
  const detail = checks.map((item) => `${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`).join("; ");
  const evidenceHash = createHash("sha256")
    .update(JSON.stringify({
      passed,
      ticket,
      tableCount: snapshot.tableCount,
      enumTypeCount: snapshot.enumTypeCount,
      prismaMigrationCount: snapshot.prismaMigrationCount,
      exposedTablePrivilegeCount: snapshot.exposedTablePrivilegeCount,
      tenantCount: snapshot.tenantCount,
      companyCount: snapshot.companyCount,
      employeeCount: snapshot.employeeCount,
      anonUsage: snapshot.anonUsage,
      authenticatedUsage: snapshot.authenticatedUsage,
      checkedAt: checkedAt.toISOString().slice(0, 10),
    }))
    .digest("hex");

  return {
    passed,
    ticket,
    evidenceHash,
    tableCount: snapshot.tableCount,
    enumTypeCount: snapshot.enumTypeCount,
    prismaMigrationCount: snapshot.prismaMigrationCount,
    checkedAt,
    detail,
  };
}

export function buildSupabaseRestoreDrillCleanupSql(drillSchemaName: string): string {
  const normalized = normalizePrivateSchemaName(drillSchemaName);
  return `DROP SCHEMA IF EXISTS ${quoteIdentifier(normalized)} CASCADE;\n`;
}

export function buildOperationalResilienceRestoreEvidenceSql(options: {
  sourceSchemaName?: string;
  tenantSlug: string;
  testedAt: Date;
  ticket: string;
  evidenceHash: string;
  tableCount: number;
  enumTypeCount: number;
  prismaMigrationCount: number;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
}): string {
  const sourceSchemaName = normalizePrivateSchemaName(options.sourceSchemaName ?? "hr_one");
  const testedAt = options.testedAt.toISOString();
  const afterHash = createHash("sha256")
    .update(`${options.tenantSlug}:${options.ticket}:${options.evidenceHash}:${testedAt}`)
    .digest("hex");
  const metadata = {
    source: "supabase_restore_drill",
    restoreMode: "schema_only_private_schema",
    tenantDataExported: false,
    pii: "not_exported",
    salary: "not_exported",
    bankAccount: "not_exported",
    nationalId: "not_exported",
    healthData: "not_exported",
    ticket: options.ticket,
    evidenceHash: options.evidenceHash,
    tableCount: options.tableCount,
    enumTypeCount: options.enumTypeCount,
    prismaMigrationCount: options.prismaMigrationCount,
  };

  return [
    `SET search_path TO ${quoteIdentifier(sourceSchemaName)};`,
    "WITH target AS (",
    `  SELECT t.id AS tenant_id, c.id AS company_id FROM "Tenant" t JOIN "Company" c ON c."tenantId" = t.id WHERE t.slug = ${sqlStringLiteral(options.tenantSlug)} LIMIT 1`,
    "), updated AS (",
    "  UPDATE \"CompanyOperationalResilienceSetting\" settings",
    "  SET",
    "    \"restoreDrillTestedAt\" = " + `${sqlStringLiteral(testedAt)}::timestamptz,`,
    "    \"restoreDrillStatus\" = 'passed',",
    `    "restoreDrillTicket" = ${sqlStringLiteral(options.ticket)},`,
    "    \"verificationStatus\" = 'verified',",
    `    "verificationNote" = ${sqlStringLiteral("Schema-only restore drill completed in a temporary private schema; no tenant data was exported.")},`,
    "    \"updatedByUserId\" = " + (options.actorUserId ? sqlStringLiteral(options.actorUserId) : "NULL") + ",",
    "    \"updatedAt\" = " + `${sqlStringLiteral(testedAt)}::timestamptz`,
    "  FROM target",
    "  WHERE settings.\"companyId\" = target.company_id",
    "  RETURNING settings.id, settings.\"tenantId\", settings.\"companyId\"",
    ")",
    "INSERT INTO \"AuditLog\" (",
    "  id, \"tenantId\", \"companyId\", \"actorUserId\", \"actorEmployeeId\", action, \"entityType\", \"entityId\", \"beforeHash\", \"afterHash\", \"metadataJson\", \"createdAt\"",
    ")",
    "SELECT",
    `  ${sqlStringLiteral(`audit_restore_drill_${options.ticket}`)},`,
    "  updated.\"tenantId\",",
    "  updated.\"companyId\",",
    `  ${options.actorUserId ? sqlStringLiteral(options.actorUserId) : "NULL"},`,
    `  ${options.actorEmployeeId ? sqlStringLiteral(options.actorEmployeeId) : "NULL"},`,
    "  'update',",
    "  'operational_resilience_settings',",
    "  updated.id,",
    "  NULL,",
    `  ${sqlStringLiteral(afterHash)},`,
    `  ${sqlStringLiteral(JSON.stringify(metadata))}::jsonb,`,
    `  ${sqlStringLiteral(testedAt)}::timestamptz`,
    "FROM updated",
    "ON CONFLICT (id) DO NOTHING;",
    "",
  ].join("\n");
}

export function buildRestoreDrillSchemaName(sourceSchemaName: string, testedAt: Date, nonce: string): string {
  const source = normalizePrivateSchemaName(sourceSchemaName);
  const datePart = testedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const cleanNonce = nonce.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 12);
  return normalizePrivateSchemaName(`${source}_restore_drill_${datePart}_${cleanNonce || "run"}`);
}

function buildRestoreDrillTicket(testedAt: Date) {
  return `RESTORE-${testedAt.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
