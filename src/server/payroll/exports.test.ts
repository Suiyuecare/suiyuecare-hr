import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  confirmPayrollRun,
  createPayrollRun,
  lockPayrollRun,
  recalculatePayrollRun,
  resolvePayrollBlockers,
} from "./service";
import {
  downloadPayrollExportPackage,
  generatePayrollExport,
  getPayrollExportWorkspace,
  resetPayrollExportDemoState,
} from "./exports";
import {
  resetPayrollAccountingSettingsDemoState,
  updatePayrollAccountingSettings,
} from "./accounting-settings";
import { resetPayrollDemoState } from "./demo-store";
import {
  resetPaymentProfileDemoState,
  savePaymentProfile,
} from "./payment-profiles";
import {
  resetPayrollPaymentSecurityDemoState,
  updatePayrollPaymentSecuritySettings,
} from "./payment-security";

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

describe("payroll exports", () => {
  beforeEach(() => {
    resetPayrollDemoState();
    resetPayrollAccountingSettingsDemoState();
    resetPayrollExportDemoState();
    resetPaymentProfileDemoState();
    resetPayrollPaymentSecurityDemoState();
    resetAuditDemoState();
  });

  it("generates audited bank, accounting, and statutory filing packages only after payroll lock", async () => {
    await createPayrollRun(hrSession);

    await expect(generatePayrollExport(hrSession, "bank_transfer")).rejects.toThrow(/locked or released/);

    await resolvePayrollBlockers(hrSession);
    await recalculatePayrollRun(hrSession);
    await confirmPayrollRun(hrSession);
    await lockPayrollRun(hrSession);
    await updatePayrollAccountingSettings(hrSession, {
      grossPayrollDebitAccountCode: "6001",
      grossPayrollDebitAccountName: "Payroll cost custom",
    });

    const bank = await generatePayrollExport(hrSession, "bank_transfer");
    const accounting = await generatePayrollExport(hrSession, "accounting_journal");
    const statutory = await generatePayrollExport(hrSession, "statutory_filing");
    const workspace = await getPayrollExportWorkspace(hrSession);

    expect(bank).toMatchObject({
      exportType: "bank_transfer",
      format: "tw-bank-transfer-placeholder-v1",
      recordCount: 5,
    });
    expect(accounting).toMatchObject({
      exportType: "accounting_journal",
      format: "accounting-journal-summary-v1",
    });
    expect(accounting.previewRows[0]).toMatchObject({
      label: "6001 · Payroll cost custom",
    });
    expect(statutory).toMatchObject({
      exportType: "statutory_filing",
      format: "tw-statutory-filing-review-v1",
      recordCount: 5,
    });
    expect(statutory.previewRows.map((row) => row.label)).toContain("Labor insurance premium review");
    expect(statutory.previewRows.map((row) => row.label)).toContain("Income tax withholding review");
    expect(statutory.warnings.join(" ")).toContain("does not submit to authorities");
    expect(workspace.exports).toHaveLength(3);
    const download = await downloadPayrollExportPackage(hrSession, statutory.id);
    expect(download.fileName).toBe("hr-one-tw-statutory-filing-2026-06-manifest.csv");
    expect(download.body).toContain("content_hash");
    expect(download.body).toContain("Labor insurance premium review");
    expect(download.body).not.toContain("61000");
    expect((await getPayrollExportWorkspace(hrSession)).exports[0]).toMatchObject({
      id: statutory.id,
      status: "downloaded",
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "payroll_export",
    });
    expect(JSON.stringify(getAuditDemoState().logs[0].metadataJson)).not.toContain("61000");
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      sensitiveValuesRedacted: true,
      downloadManifestOnly: true,
    });
  });

  it("uses verified token vault and customer bank format for bank package readiness", async () => {
    await createPayrollRun(hrSession);
    await resolvePayrollBlockers(hrSession);
    await recalculatePayrollRun(hrSession);
    await confirmPayrollRun(hrSession);
    await lockPayrollRun(hrSession);
    await updatePayrollPaymentSecuritySettings(hrSession, {
      tokenVaultProvider: "aws_secrets_manager",
      tokenVaultRef: "vault://customer/payroll-payment",
      kmsKeyRef: "alias/customer-payroll-payment",
      bankFileFormat: "customer_bank_csv",
      bankFormatVersion: "v2",
      bankFileColumnOrder: ["employee_no", "bank_code", "account_token_ref", "amount", "memo"],
      bankFormatVerified: true,
      verificationStatus: "verified",
    });
    for (const employeeId of [
      "demo-hr-employee",
      "demo-manager-employee",
      "demo-employee-1",
      "demo-employee-2",
      "demo-employee-3",
    ]) {
      await savePaymentProfile(hrSession, {
        employeeId,
        bankCode: "004",
        bankBranchCode: "0123",
        accountName: `Employee ${employeeId}`,
        accountNumber: `1234567890${employeeId.slice(-1)}`,
        effectiveFrom: new Date("2026-06-01"),
      });
    }

    const bank = await generatePayrollExport(hrSession, "bank_transfer");

    expect(bank).toMatchObject({
      exportType: "bank_transfer",
      format: "customer_bank_csv-v2",
    });
    expect(bank.warnings).toContain("Payment token vault and customer_bank_csv v2 verification are configured with 5 mapped column(s).");
    expect(bank.previewRows[0].description).toContain("employee_no, bank_code, account_token_ref, amount, memo");
  });

  it("blocks managers from payroll export access", async () => {
    await expect(getPayrollExportWorkspace(managerSession)).rejects.toThrow(/payroll:manage/);
    await expect(generatePayrollExport(managerSession, "bank_transfer")).rejects.toThrow(/payroll:manage/);
    await expect(generatePayrollExport(managerSession, "statutory_filing")).rejects.toThrow(/payroll:manage/);
    await expect(downloadPayrollExportPackage(managerSession, "export-1")).rejects.toThrow(/payroll:manage/);
  });
});
