import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import {
  hasShiftConflict,
  nextApprovalStatus,
  overtimeMinutes,
  overtimeThresholdWarning,
  reserveLeaveUnits,
  settleLeaveUnits,
  type ApprovalAction,
} from "./rules";
import type {
  AttendanceSummary,
  EmployeeWorkspace,
  FormField,
  FormTemplateView,
  HrExceptionView,
  LeaveBalanceView,
  ManagerInbox,
  NotificationView,
  PunchSource,
  RequestType,
  TimelineItem,
  WorkflowRequest,
} from "./types";
import {
  summarizeVisibilityRules,
  visibleFormFields,
  visibilityRulesFromFields,
} from "./form-visibility";
import { readWorkflowCondition, stepConditionMatches } from "./workflow-engine";

type DemoNotification = NotificationView & {
  recipientRole: "employee" | "manager" | "hr_admin" | "owner";
};

type DemoState = {
  attendance: AttendanceSummary;
  leaveBalance: LeaveBalanceView;
  formTemplates: FormTemplateView[];
  requests: WorkflowRequest[];
  notifications: DemoNotification[];
  exceptions: HrExceptionView[];
  auditCount: number;
};

const globalForDemo = globalThis as unknown as {
  hrOneDemoWorkflowState?: DemoState;
};

const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const atToday = (hour: number, minute = 0) => {
  const date = today();
  date.setHours(hour, minute, 0, 0);
  return date;
};

function initialState(): DemoState {
  return {
    attendance: {
      workDate: today(),
      shiftName: "Regular 09:00-18:00",
      scheduledStart: atToday(9),
      scheduledEnd: atToday(18),
      clockInAt: null,
      clockOutAt: null,
      clockInSource: null,
      clockOutSource: null,
      status: "not_started",
    },
    leaveBalance: {
      policyId: "demo-leave-annual",
      policyName: "Annual leave",
      grantedUnits: 14,
      usedUnits: 2,
      pendingUnits: 0,
      settledUnits: 0,
      carryoverUnits: 2.5,
      carryoverUsedUnits: 0,
      currentYearUnits: 11.5,
      currentYearUsedUnits: 2,
      remainingUnits: 12,
    },
    formTemplates: [defaultFormTemplate()],
    requests: [],
    notifications: [],
    exceptions: [
      {
        id: "demo-exception-missing-clock-out",
        employeeName: "李小真",
        exceptionType: "missing_clock_out",
        severity: "warning",
        status: "pending",
        suggestedResolution: "Request employee punch correction before payroll close.",
        autoResolvable: true,
        resolutionCode: null,
        resolvedAt: null,
        createdAt: atToday(10),
      },
    ],
    auditCount: 1,
  };
}

export function getDemoWorkflowState() {
  if (!globalForDemo.hrOneDemoWorkflowState) {
    globalForDemo.hrOneDemoWorkflowState = initialState();
  }

  return globalForDemo.hrOneDemoWorkflowState;
}

export function resetDemoWorkflowState() {
  globalForDemo.hrOneDemoWorkflowState = initialState();
}

export function settleDemoAnnualLeaveBalance(units: number) {
  const state = getDemoWorkflowState();
  const carryoverRemaining = Math.max(
    0,
    roundUnits((state.leaveBalance.carryoverUnits ?? 0) - (state.leaveBalance.carryoverUsedUnits ?? 0)),
  );
  const carryoverApplied = Math.min(carryoverRemaining, units);
  const currentYearApplied = roundUnits(units - carryoverApplied);
  state.leaveBalance = {
    ...state.leaveBalance,
    settledUnits: roundUnits((state.leaveBalance.settledUnits ?? 0) + units),
    carryoverUsedUnits: roundUnits((state.leaveBalance.carryoverUsedUnits ?? 0) + carryoverApplied),
    currentYearUsedUnits: roundUnits((state.leaveBalance.currentYearUsedUnits ?? 0) + currentYearApplied),
    remainingUnits: Math.max(0, roundUnits(state.leaveBalance.remainingUnits - units)),
  };
  state.auditCount += 1;
  return state.leaveBalance;
}

export function getDemoEmployeeWorkspace(): EmployeeWorkspace {
  const state = getDemoWorkflowState();
  return {
    attendance: state.attendance,
    leaveBalance: state.leaveBalance,
    requests: state.requests.filter((request) => request.employeeId === "demo-employee-1"),
    formTemplates: state.formTemplates.filter((template) => template.status === "active"),
    notifications: state.notifications.filter(
      (notification) => notification.recipientRole === "employee",
    ),
  };
}

function roundUnits(value: number) {
  return Math.round(value * 100) / 100;
}

export function getDemoManagerInbox(role: string, employeeId?: string | null): ManagerInbox {
  const state = getDemoWorkflowState();
  const approverId = role === "hr_admin" ? "demo-hr-employee" : employeeId ?? "demo-manager-employee";
  const managerRequests = state.requests.filter((request) => request.managerId === approverId);
  return {
    pending: managerRequests.filter((request) => request.status === "pending"),
    decided: managerRequests.filter((request) => request.status !== "pending"),
    notifications: state.notifications.filter(
      (notification) => notification.recipientRole === (role === "hr_admin" ? "hr_admin" : "manager"),
    ),
  };
}

export function getDemoFormTemplates() {
  return getDemoWorkflowState().formTemplates;
}

export function createDemoFormTemplate(input: {
  title: string;
  description: string;
  category: string;
  fields: FormField[];
  workflowStepTypes: Array<"direct_manager" | "hr_admin">;
  hrCondition?: { fieldId: string; expectedValue: string } | null;
}) {
  const state = getDemoWorkflowState();
  const template: FormTemplateView = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    category: input.category,
    fields: input.fields,
    visibilityRules: visibilityRulesFromFields(input.fields),
    visibilitySummary: summarizeVisibilityRules(input.fields),
    status: "active",
    workflowSteps: input.workflowStepTypes.map((step, index) => buildWorkflowStep(step, index + 1, input.hrCondition)),
  };
  state.formTemplates.unshift(template);
  state.auditCount += 1;
  return template;
}

export function submitDemoCustomForm(input: {
  templateId: string;
  values: Record<string, string>;
}) {
  const state = getDemoWorkflowState();
  const template = state.formTemplates.find((item) => item.id === input.templateId);
  if (!template || template.status !== "active") {
    throw new Error("Form template is not active.");
  }
  const visibleFields = visibleFormFields(template.fields, input.values);
  const missing = visibleFields.find((field) => field.required && !input.values[field.id]);
  if (missing) {
    throw new Error(`${missing.label} is required.`);
  }
  const firstStep = template.workflowSteps.find((step) => stepConditionMatches(step.condition ?? null, input.values)) ?? managerStep();
  const request = createRequest({
    type: "custom_form",
    title: template.title,
    detail: summarizeValues(visibleFields, input.values),
    riskSummary: `${template.category} form · ${visibleFields.length}/${template.fields.length} visible field(s) · low-code submission.`,
    currentStepLabel: firstStep.label,
    managerId: approverIdForStep(firstStep),
    formTemplateId: template.id,
    values: input.values,
  });
  request.timeline.push(timeline("submitted", "張小安", template.title));
  state.requests.unshift(request);
  notifyForApprover(firstStep, "New form submission", `張小安 submitted ${template.title}.`);
  state.auditCount += 1;
}

export function getDemoHrExceptions() {
  return getDemoWorkflowState().exceptions;
}

export function resolveDemoHrException(input: {
  exceptionId: string;
  resolutionCode: string;
}) {
  const state = getDemoWorkflowState();
  const exception = state.exceptions.find((item) => item.id === input.exceptionId);
  if (!exception) throw new Error("Attendance exception not found.");
  exception.status = "approved";
  exception.resolutionCode = input.resolutionCode;
  exception.resolvedAt = new Date();
  state.auditCount += 1;
  return exception;
}

export function resolveDemoSafeHrExceptions() {
  const state = getDemoWorkflowState();
  let resolvedCount = 0;
  for (const exception of state.exceptions) {
    if (exception.status === "pending" && exception.autoResolvable) {
      exception.status = "approved";
      exception.resolutionCode = "employee_self_correction_requested";
      exception.resolvedAt = new Date();
      resolvedCount += 1;
    }
  }
  if (resolvedCount > 0) state.auditCount += 1;
  return { resolvedCount };
}

export function clockDemo(source: PunchSource, direction: "in" | "out") {
  const state = getDemoWorkflowState();
  const now = new Date();

  if (direction === "in") {
    state.attendance.clockInAt = now;
    state.attendance.clockInSource = source;
    state.attendance.status = "clocked_in";
  } else {
    state.attendance.clockOutAt = now;
    state.attendance.clockOutSource = source;
    state.attendance.status = "complete";
  }

  state.auditCount += 1;
}

export function submitDemoLeave(input: {
  startAt: Date;
  endAt: Date;
  units: number;
  reason: string;
}) {
  const state = getDemoWorkflowState();
  const reservation = reserveLeaveUnits(state.leaveBalance, input.units);
  if (!reservation.ok) {
    throw new Error(reservation.reason ?? "Unable to reserve leave.");
  }

  state.leaveBalance = {
    ...state.leaveBalance,
    ...reservation.balance,
  };
  const conflict = hasShiftConflict(input.startAt, input.endAt, state.attendance);
  const request = createRequest({
    type: "leave",
    title: "Annual leave",
    detail: `${formatDateTime(input.startAt)} - ${formatDateTime(input.endAt)} · ${input.units} day(s)`,
    riskSummary: conflict ?? `${state.leaveBalance.remainingUnits} day(s) remaining after this request.`,
    units: input.units,
  });
  request.timeline.push(timeline("submitted", "張小安", input.reason));
  state.requests.unshift(request);
  notify("manager", "New leave request", "張小安 submitted annual leave for approval.");
  state.auditCount += 1;
}

export function submitDemoOvertime(input: {
  startAt: Date;
  endAt: Date;
  reason: string;
}, policy = {
  regularDailyMinutes: 540,
  overtimeWarningDailyMinutes: 720,
}) {
  const state = getDemoWorkflowState();
  const minutes = overtimeMinutes(input.startAt, input.endAt);
  const warning = overtimeThresholdWarning({
    regularMinutes: policy.regularDailyMinutes,
    overtimeMinutes: minutes,
    thresholdMinutes: policy.overtimeWarningDailyMinutes,
  });
  const request = createRequest({
    type: "overtime",
    title: "Overtime request",
    detail: `${formatDateTime(input.startAt)} - ${formatDateTime(input.endAt)} · ${minutes} minutes`,
    riskSummary: warning ?? "Within configured daily work-hour threshold.",
    minutes,
  });
  request.timeline.push(timeline("submitted", "張小安", input.reason));
  state.requests.unshift(request);
  notify("manager", "New overtime request", "張小安 submitted overtime for approval.");
  state.auditCount += 1;
}

export function submitDemoPunchCorrection(input: {
  workDate: Date;
  requestedClockInAt?: Date | null;
  requestedClockOutAt?: Date | null;
  reason: string;
}) {
  const state = getDemoWorkflowState();
  const detail = [
    input.requestedClockInAt ? `Clock in ${formatTime(input.requestedClockInAt)}` : null,
    input.requestedClockOutAt ? `Clock out ${formatTime(input.requestedClockOutAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const request = createRequest({
    type: "punch_correction",
    title: "Punch correction",
    detail: detail || "Correction requested",
    riskSummary: "Manual punch correction requires manager review.",
    workDate: input.workDate,
  });
  request.timeline.push(timeline("submitted", "張小安", input.reason));
  state.requests.unshift(request);
  notify("manager", "New punch correction", "張小安 submitted a missing punch correction.");
  state.auditCount += 1;
}

export function decideDemoApproval(input: {
  requestId: string;
  action: ApprovalAction;
  comment: string;
}) {
  const state = getDemoWorkflowState();
  const request = state.requests.find((item) => item.id === input.requestId);
  if (!request) {
    throw new Error("Approval request not found.");
  }

  const nextStatus = nextApprovalStatus(request.status, input.action);
  const actorName = actorNameForApprover(request.managerId);
  if (request.type === "custom_form" && input.action === "approve") {
    const nextStep = nextCustomFormStep(request);
    request.timeline.push(timeline("approved", actorName, input.comment));
    if (nextStep) {
      request.managerId = approverIdForStep(nextStep);
      request.currentStepLabel = nextStep.label;
      notifyForApprover(nextStep, "Form approval needed", `${request.employeeName} submitted ${request.title}.`);
      state.auditCount += 1;
      return;
    }
  }
  request.status = nextStatus;
  if (request.type !== "custom_form" || input.action !== "approve") {
    request.timeline.push(timeline(nextStatus, actorName, input.comment));
  }

  if (request.type === "leave" && request.units) {
    state.leaveBalance = {
      ...state.leaveBalance,
      ...settleLeaveUnits(state.leaveBalance, request.units, input.action),
    };
  }

  if (request.type === "punch_correction" && input.action === "approve") {
    state.attendance.status = "corrected";
  }

  notify(
    "employee",
    `Request ${nextStatus}`,
    `${request.title} was ${nextStatus} by ${actorName}.`,
  );
  state.auditCount += 1;
}

function createRequest(input: {
  type: RequestType;
  title: string;
  detail: string;
  riskSummary: string;
  currentStepLabel?: string;
  managerId?: string;
  values?: Record<string, string>;
  formTemplateId?: string;
  units?: number;
  minutes?: number;
  workDate?: Date;
}): WorkflowRequest {
  return {
    id: crypto.randomUUID(),
    type: input.type,
    employeeId: "demo-employee-1",
    employeeName: "張小安",
    status: "pending",
    title: input.title,
    detail: input.detail,
    riskSummary: input.riskSummary,
    currentStepLabel: input.currentStepLabel ?? "Manager review",
    managerId: input.managerId ?? "demo-manager-employee",
    formTemplateId: input.formTemplateId,
    values: input.values,
    units: input.units,
    minutes: input.minutes,
    workDate: input.workDate,
    createdAt: new Date(),
    timeline: [],
  };
}

function defaultFormTemplate(): FormTemplateView {
  return {
    id: "demo-form-equipment",
    title: "Equipment request",
    description: "Request work equipment or accessories.",
    category: "Employee service",
    visibilityRules: [],
    visibilitySummary: "All fields are always shown.",
    status: "active",
    fields: [
      { id: "item", label: "Requested item", type: "text", required: true },
      { id: "needed_by", label: "Needed by", type: "date", required: true },
      { id: "reason", label: "Reason", type: "textarea", required: true },
    ],
    workflowSteps: [managerStep(), hrStep()],
  };
}

function managerStep() {
  return {
    id: "demo-step-manager",
    order: 1,
    label: "Manager review",
    approverType: "direct_manager" as const,
    conditionPlaceholder: null,
    condition: null,
  };
}

function hrStep() {
  return {
    id: "demo-step-hr",
    order: 2,
    label: "HR review",
    approverType: "hr_admin" as const,
    conditionPlaceholder: null,
    condition: null,
  };
}

function nextCustomFormStep(request: WorkflowRequest) {
  const state = getDemoWorkflowState();
  const template = state.formTemplates.find((item) => item.id === request.formTemplateId);
  if (!template) return null;
  const currentOrder = template.workflowSteps.find((step) => step.label === request.currentStepLabel)?.order ?? 1;
  return [...template.workflowSteps]
    .sort((a, b) => a.order - b.order)
    .find((step) => step.order > currentOrder && stepConditionMatches(step.condition ?? null, request.values ?? {})) ?? null;
}

function buildWorkflowStep(
  step: "direct_manager" | "hr_admin",
  order: number,
  hrCondition?: { fieldId: string; expectedValue: string } | null,
) {
  const condition = step === "hr_admin" && hrCondition?.fieldId && hrCondition.expectedValue
    ? { type: "field_equals" as const, fieldId: hrCondition.fieldId, expectedValue: hrCondition.expectedValue }
    : null;
  return {
    id: crypto.randomUUID(),
    order,
    label: step === "hr_admin" ? "HR review" : "Manager review",
    approverType: step,
    conditionPlaceholder: null,
    condition: readWorkflowCondition(condition),
  };
}

function approverIdForStep(step: { approverType: string }) {
  return step.approverType === "hr_admin" ? "demo-hr-employee" : "demo-manager-employee";
}

function notifyForApprover(step: { approverType: string }, title: string, body: string) {
  notify(step.approverType === "hr_admin" ? "hr_admin" : "manager", title, body);
}

function actorNameForApprover(approverId: string | null) {
  return approverId === "demo-hr-employee" ? "林人資" : "陳主管";
}

function summarizeValues(fields: FormField[], values: Record<string, string>) {
  return fields
    .slice(0, 3)
    .map((field) => `${field.label}: ${values[field.id] ?? "-"}`)
    .join(" · ");
}

function timeline(action: string, actorName: string, comment?: string): TimelineItem {
  return {
    id: crypto.randomUUID(),
    action,
    actorName,
    comment,
    createdAt: new Date(),
  };
}

function notify(
  recipientRole: DemoNotification["recipientRole"],
  title: string,
  body: string,
) {
  getDemoWorkflowState().notifications.unshift({
    id: crypto.randomUUID(),
    recipientRole,
    title,
    body,
    linkUrl: recipientRole === "manager" ? "/manager/inbox" : "/app",
    status: "unread",
    createdAt: new Date(),
  });
}

export function getDemoCompanyOverviewWithWorkflow() {
  const overview = getFallbackCompanyOverview();
  const state = getDemoWorkflowState();
  return {
    ...overview,
    auditCount: state.auditCount,
  };
}

function formatDateTime(date: Date) {
  return `${date.toLocaleDateString("zh-TW")} ${formatTime(date)}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
