import { describe, expect, it } from "vitest";
import {
  buildOperationalResilienceRestoreEvidenceSql,
  buildSupabaseRestoreDrillCleanupSql,
  buildSupabaseRestoreDrillEvidence,
  buildSupabaseRestoreDrillPlan,
  buildRestoreDrillSchemaName,
} from "./supabase-restore-drill";
import type { SupabasePrivateSchemaVerificationSnapshot } from "./supabase-private-schema-verification";

const migrations = [
  {
    name: "20260612000000_init",
    sql: 'CREATE TABLE "Tenant" ("id" TEXT NOT NULL, CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id"));',
  },
];

const readySnapshot: SupabasePrivateSchemaVerificationSnapshot = {
  tableCount: 76,
  enumTypeCount: 11,
  prismaMigrationCount: 48,
  rlsEnabledTableCount: 76,
  rlsDisabledTableCount: 0,
  exposedTablePrivilegeCount: 0,
  exposedSecurityDefinerFunctionCount: 0,
  publicSchemaShadowTableCount: 0,
  publicSecurityDefinerExecuteCount: 0,
  tenantCount: 0,
  companyCount: 0,
  employeeCount: 0,
  anonUsage: false,
  authenticatedUsage: false,
};

describe("Supabase restore drill", () => {
  it("builds a temporary private-schema restore plan", () => {
    const testedAt = new Date("2026-06-17T00:00:00.000Z");
    const drillSchemaName = buildRestoreDrillSchemaName("hr_one", testedAt, "abc123");
    const plan = buildSupabaseRestoreDrillPlan({
      drillSchemaName,
      tenantSlug: "suiyuecare-pilot",
      migrations,
      testedAt,
    });

    expect(plan.drillSchemaName).toBe("hr_one_restore_drill_20260617_abc123");
    expect(plan.bootstrapSql).toContain('CREATE SCHEMA IF NOT EXISTS "hr_one_restore_drill_20260617_abc123";');
    expect(plan.verificationSql).toContain('SET search_path TO "hr_one_restore_drill_20260617_abc123";');
    expect(plan.cleanupSql).toBe('DROP SCHEMA IF EXISTS "hr_one_restore_drill_20260617_abc123" CASCADE;\n');
  });

  it("refuses to restore into the source schema", () => {
    expect(() =>
      buildSupabaseRestoreDrillPlan({
        drillSchemaName: "hr_one",
        tenantSlug: "suiyuecare-pilot",
        migrations,
        testedAt: new Date("2026-06-17T00:00:00.000Z"),
      }),
    ).toThrow(/different from the source schema/);
  });

  it("summarizes restore evidence without tenant data", () => {
    const evidence = buildSupabaseRestoreDrillEvidence(
      readySnapshot,
      48,
      new Date("2026-06-17T00:00:00.000Z"),
      "RESTORE-20260617",
    );

    expect(evidence).toMatchObject({
      passed: true,
      tableCount: 76,
      enumTypeCount: 11,
      prismaMigrationCount: 48,
    });
    expect(evidence.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.detail).toContain("Tenant data not accidentally seeded");
  });

  it("updates operational resilience with hash-only restore metadata", () => {
    const sql = buildOperationalResilienceRestoreEvidenceSql({
      tenantSlug: "suiyuecare-pilot",
      testedAt: new Date("2026-06-17T00:00:00.000Z"),
      ticket: "RESTORE-20260617",
      evidenceHash: "a".repeat(64),
      tableCount: 76,
      enumTypeCount: 11,
      prismaMigrationCount: 48,
      actorUserId: "user_suiyuecare_pilot_owner",
      actorEmployeeId: "employee_suiyuecare_e001",
    });

    expect(sql).toContain('"restoreDrillStatus" = \'passed\'');
    expect(sql).toContain("'operational_resilience_settings'");
    expect(sql).toContain("tenantDataExported");
    expect(sql).toContain("not_exported");
    expect(sql).not.toContain("national_id=");
    expect(sql).not.toContain("bankAccount=");
    expect(buildSupabaseRestoreDrillCleanupSql("hr_one_restore_drill_20260617_run")).toContain("DROP SCHEMA");
  });
});
