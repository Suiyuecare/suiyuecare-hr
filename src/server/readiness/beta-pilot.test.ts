import { describe, expect, it } from "vitest";
import type { HrOneKpi } from "@/server/kpis/hr-one";
import { buildBetaPilotReadinessReport } from "./beta-pilot";
import type { LaunchReadinessItem } from "./launch";

const readyLaunchIds = [
  "database",
  "tenant_seed",
  "security",
  "sso_identities",
  "notifications",
  "privacy",
  "audit",
  "payment_security",
  "support_access",
  "operational_resilience",
  "law_rules",
  "work_rules",
  "labor_roster",
] as const;

const passingKpis: HrOneKpi[] = [
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
].map((id) => ({
  id,
  name: id,
  target: "target",
  current: "passing",
  status: "passing" as const,
  owner: "HR Ops" as const,
  nextStep: "Keep this pilot gate monitored.",
}));

const readyPayroll = {
  runStatus: "released" as const,
  payrollItemCount: 25,
  releasedPayslipCount: 25,
  auditCount: 8,
  checklist: {
    attendanceComplete: true,
    pendingApprovalCount: 0,
    exceptionCount: 0,
    canLock: true,
  },
};

const allFlowEvidence = {
  roleDashboardSmokePassed: true,
  employeeMobileSmokePassed: true,
  clockInOutSmokePassed: true,
  leaveApprovalSmokePassed: true,
  managerInboxSmokePassed: true,
  announcementReceiptSmokePassed: true,
  payrollCloseSmokePassed: true,
  payslipViewSmokePassed: true,
};

describe("beta pilot readiness", () => {
  it("requires a 20-50 person cohort for the two-week trial", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 5,
      launchReport: readyLaunchReport(),
      kpis: passingKpis,
      payroll: readyPayroll,
      flowEvidence: allFlowEvidence,
    });

    expect(report.readyForPilot).toBe(false);
    expect(report.items.find((item) => item.id === "cohort_size")).toMatchObject({
      status: "action_required",
      detail: "5 位員工在目前公司資料中；目標是 20-50 人。",
    });
    expect(report.phases[0]).toMatchObject({
      status: "action_required",
      actionHref: "/hr/employee-import",
    });
  });

  it("blocks the pilot when tenant persistence or auth gates are blocked", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 25,
      launchReport: readyLaunchReport([
        {
          id: "database",
          status: "blocked",
          detail: "DATABASE_URL is missing.",
        },
      ]),
      kpis: passingKpis,
      payroll: readyPayroll,
      flowEvidence: allFlowEvidence,
    });

    expect(report.readyForPilot).toBe(false);
    expect(report.items.find((item) => item.id === "tenant_auth")).toMatchObject({
      status: "blocked",
      actionHref: "/settings/access",
    });
    expect(report.phases[0]).toMatchObject({
      status: "blocked",
    });
  });

  it("requires payroll dry-run and released payslip evidence before trial", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 25,
      launchReport: readyLaunchReport(),
      kpis: passingKpis,
      payroll: {
        runStatus: "blocked",
        payrollItemCount: 0,
        releasedPayslipCount: 0,
        auditCount: 1,
        checklist: {
          attendanceComplete: false,
          pendingApprovalCount: 2,
          exceptionCount: 1,
          canLock: false,
        },
      },
      flowEvidence: {
        ...allFlowEvidence,
        payrollCloseSmokePassed: false,
        payslipViewSmokePassed: false,
      },
    });

    expect(report.readyForPilot).toBe(false);
    expect(report.items.find((item) => item.id === "payroll_dry_run")).toMatchObject({
      status: "blocked",
      actionHref: "/hr",
    });
    expect(report.items.find((item) => item.id === "payslip_access")).toMatchObject({
      status: "action_required",
      actionHref: "/app/payslip",
    });
  });

  it("blocks the pilot when payroll access or audit coverage is not safe", () => {
    const unsafeKpis = passingKpis.map((kpi) =>
      kpi.id === "unauthorized_payroll_access"
        ? { ...kpi, status: "failing" as const, current: "1 escape" }
        : kpi,
    );
    const report = buildBetaPilotReadinessReport({
      employeeCount: 25,
      launchReport: readyLaunchReport([
        {
          id: "payment_security",
          status: "blocked",
          detail: "Token vault is missing.",
        },
      ]),
      kpis: unsafeKpis,
      payroll: readyPayroll,
      flowEvidence: allFlowEvidence,
    });

    expect(report.readyForPilot).toBe(false);
    expect(report.items.find((item) => item.id === "sensitive_data_guardrails")).toMatchObject({
      status: "blocked",
      actionHref: "/settings/audit",
    });
  });

  it("marks the workspace ready only when trial size, flows, payroll, and guardrails are all ready", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 25,
      trialDays: 14,
      launchReport: readyLaunchReport(),
      kpis: passingKpis,
      payroll: readyPayroll,
      flowEvidence: allFlowEvidence,
    });

    expect(report.readyForPilot).toBe(true);
    expect(report.blockedCount).toBe(0);
    expect(report.actionRequiredCount).toBe(0);
    expect(report.phases.every((phase) => phase.status === "ready")).toBe(true);
  });
});

function readyLaunchReport(overrides: Array<Pick<LaunchReadinessItem, "id" | "status" | "detail">> = []) {
  const overrideMap = new Map(overrides.map((item) => [item.id, item]));
  return {
    items: readyLaunchIds.map((id) => {
      const override = overrideMap.get(id);
      return {
        id,
        area: "Security" as const,
        title: id,
        status: override?.status ?? "ready",
        detail: override?.detail ?? `${id} ready`,
        nextStep: "Keep ready.",
        actionLabel: "Open",
        actionHref: "/settings/readiness",
      };
    }),
  };
}
