import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { getManagerInbox } from "@/server/workflows/service";
import {
  decidePayrollAdjustment,
  getPayrollAdjustmentWorkspace,
  requestPayrollAdjustment,
  resetPayrollAdjustmentDemoState,
} from "./adjustments";

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

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王老闆" },
  employee: { id: "demo-owner-employee", displayName: "王老闆" },
};

describe("payroll adjustments", () => {
  beforeEach(() => {
    resetPayrollAdjustmentDemoState();
    resetAuditDemoState();
  });

  it("requires owner approval before applying an audited adjustment", async () => {
    const adjustment = await requestPayrollAdjustment(hrSession, {
      payrollRunId: "demo-payroll-run",
      employeeId: "demo-employee-1",
      kind: "allowance",
      amount: 1200,
      reason: "Retro meal allowance",
    });
    const workspace = await getPayrollAdjustmentWorkspace(hrSession);

    expect(adjustment).toMatchObject({
      employeeId: "demo-employee-1",
      kind: "allowance",
      amount: 1200,
      status: "pending",
    });
    expect(workspace.adjustments).toHaveLength(1);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "create",
      entityType: "payroll_adjustment",
    });

    const approved = await decidePayrollAdjustment(ownerSession, {
      adjustmentId: adjustment.id,
      decision: "approve",
      comment: "Approved after payroll review",
    });

    expect(approved).toMatchObject({
      status: "applied",
      decisionComment: "Approved after payroll review",
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "approve",
      entityType: "payroll_adjustment",
    });
  });

  it("shows pending payroll adjustments in the unified owner inbox", async () => {
    const adjustment = await requestPayrollAdjustment(hrSession, {
      payrollRunId: "demo-payroll-run",
      employeeId: "demo-employee-1",
      kind: "allowance",
      amount: 800,
      reason: "Retro transport allowance",
    });

    const inbox = await getManagerInbox(ownerSession);

    expect(inbox.pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: adjustment.id,
          type: "payroll_adjustment",
          status: "pending",
          currentStepLabel: "Owner approval",
        }),
      ]),
    );
  });

  it("blocks managers from requesting payroll adjustments", async () => {
    await expect(
      requestPayrollAdjustment(managerSession, {
        payrollRunId: "demo-payroll-run",
        employeeId: "demo-employee-1",
        kind: "deduction",
        amount: 300,
        reason: "Correction",
      }),
    ).rejects.toThrow(/payroll:manage/);
  });

  it("blocks HR from approving payroll adjustments", async () => {
    const adjustment = await requestPayrollAdjustment(hrSession, {
      payrollRunId: "demo-payroll-run",
      employeeId: "demo-employee-1",
      kind: "deduction",
      amount: 300,
      reason: "Correction",
    });

    await expect(
      decidePayrollAdjustment(hrSession, {
        adjustmentId: adjustment.id,
        decision: "approve",
      }),
    ).rejects.toThrow(/payroll_adjustment:approve/);
  });
});
