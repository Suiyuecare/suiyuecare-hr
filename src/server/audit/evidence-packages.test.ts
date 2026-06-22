import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState, writeDemoAuditLog } from "./demo-store";
import {
  generateAuditEvidencePackage,
  generateProductionDatabaseEvidencePackage,
  getAuditEvidenceWorkspace,
  resetAuditEvidenceDemoState,
} from "./evidence-packages";
import {
  buildProductionDatabasePrivateSchemaReport,
  buildProductionDatabaseRemediationReport,
} from "@/server/readiness/production-database-remediation";
import type { HealthReport } from "@/server/readiness/health";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王執行長" },
  employee: null,
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("audit evidence packages", () => {
  beforeEach(() => {
    resetAuditDemoState();
    resetAuditEvidenceDemoState();
  });

  it("generates a redacted labor inspection evidence package", async () => {
    writeDemoAuditLog({
      tenantId: "demo-tenant",
      companyId: "demo-company",
      actorUserId: "demo-user-owner",
      actorName: "王執行長",
      action: "update",
      entityType: "salary_profile",
      entityId: "salary-profile-1",
      before: { baseSalary: 60000 },
      after: { baseSalary: 62000 },
      metadata: { changedFields: ["baseSalary"], rawSalary: 62000 },
    });
    writeDemoAuditLog({
      tenantId: "demo-tenant",
      companyId: "demo-company",
      actorUserId: "demo-user-owner",
      actorName: "王執行長",
      action: "create",
      entityType: "payroll_export",
      entityId: "payroll-export-1",
      metadata: { contentHash: "abc123", sensitiveValuesRedacted: true },
    });

    const pkg = await generateAuditEvidencePackage(ownerSession, {
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
    });
    const workspace = await getAuditEvidenceWorkspace(ownerSession);

    expect(pkg.recordCount).toBe(2);
    expect(pkg.summaryRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "payroll_export", count: 1 }),
        expect.objectContaining({ entityType: "salary_profile", count: 1 }),
      ]),
    );
    expect(pkg.warnings).toContain("No employee_lifecycle_event audit evidence in selected period.");
    expect(pkg.contentHash).toMatch(/[a-f0-9]{64}/);
    expect(JSON.stringify(pkg)).not.toContain("62000");
    expect(workspace.latest?.id).toBe(pkg.id);
  });

  it("requires audit read permission", async () => {
    await expect(generateAuditEvidencePackage(employeeSession)).rejects.toThrow(/audit:read/);
  });

  it("generates hash-only production database gate evidence", async () => {
    const report = buildProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: readyHealth,
      fetchedHealthStatusCode: 200,
      privateSchema: buildProductionDatabasePrivateSchemaReport({
        snapshot: readyPrivateSchemaSnapshot(),
        expectedMigrationCount: 42,
        allowTenantData: true,
      }),
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
    });

    const pkg = await generateProductionDatabaseEvidencePackage(ownerSession, report);
    const workspace = await getAuditEvidenceWorkspace(ownerSession);

    expect(pkg.packageType).toBe("production_database_gate");
    expect(pkg.coveredEntityTypes).toEqual(
      expect.arrayContaining([
        "production_database_gate",
        "supabase_private_schema_rls",
        "vercel_production_cutover",
      ]),
    );
    expect(pkg.warnings.join("\n")).toContain("Vercel cutover step");
    expect(pkg.warnings.join("\n")).not.toContain("private schema / RLS verifier has not been attached");
    expect(pkg.contentHash).toMatch(/[a-f0-9]{64}/);
    expect(workspace.latestProductionDatabase?.id).toBe(pkg.id);
    expect(workspace.latest?.packageType).toBe("production_database_gate");

    const serialized = JSON.stringify(pkg);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("DATABASE_URL=");
    expect(serialized).not.toContain("baseSalary");
    expect(serialized).not.toContain("60000");
    expect(serialized).not.toContain("bank");
  });

  it("records production database blockers as evidence warnings", async () => {
    const report = buildProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: readyHealth,
      fetchedHealthStatusCode: 200,
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
    });

    const pkg = await generateProductionDatabaseEvidencePackage(ownerSession, report);

    expect(pkg.packageType).toBe("production_database_gate");
    expect(pkg.warnings.join("\n")).toContain("private schema / RLS verifier has not been attached");
    expect(pkg.warnings.join("\n")).toContain("root cause private_schema_unverified");
  });

  it("requires audit permission before saving production database evidence", async () => {
    const report = buildProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: readyHealth,
      fetchedHealthStatusCode: 200,
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
    });

    await expect(generateProductionDatabaseEvidencePackage(employeeSession, report)).rejects.toThrow(/audit:read/);
  });
});

const readyHealth: HealthReport = {
  status: "ok",
  service: "hr-one",
  timestamp: "2026-06-17T08:00:00.000Z",
  checks: [
    {
      name: "environment",
      status: "ok",
      detail: "production environment posture verified",
    },
    {
      name: "database",
      status: "ok",
      detail: "database ping succeeded",
    },
    {
      name: "demo auth",
      status: "ok",
      detail: "demo auth disabled for production runtime",
    },
  ],
};

function readyPrivateSchemaSnapshot() {
  return {
    tableCount: 80,
    enumTypeCount: 18,
    prismaMigrationCount: 42,
    rlsEnabledTableCount: 80,
    rlsDisabledTableCount: 0,
    exposedTablePrivilegeCount: 0,
    exposedSecurityDefinerFunctionCount: 0,
    publicSchemaShadowTableCount: 0,
    publicSecurityDefinerExecuteCount: 0,
    tenantCount: 1,
    companyCount: 1,
    employeeCount: 50,
    anonUsage: false,
    authenticatedUsage: false,
  };
}
