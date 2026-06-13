import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  evaluateStatutoryInsuranceReadiness,
  getStatutoryInsuranceWorkspace,
  resetStatutoryInsuranceDemoState,
  updateStatutoryInsuranceRecord,
  type StatutoryInsuranceRecordView,
} from "./statutory";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("statutory insurance", () => {
  beforeEach(() => {
    resetStatutoryInsuranceDemoState();
    resetAuditDemoState();
  });

  it("flags pending and overdue statutory insurance evidence", async () => {
    const workspace = await getStatutoryInsuranceWorkspace(hrSession);

    expect(workspace.readiness.ready).toBe(false);
    expect(workspace.readiness.pendingCount).toBe(2);
    expect(workspace.records.filter((record) => record.overdue)).toHaveLength(2);
  });

  it("evaluates readiness from record status without exposing private evidence", () => {
    const records: StatutoryInsuranceRecordView[] = [
      {
        id: "record-1",
        employeeId: "employee-1",
        employeeNo: "E001",
        employeeName: "Employee",
        insuranceType: "labor_insurance",
        status: "pending",
        dueDate: new Date("2026-01-01T00:00:00.000Z"),
        enrolledAt: null,
        withdrawnAt: null,
        evidenceRef: null,
        evidenceHash: null,
        exemptionReason: null,
        overdue: false,
        daysUntilDue: -10,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];

    const readiness = evaluateStatutoryInsuranceReadiness(records, new Date("2026-06-13T00:00:00.000Z"));

    expect(readiness).toMatchObject({
      ready: false,
      pendingCount: 1,
      overdueCount: 1,
    });
  });

  it("lets HR mark insurance evidence ready and keeps raw references out of audit logs", async () => {
    await updateStatutoryInsuranceRecord(hrSession, {
      employeeId: "demo-employee-3",
      insuranceType: "labor_insurance",
      status: "enrolled",
      effectiveDate: new Date("2026-06-13T00:00:00.000Z"),
      evidenceRef: "portal://sensitive-case-id",
      notes: "Private insurance note.",
    });

    const workspace = await getStatutoryInsuranceWorkspace(hrSession);
    const updated = workspace.records.find(
      (record) => record.employeeId === "demo-employee-3" && record.insuranceType === "labor_insurance",
    );
    expect(updated).toMatchObject({
      status: "enrolled",
      overdue: false,
      evidenceHash: expect.any(String),
    });
    const auditText = JSON.stringify(getAuditDemoState().logs);
    expect(auditText).toContain("statutory_insurance_record");
    expect(auditText).toContain("evidenceRefHash");
    expect(auditText).not.toContain("portal://sensitive-case-id");
    expect(auditText).not.toContain("Private insurance note.");
  });

  it("blocks managers from changing statutory insurance evidence", async () => {
    await expect(
      updateStatutoryInsuranceRecord(managerSession, {
        employeeId: "demo-employee-3",
        insuranceType: "labor_insurance",
        status: "enrolled",
      }),
    ).rejects.toThrow(/payroll:manage/);
  });
});
