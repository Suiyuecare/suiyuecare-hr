import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import {
  createWorktimeComplianceExceptions,
  getWorktimeComplianceWorkspace,
  resetWorktimeComplianceDemoState,
} from "./worktime-compliance";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

describe("worktime compliance", () => {
  beforeEach(() => {
    resetWorktimeComplianceDemoState();
    resetAuditDemoState();
  });

  it("scans worktime risks and records exception batch audit", async () => {
    const workspace = await getWorktimeComplianceWorkspace(hrSession, {
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-06-30T00:00:00.000Z"),
    });

    expect(workspace.risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeName: "張小安",
          riskType: "daily_worktime",
          severity: "danger",
        }),
        expect.objectContaining({
          employeeName: "陳主管",
          riskType: "monthly_overtime",
          severity: "warning",
        }),
        expect.objectContaining({
          employeeName: "李小真",
          riskType: "rest_day_cycle",
          severity: "danger",
        }),
      ]),
    );

    await createWorktimeComplianceExceptions(hrSession, {
      periodStart: workspace.periodStart,
      periodEnd: workspace.periodEnd,
    });
    const after = await getWorktimeComplianceWorkspace(hrSession, {
      periodStart: workspace.periodStart,
      periodEnd: workspace.periodEnd,
    });
    expect(after.auditCount).toBe(1);
  });
});
