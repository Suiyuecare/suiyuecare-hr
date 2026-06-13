import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getAnnualLeaveExpiryWorkspace,
  resetAnnualLeaveExpiryDemoState,
  sendAnnualLeaveExpiryReminders,
} from "./annual-leave-expiry";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

describe("annual leave expiry reminders", () => {
  beforeEach(() => {
    resetAnnualLeaveExpiryDemoState();
    resetAuditDemoState();
  });

  it("flags annual leave expiry risk and records reminder audit", async () => {
    const asOfDate = new Date("2026-11-15T00:00:00.000Z");
    const workspace = await getAnnualLeaveExpiryWorkspace(hrSession, {
      asOfDate,
      warningDays: 60,
    });

    expect(workspace.risks[0]).toMatchObject({
      employeeName: "張小安",
      remainingUnits: 12,
      carryoverRemainingUnits: 2.5,
      daysUntilExpiry: 46,
      severity: "warning",
    });

    const reminded = await sendAnnualLeaveExpiryReminders(hrSession, {
      asOfDate,
      warningDays: 60,
    });
    expect(reminded).toHaveLength(2);

    const after = await getAnnualLeaveExpiryWorkspace(hrSession, {
      asOfDate,
      warningDays: 60,
    });
    expect(after.auditCount).toBe(1);
  });
});
