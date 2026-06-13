import { describe, expect, it } from "vitest";
import { summarizeAttendanceExceptionResolution } from "@/server/attendance/exceptions";
import type { HrExceptionView } from "@/server/workflows/types";

const baseException: HrExceptionView = {
  id: "exception_1",
  employeeName: "Demo Employee",
  exceptionType: "missing_clock_out",
  severity: "warning",
  status: "pending",
  suggestedResolution: "Request employee punch correction before payroll close.",
  autoResolvable: true,
  resolutionCode: null,
  resolvedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

describe("attendance exception resolution summary", () => {
  it("marks the KPI ready when at least 90 percent are resolved and no high-risk item remains", () => {
    const exceptions = [
      ...Array.from({ length: 9 }, (_, index) => ({
        ...baseException,
        id: `resolved_${index}`,
        status: "approved" as const,
        autoResolvable: false,
        resolvedAt: new Date("2026-06-02T00:00:00.000Z"),
      })),
      {
        ...baseException,
        id: "safe_pending",
      },
    ];

    const summary = summarizeAttendanceExceptionResolution(exceptions);

    expect(summary.resolutionRate).toBe(90);
    expect(summary.autoResolvableCount).toBe(1);
    expect(summary.highRiskCount).toBe(0);
    expect(summary.kpiReady).toBe(true);
  });

  it("keeps legal working-time risks out of safe auto-resolution", () => {
    const summary = summarizeAttendanceExceptionResolution([
      {
        ...baseException,
        id: "worktime_risk",
        exceptionType: "worktime_daily_worktime",
        severity: "danger",
        autoResolvable: false,
      },
    ]);

    expect(summary.autoResolvableCount).toBe(0);
    expect(summary.highRiskCount).toBe(1);
    expect(summary.kpiReady).toBe(false);
  });
});
