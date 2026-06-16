import { describe, expect, it } from "vitest";
import {
  assertSafeMigrationSql,
  buildDeterministicMigrationId,
  buildPrismaMigrationBaselineSql,
  buildSupabasePrivateSchemaBootstrapSql,
  normalizePrivateSchemaName,
} from "@/server/readiness/supabase-bootstrap";

describe("Supabase private schema bootstrap", () => {
  it("builds bootstrap SQL for a private schema and strips Prisma public schema creation", () => {
    const sql = buildSupabasePrivateSchemaBootstrapSql({
      schemaName: "hr_one",
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
      migrations: [
        {
          name: "20260612000000_init",
          sql: [
            "-- CreateSchema",
            'CREATE SCHEMA IF NOT EXISTS "public";',
            "",
            'CREATE TABLE "Tenant" ("id" TEXT NOT NULL, CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id"));',
          ].join("\n"),
        },
      ],
    });

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "hr_one";');
    expect(sql).toContain('SET search_path TO "hr_one";');
    expect(sql).toContain('REVOKE ALL ON SCHEMA "hr_one" FROM anon;');
    expect(sql).toContain('CREATE TABLE "Tenant"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "_prisma_migrations"');
    expect(sql).toContain("'20260612000000_init'");
    expect(sql).not.toContain('CREATE SCHEMA IF NOT EXISTS "public"');
  });

  it("rejects public and reserved schema names", () => {
    expect(() => normalizePrivateSchemaName("public")).toThrow(/reserved/);
    expect(() => normalizePrivateSchemaName("pg_temp")).toThrow(/reserved/);
    expect(() => normalizePrivateSchemaName("HR_One")).toThrow(/lowercase/);
  });

  it("allows foreign-key ON DELETE clauses but blocks destructive data operations", () => {
    expect(() => assertSafeMigrationSql('ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;')).not.toThrow();
    expect(() => assertSafeMigrationSql('DROP TABLE "Employee";', "bad_migration")).toThrow(/DROP/);
    expect(() => assertSafeMigrationSql('DELETE FROM "Employee";', "bad_migration")).toThrow(/DELETE FROM/);
    expect(() => assertSafeMigrationSql('CREATE FUNCTION danger() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1; $$;', "bad_migration")).toThrow(/SECURITY DEFINER/);
  });

  it("rejects explicit public schema references after rewriting", () => {
    expect(() => buildSupabasePrivateSchemaBootstrapSql({
      migrations: [
        {
          name: "bad_public_reference",
          sql: 'CREATE TABLE public."Employee" ("id" TEXT NOT NULL);',
        },
      ],
    })).toThrow(/public schema references/);
  });

  it("builds deterministic Prisma migration baseline rows from original migration SQL", () => {
    const migrations = [
      {
        name: "20260612000000_init",
        sql: 'CREATE TABLE "Tenant" ("id" TEXT NOT NULL);',
      },
      {
        name: "20260612001000_followup",
        sql: 'ALTER TABLE "Tenant" ADD COLUMN "name" TEXT NOT NULL;',
      },
    ];
    const baseline = buildPrismaMigrationBaselineSql(migrations, new Date("2026-06-17T00:00:00.000Z"));

    expect(baseline).toContain('CREATE TABLE IF NOT EXISTS "_prisma_migrations"');
    expect(baseline).toContain('ON CONFLICT ("id") DO NOTHING;');
    expect(baseline).toContain("'20260612000000_init'");
    expect(baseline).toContain("'20260612001000_followup'");
    expect(buildDeterministicMigrationId(migrations[0].name, "a".repeat(64))).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    );
  });
});
