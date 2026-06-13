import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState, writeDemoAuditLog } from "./demo-store";
import {
  generateAuditEvidencePackage,
  getAuditEvidenceWorkspace,
  resetAuditEvidenceDemoState,
} from "./evidence-packages";

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
});
