import { describe, expect, it } from "vitest";
import { getAttendanceSignoffCoverage, resetAttendanceSignoffDemoState } from "@/server/attendance/signoffs";

const hrSession = {
  role: "hr_admin",
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "HR" },
  employee: { id: "demo-hr-employee", displayName: "HR" },
};

describe("attendance period sign-offs", () => {
  it("summarizes demo coverage for payroll readiness", async () => {
    resetAttendanceSignoffDemoState();

    const coverage = await getAttendanceSignoffCoverage(hrSession);

    expect(coverage.employeeCount).toBe(5);
    expect(coverage.signedCount).toBe(2);
    expect(coverage.coverageRate).toBe(40);
    expect(coverage.readyForPayroll).toBe(false);
    expect(JSON.stringify(coverage)).not.toContain("09:02");
  });
});
