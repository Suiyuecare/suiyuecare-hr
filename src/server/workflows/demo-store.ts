import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { recordDemoProductTelemetryEvent } from "@/server/telemetry/product";
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
    formTemplates: defaultFormTemplates(),
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
  recordDemoProductTelemetryEvent({
    eventName: "form_template_created",
    workflow: "form_builder",
    step: "hr_self_serve",
    success: true,
    metadata: {
      engineeringSupport: false,
      fieldCount: template.fields.length,
      workflowStepCount: template.workflowSteps.length,
      visibilityRuleCount: template.visibilityRules.length,
    },
  });
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
  recordDemoMobileTask("custom_form");
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
  recordDemoProductTelemetryEvent({
    eventName: "leave_request_success",
    workflow: "leave",
    step: "first_success",
    durationMs: estimateDurationMs(input.startAt, 45_000),
    metadata: {
      source: "demo_employee_mobile",
      attachmentCount: request.attachments?.length ?? 0,
    },
  });
  recordDemoMobileTask("leave");
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
  recordDemoMobileTask("overtime");
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
  recordDemoMobileTask("punch_correction");
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
      recordDemoApprovalTelemetry(request.type, input.action, request.createdAt);
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
  recordDemoApprovalTelemetry(request.type, input.action, request.createdAt);
}

function recordDemoMobileTask(taskType: string) {
  recordDemoProductTelemetryEvent({
    eventName: "mobile_task_started",
    workflow: "mobile_task",
    step: "employee_self_service",
    metadata: { taskType },
  });
  recordDemoProductTelemetryEvent({
    eventName: "mobile_task_completed",
    workflow: "mobile_task",
    step: "employee_self_service",
    metadata: { taskType },
  });
}

function recordDemoApprovalTelemetry(type: RequestType, action: ApprovalAction, createdAt: Date) {
  if (type !== "leave") {
    return;
  }
  recordDemoProductTelemetryEvent({
    eventName: "manager_approval_done",
    workflow: "approval",
    step: "manager_leave",
    durationMs: estimateDurationMs(createdAt, 12_000),
    success: action === "approve",
    metadata: { requestType: type },
  });
}

function estimateDurationMs(startedAt: Date, fallbackMs: number) {
  const elapsed = Date.now() - startedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 24 * 60 * 60 * 1000) {
    return fallbackMs;
  }
  return Math.max(1_000, elapsed);
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

function defaultFormTemplates(): FormTemplateView[] {
  return [
    demoTemplate("leave", "請假單", "員工申請特休、病假、事假或其他假別。", "假勤", [
      selectField("leave_type", "假別", ["特休", "病假", "事假", "公假", "喪假", "婚假"]),
      field("start_date", "開始日期", "date"),
      field("end_date", "結束日期", "date"),
      field("reason", "請假原因", "textarea"),
      field("attachment", "附件", "file", false),
    ]),
    demoTemplate("pre-overtime", "預先加班單", "事前申請加班時段與原因。", "假勤", [
      field("work_date", "加班日期", "date"),
      field("start_time", "開始時間", "text"),
      field("end_time", "結束時間", "text"),
      field("reason", "加班原因", "textarea"),
    ]),
    demoTemplate("overtime", "加班單", "加班完成後送出實際加班紀錄。", "假勤", [
      field("work_date", "加班日期", "date"),
      field("actual_start_time", "實際開始時間", "text"),
      field("actual_end_time", "實際結束時間", "text"),
      field("work_summary", "工作內容", "textarea"),
    ]),
    demoTemplate("leave-cancel", "銷假單", "取消已核准或待簽核的請假申請。", "假勤", [
      field("original_leave_no", "原請假單號", "text"),
      field("cancel_reason", "銷假原因", "textarea"),
    ]),
    demoTemplate("missed-punch", "忘刷申請單", "補登忘記打卡或設備異常的出勤時間。", "出勤", [
      field("work_date", "出勤日期", "date"),
      field("clock_time", "補登時間", "text"),
      selectField("punch_type", "補登類型", ["上班", "下班"]),
      field("reason", "原因", "textarea"),
    ]),
    demoTemplate("trip-expense", "出差費用申請單", "申請出差交通、住宿或雜支費用。", "費用", [
      field("trip_date", "出差日期", "date"),
      field("destination", "出差地點", "text"),
      field("amount", "申請金額", "number"),
      field("receipt", "收據附件", "file"),
      field("reason", "出差事由", "textarea"),
    ]),
    demoTemplate("remote-work", "居家遠端辦公申請單", "申請居家或遠端辦公日期與工作安排。", "出勤", [
      field("remote_date", "遠端日期", "date"),
      field("work_location", "工作地點", "text"),
      field("contact_phone", "緊急聯絡電話", "text"),
      field("work_plan", "工作安排", "textarea"),
    ]),
    demoTemplate("people-change", "人事異動單", "申請部門、職稱、主管或職務內容異動。", "人事", [
      selectField("change_type", "異動類型", ["部門異動", "職稱異動", "主管異動", "工作內容異動"]),
      field("effective_date", "生效日", "date"),
      field("change_reason", "異動原因", "textarea"),
    ]),
    demoTemplate("salary-change", "薪資異動單", "申請薪資、津貼或扣項異動，需人資審核。", "薪資", [
      field("effective_date", "生效日", "date"),
      selectField("adjustment_type", "調整類型", ["本薪", "津貼", "扣項", "其他"]),
      field("business_reason", "調整原因", "textarea"),
    ]),
    demoTemplate("resignation", "離職申請表", "員工提出離職申請與交接規劃。", "人事", [
      field("last_work_date", "預計最後工作日", "date"),
      field("reason", "離職原因", "textarea"),
      field("handover_plan", "交接計畫", "textarea"),
    ]),
    demoTemplate("document", "文件證明申請單", "申請各類公司文件或證明。", "文件", [
      selectField("document_type", "文件類型", ["一般證明", "服務證明", "其他"]),
      field("purpose", "用途", "textarea"),
    ]),
    demoTemplate("insurance-certificate", "勞健保證明申請單", "申請勞保、健保相關證明文件。", "文件", [
      selectField("certificate_type", "證明類型", ["勞保", "健保", "勞健保"]),
      field("purpose", "用途", "textarea"),
    ]),
    demoTemplate("employment-certificate", "在職證明申請單", "申請在職證明。", "文件", [
      selectField("language", "語言", ["中文", "英文"]),
      field("purpose", "用途", "textarea"),
    ]),
    demoTemplate("promotion", "人員晉升表", "提出員工晉升建議與理由。", "人事", [
      field("target_title", "建議職稱", "text"),
      field("effective_date", "建議生效日", "date"),
      field("promotion_reason", "晉升理由", "textarea"),
    ]),
    demoTemplate("new-hire", "新進人員表單", "新進人員到職資料與設備需求。", "人事", [
      field("onboard_date", "到職日", "date"),
      field("job_title", "職稱", "text"),
      field("equipment_need", "設備需求", "textarea", false),
    ]),
    demoTemplate("hire-request", "人員進用申請單", "主管提出新增職缺或人員進用需求。", "招募", [
      field("position_title", "職缺名稱", "text"),
      field("headcount", "需求人數", "number"),
      field("hire_reason", "進用原因", "textarea"),
    ]),
    demoTemplate("interview", "晤談紀錄單", "記錄員工關懷、績效溝通或離職晤談重點。", "人事", [
      selectField("interview_type", "晤談類型", ["關懷晤談", "績效溝通", "離職晤談", "其他"]),
      field("interview_date", "晤談日期", "date"),
      field("summary", "紀錄摘要", "textarea"),
    ]),
  ];
}

function demoTemplate(
  id: string,
  title: string,
  description: string,
  category: string,
  fields: FormTemplateView["fields"],
): FormTemplateView {
  return {
    id: `demo-form-${id}`,
    title,
    description,
    category,
    visibilityRules: [],
    visibilitySummary: "所有欄位都會顯示。",
    status: "active",
    fields,
    workflowSteps: [managerStep(), hrStep()],
  };
}

function field(
  id: string,
  label: string,
  type: FormTemplateView["fields"][number]["type"],
  required = true,
) {
  return { id, label, type, required };
}

function selectField(id: string, label: string, options: string[]) {
  return { id, label, type: "select" as const, required: true, options };
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
