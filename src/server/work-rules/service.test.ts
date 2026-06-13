import { describe, expect, it } from "vitest";
import {
  evaluateWorkRuleReadiness,
  type CompanyWorkRuleView,
  type EmployeeWorkRuleAcknowledgementView,
} from "@/server/work-rules/service";

const rule: CompanyWorkRuleView = {
  id: "rule_1",
  title: "Employee handbook",
  category: "Company rules",
  summary: "Attendance, leave, overtime, and workplace expectations.",
  version: "2026.01",
  status: "active",
  reviewStatus: "approved",
  sourceRef: "doc://handbook",
  contentHash: "hash_1",
  acknowledgementRequired: true,
  effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
  publishedAt: new Date("2026-06-01T00:00:00.000Z"),
};

function acknowledgement(employeeId: string): EmployeeWorkRuleAcknowledgementView {
  return {
    id: `ack_${employeeId}`,
    employeeId,
    employeeName: employeeId,
    workRuleId: rule.id,
    workRuleTitle: rule.title,
    version: rule.version,
    acknowledgementHash: `hash_${employeeId}`,
    source: "employee_self_service",
    acknowledgedAt: new Date("2026-06-02T00:00:00.000Z"),
  };
}

describe("work rules readiness", () => {
  it("passes when approved active work rules are acknowledged by active employees", () => {
    const report = evaluateWorkRuleReadiness({
      rules: [rule],
      acknowledgements: ["emp_1", "emp_2"].map(acknowledgement),
      activeEmployeeCount: 2,
      activeEmployeeIds: ["emp_1", "emp_2"],
    });

    expect(report.ready).toBe(true);
    expect(report.detail).toContain("2/2 acknowledgement");
  });

  it("blocks when acknowledgement coverage is incomplete", () => {
    const report = evaluateWorkRuleReadiness({
      rules: [rule],
      acknowledgements: [acknowledgement("emp_1")],
      activeEmployeeCount: 2,
      activeEmployeeIds: ["emp_1", "emp_2"],
    });

    expect(report.ready).toBe(false);
    expect(report.missing).toContain("employee acknowledgement coverage");
  });

  it("blocks rules that have not been approved for HR/legal review", () => {
    const report = evaluateWorkRuleReadiness({
      rules: [{ ...rule, reviewStatus: "pending_review" }],
      acknowledgements: ["emp_1", "emp_2"].map(acknowledgement),
      activeEmployeeCount: 2,
      activeEmployeeIds: ["emp_1", "emp_2"],
    });

    expect(report.ready).toBe(false);
    expect(report.missing).toContain("HR/legal review approval for all work rules");
  });
});
