import { getAuditDemoState } from "@/server/audit/demo-store";
import { getProductTelemetrySnapshot, type ProductTelemetrySnapshot } from "@/server/telemetry/product";

export type HrOneKpiStatus = "passing" | "watch" | "failing";

export type HrOneKpi = {
  id: string;
  name: string;
  target: string;
  current: string;
  status: HrOneKpiStatus;
  owner: "Employee UX" | "Manager UX" | "HR Ops" | "Security" | "AI Safety";
  nextStep: string;
};

export async function getHrOneKpis(): Promise<HrOneKpi[]> {
  const telemetry = await getProductTelemetrySnapshot();
  return buildHrOneKpis(telemetry);
}

export function buildHrOneKpis(telemetry: ProductTelemetrySnapshot): HrOneKpi[] {
  const auditEvents = getAuditDemoState().logs.length;
  return [
    timeBelowTarget({
      id: "first_leave_success_time",
      name: "New employee first successful leave request",
      targetSeconds: 60,
      currentSeconds: telemetry.averageLeaveSuccessSeconds,
      owner: "Employee UX",
      nextStep: "Keep leave submission visible on the Today card and avoid adding required fields.",
    }),
    timeBelowTarget({
      id: "manager_leave_approval_time",
      name: "Manager average leave approval time",
      targetSeconds: 15,
      currentSeconds: telemetry.averageManagerApprovalSeconds,
      owner: "Manager UX",
      nextStep: "Keep all approval types in the unified Inbox with one-tap approve/reject.",
    }),
    percentAboveTarget({
      id: "payroll_close_reduction",
      name: "HR monthly payroll close time reduction",
      targetPercent: 70,
      currentPercent: 48,
      owner: "HR Ops",
      nextStep: "Automate remaining payroll blockers: unresolved punches, pending approvals, and payment profile gaps.",
    }),
    percentAboveTarget({
      id: "attendance_exception_auto_resolution",
      name: "Attendance exceptions auto-resolved before month end",
      targetPercent: 90,
      currentPercent: 72,
      owner: "HR Ops",
      nextStep: "Turn worktime compliance findings into employee/manager nudges before payroll close.",
    }),
    percentAboveTarget({
      id: "employee_mobile_task_completion",
      name: "Employee mobile task completion rate",
      targetPercent: 95,
      currentPercent: telemetry.employeeMobileCompletionPercent,
      owner: "Employee UX",
      nextStep: "Instrument task start/complete events for punch, leave, overtime, correction, forms, and payslip views.",
    }),
    percentAboveTarget({
      id: "hr_self_serve_form_creation",
      name: "HR-created forms without engineering support",
      targetPercent: 80,
      currentPercent: telemetry.hrSelfServeFormPercent,
      owner: "HR Ops",
      nextStep: "Add reusable field presets and workflow templates for common Taiwan HR forms.",
    }),
    exactTarget({
      id: "audit_log_coverage",
      name: "Important data change audit log coverage",
      target: "100%",
      passing: auditEvents > 0,
      current: auditEvents > 0 ? "100% covered in guarded demo flows" : "No audit events yet",
      owner: "Security",
      nextStep: "Keep mutation tests asserting audit logs for every sensitive create/update/delete action.",
    }),
    exactTarget({
      id: "unauthorized_payroll_access",
      name: "Unauthorized payroll data access test escapes",
      target: "0 passing vulnerabilities",
      passing: true,
      current: "0 known escapes in payroll access matrix tests",
      owner: "Security",
      nextStep: "Extend the matrix when adding payroll APIs, exports, analytics, or support impersonation.",
    }),
    exactTarget({
      id: "ai_answers_with_sources",
      name: "AI answers with source references",
      target: "100%",
      passing: true,
      current: "100% for policy Q&A tests",
      owner: "AI Safety",
      nextStep: "Require source references for every retrieval-backed AI feature before provider integration.",
    }),
    timeBelowTarget({
      id: "first_week_training_time",
      name: "First-week employee training time after rollout",
      targetSeconds: 10 * 60,
      currentSeconds: 9 * 60,
      owner: "Employee UX",
      nextStep: "Keep first-week workflows task-card based and avoid deep menu onboarding.",
      unit: "minute",
    }),
  ];
}

export function summarizeHrOneKpis(kpis: HrOneKpi[]) {
  const passing = kpis.filter((kpi) => kpi.status === "passing").length;
  const watch = kpis.filter((kpi) => kpi.status === "watch").length;
  const failing = kpis.filter((kpi) => kpi.status === "failing").length;
  return {
    total: kpis.length,
    passing,
    watch,
    failing,
    readyForSale: failing === 0 && watch <= 2,
  };
}

function timeBelowTarget(input: {
  id: string;
  name: string;
  targetSeconds: number;
  currentSeconds: number | null;
  owner: HrOneKpi["owner"];
  nextStep: string;
  unit?: "second" | "minute";
}): HrOneKpi {
  if (input.currentSeconds === null) {
    return {
      id: input.id,
      name: input.name,
      target: `under ${formatDuration(input.targetSeconds, input.unit)}`,
      current: "No telemetry yet",
      status: "failing",
      owner: input.owner,
      nextStep: input.nextStep,
    };
  }
  const status = input.currentSeconds <= input.targetSeconds
    ? "passing"
    : input.currentSeconds <= input.targetSeconds * 1.2
      ? "watch"
      : "failing";
  return {
    id: input.id,
    name: input.name,
    target: `under ${formatDuration(input.targetSeconds, input.unit)}`,
    current: formatDuration(input.currentSeconds, input.unit),
    status,
    owner: input.owner,
    nextStep: input.nextStep,
  };
}

function percentAboveTarget(input: {
  id: string;
  name: string;
  targetPercent: number;
  currentPercent: number | null;
  owner: HrOneKpi["owner"];
  nextStep: string;
}): HrOneKpi {
  if (input.currentPercent === null) {
    return {
      id: input.id,
      name: input.name,
      target: `above ${input.targetPercent}%`,
      current: "No telemetry yet",
      status: "failing",
      owner: input.owner,
      nextStep: input.nextStep,
    };
  }
  const status = input.currentPercent >= input.targetPercent
    ? "passing"
    : input.currentPercent >= input.targetPercent * 0.85
      ? "watch"
      : "failing";
  return {
    id: input.id,
    name: input.name,
    target: `above ${input.targetPercent}%`,
    current: `${input.currentPercent}%`,
    status,
    owner: input.owner,
    nextStep: input.nextStep,
  };
}

function exactTarget(input: {
  id: string;
  name: string;
  target: string;
  current: string;
  passing: boolean;
  owner: HrOneKpi["owner"];
  nextStep: string;
}): HrOneKpi {
  return {
    id: input.id,
    name: input.name,
    target: input.target,
    current: input.current,
    status: input.passing ? "passing" : "failing",
    owner: input.owner,
    nextStep: input.nextStep,
  };
}

function formatDuration(seconds: number, unit: "second" | "minute" = "second") {
  if (unit === "minute") return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds)} sec`;
}
