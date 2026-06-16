import { describe, expect, it } from "vitest";
import {
  buildSupabasePrivateSchemaVerificationChecks,
  buildSupabasePrivateSchemaVerificationSql,
  supabasePrivateSchemaVerificationPassed,
} from "@/server/readiness/supabase-private-schema-verification";

describe("Supabase private schema verification", () => {
  it("builds a private-schema verification query without exposing public schema", () => {
    const sql = buildSupabasePrivateSchemaVerificationSql("hr_one");

    expect(sql).toContain('SET search_path TO "hr_one";');
    expect(sql).toContain('FROM "_prisma_migrations"');
    expect(sql).toContain("information_schema.table_privileges");
    expect(sql).not.toContain("public.");
  });

  it("passes when the HR One private schema is bootstrapped and locked down", () => {
    const checks = buildSupabasePrivateSchemaVerificationChecks({
      tableCount: 76,
      enumTypeCount: 11,
      prismaMigrationCount: 48,
      exposedTablePrivilegeCount: 0,
      tenantCount: 0,
      companyCount: 0,
      employeeCount: 0,
      anonUsage: false,
      authenticatedUsage: false,
    }, 48);

    expect(supabasePrivateSchemaVerificationPassed(checks)).toBe(true);
  });

  it("fails closed when browser roles can access the schema or migration baseline is stale", () => {
    const checks = buildSupabasePrivateSchemaVerificationChecks({
      tableCount: 76,
      enumTypeCount: 11,
      prismaMigrationCount: 47,
      exposedTablePrivilegeCount: 1,
      tenantCount: 0,
      companyCount: 0,
      employeeCount: 0,
      anonUsage: true,
      authenticatedUsage: false,
    }, 48);

    expect(supabasePrivateSchemaVerificationPassed(checks)).toBe(false);
    expect(checks.filter((item) => !item.passed).map((item) => item.name)).toEqual([
      "Prisma migration baseline",
      "Supabase browser role schema usage",
      "Supabase browser table grants",
    ]);
  });

  it("can allow tenant data after production provisioning has started", () => {
    const checks = buildSupabasePrivateSchemaVerificationChecks({
      tableCount: 76,
      enumTypeCount: 11,
      prismaMigrationCount: 48,
      exposedTablePrivilegeCount: 0,
      tenantCount: 1,
      companyCount: 1,
      employeeCount: 25,
      anonUsage: false,
      authenticatedUsage: false,
    }, 48, { allowTenantData: true });

    expect(supabasePrivateSchemaVerificationPassed(checks)).toBe(true);
    expect(checks.at(-1)).toMatchObject({
      name: "Tenant data allowed",
      passed: true,
    });
  });
});
