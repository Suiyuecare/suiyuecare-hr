import { beforeEach, describe, expect, it } from "vitest";
import { explainPayrollException } from "@/server/ai/service";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
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
  confirmPayrollRun,
  createPayrollRun,
  getOwnPayslip,
  getPayrollDashboard,
  lockPayrollRun,
  recalculatePayrollRun,
  releasePayrollPayslips,
  resolvePayrollBlockers,
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

  it("records day 7 beta pilot evidence after payroll release and employee payslip access", async () => {
    await createPayrollRun(hrSession);
    await resolvePayrollBlockers(hrSession);
    await recalculatePayrollRun(hrSession);
    await confirmPayrollRun(hrSession);
    await lockPayrollRun(hrSession);
    await releasePayrollPayslips(hrSession);

    expect(getAuditDemoState().logs[0]).toMatchObject({
      entityType: "beta_pilot_checkpoint",
      entityId: "day_7",
      metadataJson: expect.objectContaining({
        checkpointStatus: "in_progress",
        evidenceType: "payroll_rehearsal",
        missingEvidenceTypes: ["payslip_access"],
      }),
    });

    const payslip = await getOwnPayslip(employeeSession);

    expect(payslip?.employeeId).toBe("demo-employee-1");
    expect(getAuditDemoState().logs[0]).toMatchObject({
      entityType: "beta_pilot_checkpoint",
      entityId: "day_7",
      metadataJson: expect.objectContaining({
        checkpointStatus: "verified",
        evidenceType: "payslip_access",
        fulfilledEvidenceTypes: ["payroll_rehearsal", "payslip_access"],
        missingEvidenceTypes: [],
      }),
    });
    expect(JSON.stringify(getAuditDemoState().logs)).not.toMatch(/56000|62000|78000/);
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
    expect(explanation.summary).toContain("刻意不顯示薪資金額");
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
