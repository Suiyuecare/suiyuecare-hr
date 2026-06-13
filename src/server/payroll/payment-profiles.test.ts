import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getPaymentProfileCoverage,
  getPaymentProfileWorkspace,
  resetPaymentProfileDemoState,
  savePaymentProfile,
} from "./payment-profiles";

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

describe("payment profiles", () => {
  beforeEach(() => {
    resetPaymentProfileDemoState();
    resetAuditDemoState();
  });

  it("stores only masked payment profile details and audits the change", async () => {
    const profile = await savePaymentProfile(hrSession, {
      employeeId: "demo-employee-1",
      bankCode: "004",
      bankBranchCode: "0123",
      accountName: "Chang Xiao An",
      accountNumber: "123456789012",
      effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    });
    const workspace = await getPaymentProfileWorkspace(hrSession);
    const coverage = await getPaymentProfileCoverage(hrSession, ["demo-employee-1", "demo-employee-2"]);

    expect(profile).toMatchObject({
      employeeId: "demo-employee-1",
      accountNumberLast4: "9012",
      status: "active",
    });
    expect(JSON.stringify(workspace.profiles)).not.toContain("123456789012");
    expect(coverage.configuredEmployeeIds.has("demo-employee-1")).toBe(true);
    expect(coverage.missingEmployeeIds.has("demo-employee-2")).toBe(true);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "create",
      entityType: "employee_payment_profile",
    });
    expect(JSON.stringify(getAuditDemoState().logs[0])).not.toContain("123456789012");
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      sensitiveValuesRedacted: true,
    });
  });

  it("blocks managers from payment profile access", async () => {
    await expect(getPaymentProfileWorkspace(managerSession)).rejects.toThrow(/payroll:manage/);
    await expect(
      savePaymentProfile(managerSession, {
        employeeId: "demo-employee-1",
        bankCode: "004",
        accountName: "Chang Xiao An",
        accountNumber: "123456789012",
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/payroll:manage/);
  });
});
