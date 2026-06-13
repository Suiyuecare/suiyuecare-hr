export type RequestType =
  | "leave"
  | "overtime"
  | "punch_correction"
  | "custom_form"
  | "payroll_adjustment";
export type RequestStatus = "pending" | "approved" | "rejected";
export type PunchSource = "web" | "mobile" | "manual";

export type FormFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "file"
  | "checkbox"
  | "textarea";

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
};

export type AttachmentMetadata = {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string | null;
  scanStatus: "not_required" | "pending" | "clean" | "blocked";
};

export type WorkflowApproverType =
  | "requester"
  | "direct_manager"
  | "department_manager"
  | "hr_admin"
  | "specific_user";

export type WorkflowStepTemplate = {
  id: string;
  order: number;
  label: string;
  approverType: WorkflowApproverType;
  approverRef?: string | null;
  conditionPlaceholder?: string | null;
  condition?: WorkflowStepCondition | null;
};

export type WorkflowStepCondition = {
  type: "field_equals";
  fieldId: string;
  expectedValue: string;
};

export type FormTemplateView = {
  id: string;
  title: string;
  description: string;
  category: string;
  fields: FormField[];
  visibilityRulesPlaceholder: string;
  status: "active" | "inactive";
  workflowSteps: WorkflowStepTemplate[];
};

export type TimelineItem = {
  id: string;
  action: string;
  actorName: string;
  comment?: string | null;
  createdAt: Date;
};

export type WorkflowRequest = {
  id: string;
  type: RequestType;
  employeeId: string;
  employeeName: string;
  managerId: string | null;
  status: RequestStatus;
  title: string;
  detail: string;
  riskSummary: string;
  currentStepLabel?: string;
  createdAt: Date;
  formTemplateId?: string;
  values?: Record<string, string>;
  attachments?: AttachmentMetadata[];
  units?: number;
  minutes?: number;
  workDate?: Date;
  timeline: TimelineItem[];
};

export type AttendanceSummary = {
  workDate: Date;
  shiftName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  clockInSource: PunchSource | null;
  clockOutSource: PunchSource | null;
  status: string;
};

export type LeaveBalanceView = {
  policyId: string;
  policyName: string;
  grantedUnits: number;
  usedUnits: number;
  pendingUnits: number;
  settledUnits?: number;
  carryoverUnits?: number;
  carryoverUsedUnits?: number;
  currentYearUnits?: number;
  currentYearUsedUnits?: number;
  remainingUnits: number;
};

export type NotificationView = {
  id: string;
  title: string;
  body: string;
  linkUrl: string;
  status: "unread" | "read";
  createdAt: Date;
};

export type EmployeeWorkspace = {
  attendance: AttendanceSummary;
  leaveBalance: LeaveBalanceView;
  requests: WorkflowRequest[];
  formTemplates: FormTemplateView[];
  notifications: NotificationView[];
};

export type ManagerInbox = {
  pending: WorkflowRequest[];
  decided: WorkflowRequest[];
  notifications: NotificationView[];
};

export type HrExceptionView = {
  id: string;
  employeeName: string;
  exceptionType: string;
  severity: string;
  status: RequestStatus;
  suggestedResolution?: string;
  autoResolvable?: boolean;
  resolutionCode?: string | null;
  resolvedAt?: Date | null;
  createdAt: Date;
};
