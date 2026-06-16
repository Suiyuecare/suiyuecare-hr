import { describe, expect, it } from "vitest";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import type { HrOneKpi } from "@/server/kpis/hr-one";
import type { BetaPilotCheckpointEvidence } from "./beta-pilot-checkpoints";
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
  it("keeps the built-in demo cohort inside the 20-50 person pilot range", () => {
    const overview = getFallbackCompanyOverview();
    const report = buildBetaPilotReadinessReport({
      employeeCount: overview.employeeCount,
      managerCount: overview.managerCount,
      launchReport: readyLaunchReport(),
      kpis: passingKpis,
      payroll: readyPayroll,
      flowEvidence: allFlowEvidence,
    });

    expect(overview.employeeCount).toBe(25);
    expect(overview.managerCount).toBeGreaterThanOrEqual(1);
    expect(report.items.find((item) => item.id === "cohort_size")).toMatchObject({
      status: "ready",
      detail: "25 位員工、1 位主管在目前公司資料中；目標是 20-50 人且至少 1 條主管簽核線。",
    });
  });

  it("requires a 20-50 person cohort for the two-week trial", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 5,
      managerCount: 1,
      launchReport: readyLaunchReport(),
      kpis: passingKpis,
      payroll: readyPayroll,
      flowEvidence: allFlowEvidence,
    });

    expect(report.readyForPilot).toBe(false);
    expect(report.items.find((item) => item.id === "cohort_size")).toMatchObject({
      status: "action_required",
      detail: "5 位員工、1 位主管在目前公司資料中；目標是 20-50 人且至少 1 條主管簽核線。",
    });
    expect(report.runbook.find((step) => step.id === "preflight")).toMatchObject({
      status: "action_required",
      actionHref: "/hr/employee-import",
      openItems: expect.arrayContaining([
        expect.objectContaining({ title: "20-50 人試用名單" }),
      ]),
    });
    expect(report.phases[0]).toMatchObject({
      status: "action_required",
      actionHref: "/hr/employee-import",
    });
  });

  it("requires at least one manager approval line for the pilot cohort", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 25,
      managerCount: 0,
      launchReport: readyLaunchReport(),
      kpis: passingKpis,
      payroll: readyPayroll,
      flowEvidence: allFlowEvidence,
    });

    expect(report.readyForPilot).toBe(false);
    expect(report.items.find((item) => item.id === "cohort_size")).toMatchObject({
      status: "action_required",
      detail: "25 位員工、0 位主管在目前公司資料中；目標是 20-50 人且至少 1 條主管簽核線。",
    });
  });

  it("blocks the pilot when tenant persistence or auth gates are blocked", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 25,
      managerCount: 1,
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
      managerCount: 1,
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
    expect(report.runbook.find((step) => step.id === "day_7")).toMatchObject({
      timing: "第 7 天",
      status: "blocked",
      actionHref: "/hr",
      openItems: expect.arrayContaining([
        expect.objectContaining({ title: "HR 月結與薪資預演", status: "blocked" }),
      ]),
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
      managerCount: 1,
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
      managerCount: 1,
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
    expect(report.runbook.every((step) => step.status === "action_required")).toBe(true);
  });

  it("marks the runbook ready when gate evidence and checkpoint evidence are verified", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 25,
      managerCount: 1,
      trialDays: 14,
      launchReport: readyLaunchReport(),
      kpis: passingKpis,
      payroll: readyPayroll,
      flowEvidence: allFlowEvidence,
      checkpoints: verifiedCheckpoints(),
    });

    expect(report.readyForPilot).toBe(true);
    expect(report.runbook.map((step) => step.id)).toEqual([
      "preflight",
      "day_1",
      "day_3",
      "day_7",
      "day_14",
    ]);
    expect(report.runbook.every((step) => step.status === "ready")).toBe(true);
  });

  it("uses verified checkpoints as product-flow evidence for the pilot gate", () => {
    const report = buildBetaPilotReadinessReport({
      employeeCount: 25,
      managerCount: 1,
      trialDays: 14,
      launchReport: readyLaunchReport(),
      kpis: passingKpis,
      payroll: readyPayroll,
      flowEvidence: {
        roleDashboardSmokePassed: false,
        employeeMobileSmokePassed: false,
        clockInOutSmokePassed: false,
        leaveApprovalSmokePassed: false,
        managerInboxSmokePassed: false,
        announcementReceiptSmokePassed: false,
        payrollCloseSmokePassed: false,
        payslipViewSmokePassed: false,
      },
      checkpoints: verifiedCheckpoints(),
    });

    expect(report.items.find((item) => item.id === "employee_frontstage")).toMatchObject({
      status: "ready",
    });
    expect(report.items.find((item) => item.id === "attendance_leave_approval")).toMatchObject({
      status: "ready",
    });
    expect(report.items.find((item) => item.id === "announcements")).toMatchObject({
      status: "ready",
    });
    expect(report.items.find((item) => item.id === "payroll_dry_run")).toMatchObject({
      status: "ready",
    });
    expect(report.items.find((item) => item.id === "payslip_access")).toMatchObject({
      status: "ready",
    });
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

function verifiedCheckpoints(): BetaPilotCheckpointEvidence[] {
  const now = new Date("2026-06-16T00:00:00.000Z");
  return [
    {
      checkpointId: "preflight",
      status: "verified",
      evidenceType: "access_review",
      evidenceRefHash: "hash-preflight",
      reviewerNoteHash: null,
      nextStepHash: null,
      actorName: "林人資",
      recordedAt: now,
    },
    {
      checkpointId: "day_1",
      status: "verified",
      evidenceType: "announcement_receipt",
      evidenceRefHash: "hash-day-1",
      reviewerNoteHash: null,
      nextStepHash: null,
      actorName: "林人資",
      recordedAt: now,
    },
    {
      checkpointId: "day_3",
      status: "verified",
      evidenceType: "approval_flow",
      evidenceRefHash: "hash-day-3",
      reviewerNoteHash: null,
      nextStepHash: null,
      actorName: "林人資",
      recordedAt: now,
    },
    {
      checkpointId: "day_7",
      status: "verified",
      evidenceType: "payroll_rehearsal",
      evidenceRefHash: "hash-day-7",
      reviewerNoteHash: null,
      nextStepHash: null,
      actorName: "林人資",
      recordedAt: now,
    },
    {
      checkpointId: "day_14",
      status: "verified",
      evidenceType: "audit_export",
      evidenceRefHash: "hash-day-14",
      reviewerNoteHash: null,
      nextStepHash: null,
      actorName: "林人資",
      recordedAt: now,
    },
  ];
}
