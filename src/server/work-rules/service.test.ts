import { describe, expect, it } from "vitest";
import {
  article70WorkRuleItems,
  evaluateWorkRuleReadiness,
  getWorkRulesWorkspace,
  resetWorkRulesDemoState,
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
  it("keeps the demo pilot cohort fully acknowledged", async () => {
    resetWorkRulesDemoState();
    const workspace = await getWorkRulesWorkspace({
      role: "hr_admin",
      tenantId: "demo-tenant",
      companyId: "demo-company",
      user: { id: "demo-user-hr", displayName: "林人資" },
      employee: { id: "demo-hr-employee", displayName: "林人資" },
    });

    expect(workspace.readiness).toMatchObject({
      ready: true,
      acknowledgedCount: 25,
      requiredAcknowledgementCount: 25,
      pendingReviewCount: 0,
      article70Required: false,
      article70CoveredCount: article70WorkRuleItems.length,
    });
  });

  it("passes when approved active work rules are acknowledged by active employees", () => {
    const report = evaluateWorkRuleReadiness({
      rules: [rule],
      acknowledgements: ["emp_1", "emp_2"].map(acknowledgement),
      activeEmployeeCount: 2,
      activeEmployeeIds: ["emp_1", "emp_2"],
    });

    expect(report.ready).toBe(true);
    expect(report.detail).toContain("2/2 acknowledgement");
    expect(report.article70Required).toBe(false);
  });

  it("checks Article 70 coverage when the company reaches 30 active employees", () => {
    const report = evaluateWorkRuleReadiness({
      rules: [
        {
          ...rule,
          title: "出勤與加班規則",
          category: "延長工作時間",
          summary: "Only overtime handling is configured.",
        },
      ],
      acknowledgements: Array.from({ length: 30 }, (_, index) => acknowledgement(`emp_${index + 1}`)),
      activeEmployeeCount: 30,
      activeEmployeeIds: Array.from({ length: 30 }, (_, index) => `emp_${index + 1}`),
    });

    expect(report.ready).toBe(false);
    expect(report.article70Required).toBe(true);
    expect(report.article70CoveredCount).toBe(1);
    expect(report.article70MissingItems).toContain("工資標準、計算方法與發放日期");
    expect(report.missing).toContain("Labor Standards Act Article 70 work-rule coverage");
  });

  it("treats a comprehensive employee handbook as covering Article 70 items", () => {
    const report = evaluateWorkRuleReadiness({
      rules: [
        {
          ...rule,
          title: "綜合工作規則與員工手冊",
          category: "綜合工作規則",
          summary: "依勞基法第70條 12 款整理公司工作規則。",
        },
      ],
      acknowledgements: Array.from({ length: 30 }, (_, index) => acknowledgement(`emp_${index + 1}`)),
      activeEmployeeCount: 30,
      activeEmployeeIds: Array.from({ length: 30 }, (_, index) => `emp_${index + 1}`),
    });

    expect(report.ready).toBe(true);
    expect(report.article70Required).toBe(true);
    expect(report.article70CoveredCount).toBe(article70WorkRuleItems.length);
    expect(report.article70MissingItems).toHaveLength(0);
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
