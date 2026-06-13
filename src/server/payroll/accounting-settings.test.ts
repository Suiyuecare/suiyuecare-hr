import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getPayrollAccountingSettings,
  resetPayrollAccountingSettingsDemoState,
  updatePayrollAccountingSettings,
} from "./accounting-settings";

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

describe("payroll accounting settings", () => {
  beforeEach(() => {
    resetPayrollAccountingSettingsDemoState();
    resetAuditDemoState();
  });

  it("updates accounting mappings with audit trail", async () => {
    const updated = await updatePayrollAccountingSettings(hrSession, {
      grossPayrollDebitAccountCode: " 6001 ",
      grossPayrollDebitAccountName: " Payroll cost custom ",
      employerContributionDebitAccountCode: "6002",
      employerContributionDebitAccountName: "Employer cost custom",
    });
    const settings = await getPayrollAccountingSettings(hrSession);

    expect(updated).toMatchObject({
      grossPayrollDebitAccountCode: "6001",
      grossPayrollDebitAccountName: "Payroll cost custom",
      employerContributionDebitAccountCode: "6002",
      employerContributionDebitAccountName: "Employer cost custom",
      deductionCreditAccountCode: "2210",
    });
    expect(settings).toEqual(updated);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "payroll_accounting_settings",
    });
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      exportMappingChanged: true,
      amountValuesIncluded: false,
    });
  });

  it("blocks managers from payroll accounting settings", async () => {
    await expect(getPayrollAccountingSettings(managerSession)).rejects.toThrow(/payroll:manage/);
    await expect(
      updatePayrollAccountingSettings(managerSession, {
        grossPayrollDebitAccountCode: "6001",
      }),
    ).rejects.toThrow(/payroll:manage/);
  });
});
