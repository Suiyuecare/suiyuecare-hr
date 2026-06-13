import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getAnnualLeaveGrantWorkspace,
  resetAnnualLeaveGrantDemoState,
  runAnnualLeaveGrantBatch,
  serviceMonthsBetween,
} from "./annual-leave-grants";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

describe("annual leave grant batch", () => {
  beforeEach(() => {
    resetAnnualLeaveGrantDemoState();
    resetAuditDemoState();
  });

  it("calculates service months by anniversary date", () => {
    expect(serviceMonthsBetween(new Date("2024-01-10"), new Date("2026-01-09"))).toBe(23);
    expect(serviceMonthsBetween(new Date("2024-01-10"), new Date("2026-01-10"))).toBe(24);
  });

  it("previews and runs Article 38 annual leave grants with carryover", async () => {
    const asOfDate = new Date("2026-06-12T00:00:00.000Z");
    const preview = await getAnnualLeaveGrantWorkspace(hrSession, asOfDate);
    const employee = preview.rows.find((row) => row.employeeName === "張小安");

    expect(employee).toMatchObject({
      serviceMonths: 29,
      entitlementUnits: 10,
      carryoverUnits: 12,
      totalAvailableUnits: 22,
      sourceIds: ["tw-lsa-article-38"],
    });

    const rows = await runAnnualLeaveGrantBatch(hrSession, asOfDate);
    expect(rows).toHaveLength(5);
    const after = await getAnnualLeaveGrantWorkspace(hrSession, asOfDate);
    expect(after.lastRunAt).toBeInstanceOf(Date);
    expect(after.auditCount).toBe(1);
  });
});
