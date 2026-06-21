import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeMigrationSql } from "@/server/readiness/supabase-bootstrap";

describe("report permission database hardening migrations", () => {
  it("adds safe partial unique indexes for report permission scopes", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260622040000_report_permission_unique_scope",
        "migration.sql",
      ),
      "utf8",
    );

    expect(() => assertSafeMigrationSql(sql, "20260622040000_report_permission_unique_scope")).not.toThrow();
    expect(sql).toContain("ReportPermission has % duplicate permission scope(s)");
    expect(sql).toContain('CREATE UNIQUE INDEX "ReportPermission_dataset_scope_unique_idx"');
    expect(sql).toContain('WHERE "datasetId" IS NOT NULL');
    expect(sql).toContain('AND "fieldId" IS NULL');
    expect(sql).toContain('CREATE UNIQUE INDEX "ReportPermission_field_scope_unique_idx"');
    expect(sql).toContain('AND "fieldId" IS NOT NULL');
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
