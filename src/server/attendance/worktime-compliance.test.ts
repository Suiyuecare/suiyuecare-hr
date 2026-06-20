import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import {
  buildRestDayCycleDays,
  buildWeeklyRegularWorktimeRisks,
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
          employeeName: "王小美",
          riskType: "weekly_regular_worktime",
          severity: "danger",
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

  it("builds weekly regular worktime risks from actual attendance records", () => {
    const risks = buildWeeklyRegularWorktimeRisks({
      employeeId: "employee-weekly-risk",
      employeeName: "週工時員工",
      records: [
        buildAttendanceRecord("2026-06-01", 8),
        buildAttendanceRecord("2026-06-02", 8),
        buildAttendanceRecord("2026-06-03", 8),
        buildAttendanceRecord("2026-06-04", 8),
        buildAttendanceRecord("2026-06-05", 8),
        buildAttendanceRecord("2026-06-06", 1),
      ],
    });

    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      employeeName: "週工時員工",
      riskType: "weekly_regular_worktime",
      severity: "danger",
      detail: expect.stringContaining("2026-06-01 - 2026-06-07"),
    });
    expect(risks[0]?.sourceIds).toContain("tw-lsa-article-30");
  });

  it("builds rest-day cycle evidence from calendar, schedules, and attendance", () => {
    const days = buildRestDayCycleDays({
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-06-07T00:00:00.000Z"),
      calendarDays: [
        { calendarDate: new Date("2026-06-06T00:00:00.000Z"), dayType: "regular_leave" },
        { calendarDate: new Date("2026-06-07T00:00:00.000Z"), dayType: "rest_day" },
      ],
      scheduleDates: [
        new Date("2026-06-01T00:00:00.000Z"),
        new Date("2026-06-02T00:00:00.000Z"),
        new Date("2026-06-03T00:00:00.000Z"),
        new Date("2026-06-04T00:00:00.000Z"),
        new Date("2026-06-05T00:00:00.000Z"),
      ],
      attendanceDates: [new Date("2026-06-07T00:00:00.000Z")],
    });

    expect(days).toEqual([
      { date: "2026-06-01", dayType: "workday" },
      { date: "2026-06-02", dayType: "workday" },
      { date: "2026-06-03", dayType: "workday" },
      { date: "2026-06-04", dayType: "workday" },
      { date: "2026-06-05", dayType: "workday" },
      { date: "2026-06-06", dayType: "regular_leave" },
      { date: "2026-06-07", dayType: "workday" },
    ]);
  });
});

function buildAttendanceRecord(date: string, hours: number) {
  return {
    workDate: new Date(`${date}T00:00:00.000Z`),
    clockInAt: new Date(`${date}T01:00:00.000Z`),
    clockOutAt: new Date(`${date}T${String(1 + hours).padStart(2, "0")}:00:00.000Z`),
  };
}
