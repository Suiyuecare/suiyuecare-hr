import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  evaluatePayrollRecordkeepingReadiness,
  getPayrollRecordkeepingSettings,
  minimumWageRosterRetentionDays,
  resetPayrollRecordkeepingDemoState,
  updatePayrollRecordkeepingSettings,
} from "./recordkeeping";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林 HR" },
  employee: { id: "demo-hr-employee", displayName: "林 HR" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("payroll recordkeeping settings", () => {
  beforeEach(() => {
    resetPayrollRecordkeepingDemoState();
    resetAuditDemoState();
  });

  it("lets HR configure audited wage roster retention and employee statement access", async () => {
    const updated = await updatePayrollRecordkeepingSettings(hrSession, {
      wageRosterRetentionDays: minimumWageRosterRetentionDays,
      employeePayslipEnabled: true,
      wageCalculationDetailsEnabled: true,
      laborInspectionExportEnabled: true,
    });

    await expect(getPayrollRecordkeepingSettings(hrSession)).resolves.toEqual(updated);
    expect(evaluatePayrollRecordkeepingReadiness(updated)).toMatchObject({
      ready: true,
      missing: [],
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "payroll_recordkeeping_settings",
      metadataJson: expect.objectContaining({
        retentionDays: minimumWageRosterRetentionDays,
        containsPayrollAmounts: "[REDACTED]",
        employeePayslipEnabled: "[REDACTED]",
        wageCalculationDetailsEnabled: "[REDACTED]",
      }),
    });
  });

  it("flags payroll recordkeeping gaps before production launch", () => {
    expect(
      evaluatePayrollRecordkeepingReadiness({
        wageRosterRetentionDays: 365,
        employeePayslipEnabled: false,
        wageCalculationDetailsEnabled: false,
        laborInspectionExportEnabled: false,
      }),
    ).toMatchObject({
      ready: false,
      missing: [
        "5-year wage roster retention",
        "employee wage statement access",
        "wage calculation details",
        "labor inspection export readiness",
      ],
    });
  });

  it("blocks managers from payroll recordkeeping settings", async () => {
    await expect(getPayrollRecordkeepingSettings(managerSession)).rejects.toThrow(/payroll:manage/);
    await expect(
      updatePayrollRecordkeepingSettings(managerSession, {
        wageRosterRetentionDays: minimumWageRosterRetentionDays,
      }),
    ).rejects.toThrow(/payroll:manage/);
  });
});
