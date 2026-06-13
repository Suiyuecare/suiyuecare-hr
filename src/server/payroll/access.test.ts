import { beforeEach, describe, expect, it } from "vitest";
import { explainPayrollException } from "@/server/ai/service";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import {
  resetRuleSettingsDemoState,
  updateTaiwanLaborStandardsConfig,
} from "@/server/rules/settings";
import {
  calculateDemoPayrollRun,
  createDemoPayrollRun,
  lockDemoPayrollRun,
  releaseDemoPayslips,
  resetPayrollDemoState,
  resolveDemoPayrollBlockers,
  confirmDemoPayrollRun,
} from "./demo-store";
import {
  canViewPayslip,
  getOwnPayslip,
  getPayrollDashboard,
} from "./service";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王執行長" },
  employee: null,
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("payroll access matrix", () => {
  beforeEach(() => {
    resetPayrollDemoState();
    resetRuleSettingsDemoState();
    resetAuditDemoState();
  });

  it("keeps payroll dashboard restricted to payroll roles", async () => {
    await expect(getPayrollDashboard(hrSession)).resolves.toBeDefined();
    await expect(getPayrollDashboard(managerSession)).rejects.toThrow(/payroll:manage/);
    await expect(getPayrollDashboard(employeeSession)).rejects.toThrow(/payroll:manage/);
  });

  it("allows employees to view only their own released payslip", async () => {
    createDemoPayrollRun();
    resolveDemoPayrollBlockers();
    calculateDemoPayrollRun();
    confirmDemoPayrollRun();
    lockDemoPayrollRun();
    releaseDemoPayslips();

    const payslip = await getOwnPayslip(employeeSession);

    expect(payslip?.employeeId).toBe("demo-employee-1");
    expect(canViewPayslip(employeeSession, "demo-employee-1")).toBe(true);
    expect(canViewPayslip(employeeSession, "demo-employee-2")).toBe(false);
    expect(canViewPayslip(managerSession, "demo-employee-1")).toBe(false);
    expect(canViewPayslip(hrSession, "demo-employee-1")).toBe(true);
  });

  it("blocks managers from self-service payslip access in the single-role demo", async () => {
    createDemoPayrollRun();
    resolveDemoPayrollBlockers();
    calculateDemoPayrollRun();
    confirmDemoPayrollRun();
    lockDemoPayrollRun();
    releaseDemoPayslips();

    await expect(getOwnPayslip(managerSession)).rejects.toThrow(/Unauthorized payslip access/);
  });

  it("keeps AI payroll explanations payroll-only and amount-redacted", async () => {
    createDemoPayrollRun();
    resolveDemoPayrollBlockers();
    calculateDemoPayrollRun();

    await expect(explainPayrollException(employeeSession, "base_salary")).rejects.toThrow(/ai:payroll_explain/);

    const explanation = await explainPayrollException(hrSession, "base_salary");
    expect(explanation.summary).toContain("Amounts are intentionally not shown");
    expect(JSON.stringify(explanation)).not.toMatch(/56000|58000|62000|78000/);
  });

  it("requires payroll recalculation when active law rules change after a draft", async () => {
    createDemoPayrollRun();
    resolveDemoPayrollBlockers();
    const firstDraft = calculateDemoPayrollRun();
    const firstRuleVersionId = firstDraft.ruleVersionId;
    confirmDemoPayrollRun();

    await updateTaiwanLaborStandardsConfig(ownerSession, {
      changeControl: {
        reason: "Payroll statutory settings reviewed after draft calculation",
        sourceUrl: "https://laws.mol.gov.tw/",
        reviewedBy: "林人資",
        reviewStatus: "approved",
        requiresPayrollRecalculation: true,
      },
      payrollStandardMonthlyHours: 228,
    });

    const dashboard = await getPayrollDashboard(hrSession);

    expect(dashboard.checklist.ruleReview.needsRecalculation).toBe(true);
    expect(dashboard.checklist.canLock).toBe(false);
    expect(() => lockDemoPayrollRun()).toThrow(/Payroll cannot be locked/);

    const recalculated = calculateDemoPayrollRun();
    confirmDemoPayrollRun();
    lockDemoPayrollRun();

    expect(recalculated.ruleVersionId).not.toBe(firstRuleVersionId);
  });
});
