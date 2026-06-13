import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import {
  calculateDemoPayrollRun,
  confirmDemoPayrollRun,
  createDemoPayrollRun,
  lockDemoPayrollRun,
  resetPayrollDemoState,
  resolveDemoPayrollBlockers,
} from "@/server/payroll/demo-store";
import { getDemoEmployeeWorkspace, resetDemoWorkflowState } from "@/server/workflows/demo-store";
import {
  getAnnualLeaveSettlementWorkspace,
  prepareAnnualLeaveSettlements,
  resetAnnualLeaveSettlementDemoState,
} from "./annual-leave-settlements";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

describe("annual leave settlements", () => {
  beforeEach(() => {
    resetPayrollDemoState();
    resetAnnualLeaveSettlementDemoState();
    resetDemoWorkflowState();
    resetAuditDemoState();
  });

  it("prepares HR-reviewed unused annual leave settlements and payroll includes them", async () => {
    const run = createDemoPayrollRun();
    resolveDemoPayrollBlockers();

    const settlements = await prepareAnnualLeaveSettlements(hrSession, {
      payrollRunId: run.id,
      reason: "year_end",
    });
    expect(settlements).toHaveLength(2);
    expect(settlements[0]).toMatchObject({
      status: "draft",
      sourceIds: ["tw-lsa-article-38", "tw-lsa-enforcement-article-24-1"],
    });

    const calculated = calculateDemoPayrollRun();
    expect(calculated.items.find((item) => item.code === "unused_annual_leave_payout")).toMatchObject({
      employeeId: "demo-employee-1",
      amount: 4667,
      metadata: expect.objectContaining({
        sources: [
          expect.objectContaining({ id: "tw-lsa-article-38" }),
          expect.objectContaining({ id: "tw-lsa-enforcement-article-24-1" }),
        ],
      }),
    });

    const workspace = await getAnnualLeaveSettlementWorkspace(hrSession);
    expect(workspace.settlements.every((settlement) => settlement.status === "included")).toBe(true);
    expect(workspace.auditCount).toBeGreaterThan(0);

    confirmDemoPayrollRun();
    lockDemoPayrollRun();
    expect(getDemoEmployeeWorkspace().leaveBalance.remainingUnits).toBe(9.5);
  });
});
