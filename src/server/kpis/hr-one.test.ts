import { describe, expect, it } from "vitest";
import { buildHrOneKpis, getHrOneKpis, summarizeHrOneKpis } from "./hr-one";

describe("HR One winning KPIs", () => {
  it("tracks the product success metrics required for sale readiness", async () => {
    const kpis = await getHrOneKpis();

    expect(kpis.map((kpi) => kpi.id)).toEqual([
      "first_leave_success_time",
      "manager_leave_approval_time",
      "payroll_close_reduction",
      "attendance_exception_auto_resolution",
      "employee_mobile_task_completion",
      "hr_self_serve_form_creation",
      "audit_log_coverage",
      "unauthorized_payroll_access",
      "ai_answers_with_sources",
      "first_week_training_time",
    ]);
    expect(kpis.find((kpi) => kpi.id === "unauthorized_payroll_access")).toMatchObject({
      target: "0 passing vulnerabilities",
      status: "passing",
      owner: "Security",
    });
    expect(kpis.find((kpi) => kpi.id === "ai_answers_with_sources")).toMatchObject({
      target: "100%",
      status: "passing",
      owner: "AI Safety",
    });
  });

  it("marks sale readiness false while operational KPIs still need attention", async () => {
    const summary = summarizeHrOneKpis(await getHrOneKpis());

    expect(summary.total).toBe(10);
    expect(summary.failing).toBeGreaterThan(0);
    expect(summary.readyForSale).toBe(false);
  });

  it("marks missing telemetry as failing instead of guessing", () => {
    const kpis = buildHrOneKpis({
      averageLeaveSuccessSeconds: null,
      averageManagerApprovalSeconds: null,
      employeeMobileCompletionPercent: null,
      hrSelfServeFormPercent: null,
      eventCount: 0,
    });

    expect(kpis.find((kpi) => kpi.id === "first_leave_success_time")).toMatchObject({
      current: "No telemetry yet",
      status: "failing",
    });
    expect(kpis.find((kpi) => kpi.id === "employee_mobile_task_completion")).toMatchObject({
      current: "No telemetry yet",
      status: "failing",
    });
  });
});
