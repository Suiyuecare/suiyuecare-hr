import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getPayrollPaymentSecurityReadiness,
  resetPayrollPaymentSecurityDemoState,
  updatePayrollPaymentSecuritySettings,
} from "./payment-security";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "hr-1", displayName: "HR" },
  employee: { id: "emp-hr", displayName: "HR" },
};

const managerSession = {
  ...hrSession,
  role: "manager" as const,
};

describe("payroll payment security settings", () => {
  beforeEach(() => {
    resetAuditDemoState();
    resetPayrollPaymentSecurityDemoState();
  });

  it("tracks token vault and verified bank format readiness with audit metadata", async () => {
    const before = await getPayrollPaymentSecurityReadiness(hrSession);
    expect(before.ready).toBe(false);
    expect(before.detail).toContain("token vault provider");

    await updatePayrollPaymentSecuritySettings(hrSession, {
      tokenVaultProvider: "aws_secrets_manager",
      tokenVaultRef: "vault://customer/payroll-payment",
      kmsKeyRef: "alias/customer-payroll-payment",
      bankFileFormat: "customer_bank_csv",
      bankFormatVersion: "v1",
      bankFormatVerified: true,
      verificationStatus: "verified",
      verificationNote: "Customer bank sandbox file accepted.",
    });

    const after = await getPayrollPaymentSecurityReadiness(hrSession);
    expect(after.ready).toBe(true);
    expect(after.detail).toBe("aws_secrets_manager vault configured; customer_bank_csv v1 verified.");

    const audit = getAuditDemoState().logs[0];
    expect(audit).toMatchObject({
      action: "update",
      entityType: "payroll_payment_security_settings",
    });
    expect(JSON.stringify(audit.metadataJson)).toContain("aws_secrets_manager");
    expect(JSON.stringify(audit.metadataJson)).not.toContain("vault://customer/payroll-payment");
  });

  it("blocks non-payroll roles from reading or updating payment security", async () => {
    await expect(getPayrollPaymentSecurityReadiness(managerSession)).rejects.toThrow(/payroll:manage/);
    await expect(updatePayrollPaymentSecuritySettings(managerSession, {
      tokenVaultProvider: "aws_secrets_manager",
    })).rejects.toThrow(/payroll:manage/);
  });
});
