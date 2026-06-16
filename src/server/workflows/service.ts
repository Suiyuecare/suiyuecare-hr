import { Prisma, type PrismaClient } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { listAttendanceExceptions } from "@/server/attendance/exceptions";
import { getActiveAttendancePolicy } from "@/server/attendance/policies";
import { hasPermission, roleKeys, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { sendNotificationInTransaction, type NotificationEventType } from "@/server/notifications/service";
import { listPayrollAdjustments, type PayrollAdjustmentView } from "@/server/payroll/adjustments";
import { recordBetaPilotAutomatedEvidence } from "@/server/readiness/beta-pilot-checkpoints";
import { recordProductTelemetryEvent } from "@/server/telemetry/product";
import {
  flattenFormAttachments,
  normalizeAttachmentMetadata,
  readAttachmentMetadata,
  summarizeAttachmentsForAudit,
  summarizeAttachmentsForDisplay,
  type AttachmentInput,
} from "./attachments";
import {
  readFormVisibilityRules,
  summarizeVisibilityRules,
  visibilityRulesFromFields,
  visibleFormFields,
} from "./form-visibility";
import {
  clockDemo,
  createDemoFormTemplate,
  decideDemoApproval,
  getDemoEmployeeWorkspace,
  getDemoFormTemplates,
  getDemoWorkflowState,
  getDemoManagerInbox,
  submitDemoCustomForm,
  submitDemoLeave,
  submitDemoOvertime,
  submitDemoPunchCorrection,
} from "./demo-store";
import {
  hasShiftConflict,
  nextApprovalStatus,
  overtimeMinutes,
  overtimeThresholdWarning,
  reserveLeaveUnits,
  settleLeaveUnits,
  type ApprovalAction,
} from "./rules";
import { findNextWorkflowStep, getStepLabel, readWorkflowCondition, stepConditionMatches } from "./workflow-engine";
import type {
  EmployeeWorkspace,
  AttachmentMetadata,
  FormField,
  FormTemplateView,
  ManagerInbox,
  NotificationView,
  PunchSource,
  RequestType,
  WorkflowRequest,
} from "./types";

type SessionLike = {
  role: string;
  tenantId: string | null;
  companyId: string | null;
  user: { id: string; displayName: string } | null;
  employee: { id: string; displayName: string; managerId?: string | null } | null;
};

type ApprovalWorkflowRequestType = Exclude<RequestType, "payroll_adjustment">;

export async function getEmployeeWorkspace(session: SessionLike) {
  if (!canUseDatabase(session)) {
    return getDemoEmployeeWorkspace();
  }

  try {
    return await getPrismaEmployeeWorkspace(getDb(), session);
  } catch {
    return getDemoEmployeeWorkspace();
  }
}

export async function getManagerInbox(session: SessionLike) {
  const role = asRoleKey(session.role);
  const payrollItems = role && hasPermission(role, "payroll_adjustment:approve")
    ? await getPayrollAdjustmentInboxItems(session)
    : [];
  if (!canUseDatabase(session)) {
    const inbox = getDemoManagerInbox(session.role, session.employee?.id);
    return {
      ...inbox,
      pending: [...payrollItems.filter((item) => item.status === "pending"), ...inbox.pending],
      decided: [...payrollItems.filter((item) => item.status !== "pending"), ...inbox.decided],
    };
  }

  try {
    const inbox = await getPrismaManagerInbox(getDb(), session);
    return {
      ...inbox,
      pending: [...payrollItems.filter((item) => item.status === "pending"), ...inbox.pending],
      decided: [...payrollItems.filter((item) => item.status !== "pending"), ...inbox.decided],
    };
  } catch {
    const inbox = getDemoManagerInbox(session.role, session.employee?.id);
    return {
      ...inbox,
      pending: [...payrollItems.filter((item) => item.status === "pending"), ...inbox.pending],
      decided: [...payrollItems.filter((item) => item.status !== "pending"), ...inbox.decided],
    };
  }
}

export async function getFormTemplates(session?: SessionLike) {
  if (session && canUseDatabase(session)) {
    try {
      const templates = await getDb().formTemplate.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        include: {
          workflowSteps: {
            orderBy: { stepOrder: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return templates.map(mapFormTemplate);
    } catch {
      return getDemoFormTemplates();
    }
  }
  return getDemoFormTemplates();
}

export async function createFormTemplate(
  session: SessionLike,
  input: {
    title: string;
    description: string;
    category: string;
    fields: FormField[];
    workflowStepTypes: Array<"direct_manager" | "hr_admin">;
    hrCondition?: { fieldId: string; expectedValue: string } | null;
  },
) {
  if (session.role !== "hr_admin" && session.role !== "owner") {
    throw new Error("Only HR can create form templates.");
  }
  if (canUseDatabase(session)) {
    const db = getDb();
    await db.$transaction(async (tx) => {
      const template = await tx.formTemplate.create({
        data: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          title: input.title,
          description: input.description,
          category: input.category,
          fieldsJson: input.fields,
          visibilityRulesJson: visibilityRulesFromFields(input.fields),
        },
      });
      await tx.workflowTemplateStep.createMany({
        data: input.workflowStepTypes.map((step, index) => ({
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          formTemplateId: template.id,
          stepOrder: index + 1,
          approverType: step,
          conditionJson: buildStepConditionJson(step, input.hrCondition),
        })),
      });
      await writeAuditLog(tx, {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        actorUserId: session.user?.id,
        actorEmployeeId: session.employee?.id,
        action: "create",
        entityType: "form_template",
        entityId: template.id,
        after: template,
        metadata: {
          workflowSteps: input.workflowStepTypes,
          hrCondition: input.hrCondition ?? null,
          visibilityRuleCount: visibilityRulesFromFields(input.fields).length,
        },
      });
    });
    await recordWorkflowTelemetry(session, {
      eventName: "form_template_created",
      workflow: "form_builder",
      step: "hr_self_serve",
      metadata: {
        engineeringSupport: false,
        fieldCount: input.fields.length,
        workflowStepCount: input.workflowStepTypes.length,
        visibilityRuleCount: visibilityRulesFromFields(input.fields).length,
      },
    });
    return;
  }
  createDemoFormTemplate(input);
}

export async function createCustomFormSubmission(
  session: SessionLike,
  input: {
    templateId: string;
    values: Record<string, string>;
    attachments?: Record<string, AttachmentInput[] | undefined>;
    telemetryStartedAt?: Date | null;
  },
) {
  if (!session.employee) {
    throw new Error("Employee session required.");
  }
  const employee = session.employee;
  if (canUseDatabase(session)) {
    const db = getDb();
    await db.$transaction(async (tx) => {
      const template = await tx.formTemplate.findFirstOrThrow({
        where: {
          id: input.templateId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          status: "active",
        },
        include: {
          workflowSteps: {
            orderBy: { stepOrder: "asc" },
          },
        },
      });
      const fields = template.fieldsJson as FormField[];
      const visibleFields = visibleFormFields(fields, input.values);
      const missing = visibleFields.find((field) => field.required && !input.values[field.id]);
      if (missing) {
        throw new Error(`${missing.label} is required.`);
      }
      const attachments = flattenFormAttachments(
        visibleFields,
        Object.fromEntries(
          Object.entries(input.attachments ?? {}).map(([fieldId, items]) => [
            fieldId,
            (items ?? [])
              .map((item) => normalizeAttachmentMetadata(item))
              .filter((item): item is AttachmentMetadata => Boolean(item)),
          ]),
        ),
      );
      const firstStep = template.workflowSteps.find((step) =>
        stepConditionMatches(step.conditionJson, input.values),
      );
      if (!firstStep) {
        throw new Error("Form workflow must have at least one review step.");
      }
      const approver = await getApproverForWorkflowStep(tx, session, firstStep.approverType);
      const submission = await tx.formSubmission.create({
        data: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          formTemplateId: template.id,
          employeeId: employee.id,
          valuesJson: input.values,
          attachmentMetadataJson: attachments.length > 0 ? attachments : Prisma.JsonNull,
          currentStepOrder: firstStep.stepOrder,
        },
      });
      await createApprovalRecords(tx, session, {
        type: "custom_form",
        requestId: submission.id,
        formSubmissionId: submission.id,
        requesterEmployeeId: employee.id,
        approverEmployeeId: approver.id,
        actorEmployeeId: employee.id,
        action: "submitted",
        comment: template.title,
        riskSummary: `${template.category} form · ${visibleFields.length}/${fields.length} visible field(s) · ${summarizeAttachmentsForDisplay(attachments)}.`,
      });
      await notify(
        tx,
        session,
        approver.userId,
        "New form submission",
        `${employee.displayName} submitted ${template.title}.`,
        "/manager/inbox",
        "approval_submitted",
      );
      await auditCreate(tx, session, "form_submission", submission.id, submission, {
        ...summarizeAttachmentsForAudit(attachments),
      });
    });
    await recordMobileTaskTelemetry(session, "custom_form", input.telemetryStartedAt);
    return;
  }
  submitDemoCustomForm(input);
}

export async function getHrAttendanceExceptions(session: SessionLike) {
  return listAttendanceExceptions(session);
}

export async function clockAttendance(
  session: SessionLike,
  input: { direction: "in" | "out"; source: PunchSource },
) {
  if (!canUseDatabase(session)) {
    clockDemo(input.source, input.direction);
    await recordAttendanceCheckpoint(session, input.direction);
    return;
  }

  const db = getDb();
  const workDate = startOfToday();
  const now = new Date();

  await db.$transaction(async (tx) => {
    const existing = await tx.attendanceRecord.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: session.employee!.id,
          workDate,
        },
      },
    });

    const record = await tx.attendanceRecord.upsert({
      where: {
        employeeId_workDate: {
          employeeId: session.employee!.id,
          workDate,
        },
      },
      create: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: session.employee!.id,
        workDate,
        clockInAt: input.direction === "in" ? now : null,
        clockOutAt: input.direction === "out" ? now : null,
        clockInSource: input.direction === "in" ? input.source : null,
        clockOutSource: input.direction === "out" ? input.source : null,
        status: input.direction === "in" ? "clocked_in" : "complete",
      },
      update:
        input.direction === "in"
          ? {
              clockInAt: now,
              clockInSource: input.source,
              status: "clocked_in",
            }
          : {
              clockOutAt: now,
              clockOutSource: input.source,
              status: "complete",
            },
    });

    await tx.clockEvent.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: session.employee!.id,
        eventType: input.direction === "in" ? "clock_in" : "clock_out",
        eventAt: now,
        source: input.source,
      },
    });

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "attendance_record",
      entityId: record.id,
      before: existing,
      after: record,
      metadata: {
        direction: input.direction,
        source: input.source,
      },
    });
  });
  await recordAttendanceCheckpoint(session, input.direction);
}

export async function createLeaveRequest(
  session: SessionLike,
  input: {
    startAt: Date;
    endAt: Date;
    units: number;
    reason: string;
    attachment?: AttachmentInput | null;
    telemetryStartedAt?: Date | null;
  },
) {
  if (!canUseDatabase(session)) {
    submitDemoLeave(input);
    return;
  }

  const db = getDb();
  await db.$transaction(async (tx) => {
    const context = await getRequestContext(tx, session);
    const balance = await tx.leaveBalance.findFirstOrThrow({
      where: {
        employeeId: session.employee!.id,
      },
      include: {
        leavePolicy: true,
      },
    });
    const numericBalance = {
      grantedUnits: Number(balance.grantedUnits),
      usedUnits: Number(balance.usedUnits),
      pendingUnits: Number(balance.pendingUnits),
      settledUnits: Number(balance.settledUnits),
    };
    const reservation = reserveLeaveUnits(numericBalance, input.units);
    if (!reservation.ok) {
      throw new Error(reservation.reason ?? "Unable to submit leave.");
    }

    const schedule = await tx.workSchedule.findFirst({
      where: {
        employeeId: session.employee!.id,
        workDate: startOfDate(input.startAt),
      },
    });
    const conflictWarning = hasShiftConflict(input.startAt, input.endAt, schedule);
    const attachment = normalizeAttachmentMetadata(input.attachment ?? {});
    const attachments = attachment ? [attachment] : [];
    const request = await tx.leaveRequest.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: session.employee!.id,
        leavePolicyId: balance.leavePolicyId,
        startAt: input.startAt,
        endAt: input.endAt,
        units: input.units,
        reason: input.reason,
        attachmentPlaceholder: attachments.length > 0 ? "metadata_reference" : null,
        attachmentMetadataJson: attachments.length > 0 ? attachments : Prisma.JsonNull,
        conflictWarning,
      },
    });
    await tx.leaveBalance.update({
      where: {
        id: balance.id,
      },
      data: {
        pendingUnits: reservation.balance.pendingUnits,
        remainingUnits: reservation.balance.remainingUnits,
      },
    });

    await createApprovalRecords(tx, session, {
      type: "leave",
      requestId: request.id,
      leaveRequestId: request.id,
      requesterEmployeeId: session.employee!.id,
      approverEmployeeId: context.manager.id,
      actorEmployeeId: session.employee!.id,
      action: "submitted",
      comment: input.reason,
      riskSummary:
        conflictWarning ??
        `${reservation.balance.remainingUnits} day(s) remaining after this request. ${summarizeAttachmentsForDisplay(attachments)}.`,
    });
    await notify(tx, session, context.manager.userId, "New leave request", `${session.employee!.displayName} submitted leave for approval.`, "/manager/inbox", "approval_submitted");
    await auditCreate(tx, session, "leave_request", request.id, request, {
      ...summarizeAttachmentsForAudit(attachments),
    });
  });
  await recordWorkflowTelemetry(session, {
    eventName: "leave_request_success",
    workflow: "leave",
    step: "first_success",
    durationMs: durationSince(input.telemetryStartedAt),
    metadata: {
      source: "employee_self_service",
      attachmentProvided: Boolean(input.attachment?.fileName || input.attachment?.storageKey),
    },
  });
  await recordMobileTaskTelemetry(session, "leave", input.telemetryStartedAt);
}

export async function createOvertimeRequest(
  session: SessionLike,
  input: { startAt: Date; endAt: Date; reason: string; telemetryStartedAt?: Date | null },
) {
  const policy = await getActiveAttendancePolicy({
    ...session,
    role: asRoleKey(session.role) ?? "employee",
  });
  if (!canUseDatabase(session)) {
    submitDemoOvertime(input, {
      regularDailyMinutes: policy.regularDailyMinutes,
      overtimeWarningDailyMinutes: policy.overtimeWarningDailyMinutes,
    });
    return;
  }

  const db = getDb();
  await db.$transaction(async (tx) => {
    const context = await getRequestContext(tx, session);
    const minutes = overtimeMinutes(input.startAt, input.endAt);
    const warning = overtimeThresholdWarning({
      regularMinutes: policy.regularDailyMinutes,
      overtimeMinutes: minutes,
      thresholdMinutes: policy.overtimeWarningDailyMinutes,
    });
    const request = await tx.overtimeRequest.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: session.employee!.id,
        startAt: input.startAt,
        endAt: input.endAt,
        minutes,
        reason: input.reason,
        thresholdWarning: warning,
      },
    });
    await createApprovalRecords(tx, session, {
      type: "overtime",
      requestId: request.id,
      overtimeRequestId: request.id,
      requesterEmployeeId: session.employee!.id,
      approverEmployeeId: context.manager.id,
      actorEmployeeId: session.employee!.id,
      action: "submitted",
      comment: input.reason,
      riskSummary: warning ?? "Within configured daily work-hour threshold.",
    });
    await notify(tx, session, context.manager.userId, "New overtime request", `${session.employee!.displayName} submitted overtime for approval.`, "/manager/inbox", "approval_submitted");
    await auditCreate(tx, session, "overtime_request", request.id, request);
  });
  await recordMobileTaskTelemetry(session, "overtime", input.telemetryStartedAt);
}

export async function createPunchCorrectionRequest(
  session: SessionLike,
  input: {
    workDate: Date;
    requestedClockInAt?: Date | null;
    requestedClockOutAt?: Date | null;
    reason: string;
    telemetryStartedAt?: Date | null;
  },
) {
  if (!canUseDatabase(session)) {
    submitDemoPunchCorrection(input);
    return;
  }

  const db = getDb();
  await db.$transaction(async (tx) => {
    const context = await getRequestContext(tx, session);
    const request = await tx.punchCorrectionRequest.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: session.employee!.id,
        workDate: startOfDate(input.workDate),
        requestedClockInAt: input.requestedClockInAt,
        requestedClockOutAt: input.requestedClockOutAt,
        reason: input.reason,
      },
    });
    await createApprovalRecords(tx, session, {
      type: "punch_correction",
      requestId: request.id,
      punchCorrectionRequestId: request.id,
      requesterEmployeeId: session.employee!.id,
      approverEmployeeId: context.manager.id,
      actorEmployeeId: session.employee!.id,
      action: "submitted",
      comment: input.reason,
      riskSummary: "Manual punch correction requires manager review.",
    });
    await notify(tx, session, context.manager.userId, "New punch correction", `${session.employee!.displayName} submitted a missing punch correction.`, "/manager/inbox", "approval_submitted");
    await auditCreate(tx, session, "punch_correction_request", request.id, request);
  });
  await recordMobileTaskTelemetry(session, "punch_correction", input.telemetryStartedAt);
}

export async function decideApproval(
  session: SessionLike,
  input: { requestId: string; action: ApprovalAction; comment: string },
) {
  if (!canUseDatabase(session)) {
    decideDemoApproval(input);
    await recordApprovalCheckpoint(
      session,
      input.requestId,
      getDemoWorkflowState().requests.find((request) => request.id === input.requestId)?.type ?? null,
    );
    return;
  }

  const db = getDb();
  let decidedRequestType: RequestType | null = null;
  await db.$transaction(async (tx) => {
    const task = await tx.approvalTask.findFirstOrThrow({
      where: {
        requestId: input.requestId,
        approverEmployeeId: session.employee!.id,
      },
    });
    decidedRequestType = task.requestType;
    const nextStatus = nextApprovalStatus(task.status, input.action);
    await tx.approvalTask.update({
      where: { id: task.id },
      data: {
        status: nextStatus,
        decidedAt: new Date(),
      },
    });

    const requester = await tx.employee.findUniqueOrThrow({
      where: { id: task.requesterEmployeeId },
    });

    if (task.requestType === "custom_form" && task.formSubmissionId) {
      await decideCustomFormApproval(tx, session, {
        task,
        nextStatus,
        action: input.action,
        comment: input.comment,
        requester,
      });
      return;
    }

    await updateRequestStatus(tx, task.requestType, task.requestId, nextStatus);

    if (task.requestType === "leave" && task.leaveRequestId) {
      const request = await tx.leaveRequest.findUniqueOrThrow({
        where: { id: task.leaveRequestId },
      });
      const balance = await tx.leaveBalance.findFirstOrThrow({
        where: {
          employeeId: request.employeeId,
          leavePolicyId: request.leavePolicyId,
        },
      });
      const settled = settleLeaveUnits(
        {
          grantedUnits: Number(balance.grantedUnits),
          usedUnits: Number(balance.usedUnits),
          pendingUnits: Number(balance.pendingUnits),
          settledUnits: Number(balance.settledUnits),
          carryoverUnits: Number(balance.carryoverUnits),
          carryoverUsedUnits: Number(balance.carryoverUsedUnits),
          currentYearUnits: Number(balance.currentYearUnits),
          currentYearUsedUnits: Number(balance.currentYearUsedUnits),
        },
        Number(request.units),
        input.action,
      );
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          usedUnits: settled.usedUnits,
          pendingUnits: settled.pendingUnits,
          carryoverUsedUnits: settled.carryoverUsedUnits,
          currentYearUsedUnits: settled.currentYearUsedUnits,
          remainingUnits: settled.remainingUnits,
        },
      });
    }

    if (task.requestType === "punch_correction" && task.punchCorrectionRequestId && input.action === "approve") {
      const request = await tx.punchCorrectionRequest.findUniqueOrThrow({
        where: { id: task.punchCorrectionRequestId },
      });
      await tx.attendanceRecord.upsert({
        where: {
          employeeId_workDate: {
            employeeId: request.employeeId,
            workDate: request.workDate,
          },
        },
        create: {
          tenantId: request.tenantId,
          companyId: request.companyId,
          employeeId: request.employeeId,
          workDate: request.workDate,
          clockInAt: request.requestedClockInAt,
          clockOutAt: request.requestedClockOutAt,
          clockInSource: request.requestedClockInAt ? "manual" : null,
          clockOutSource: request.requestedClockOutAt ? "manual" : null,
          status: "corrected",
        },
        update: {
          clockInAt: request.requestedClockInAt ?? undefined,
          clockOutAt: request.requestedClockOutAt ?? undefined,
          clockInSource: request.requestedClockInAt ? "manual" : undefined,
          clockOutSource: request.requestedClockOutAt ? "manual" : undefined,
          status: "corrected",
        },
      });
    }

    await tx.approvalEvent.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        approvalTaskId: task.id,
        requestType: task.requestType,
        requestId: task.requestId,
        leaveRequestId: task.leaveRequestId,
        overtimeRequestId: task.overtimeRequestId,
        punchCorrectionRequestId: task.punchCorrectionRequestId,
        formSubmissionId: task.formSubmissionId,
        actorEmployeeId: session.employee!.id,
        action: nextStatus,
        comment: input.comment,
      },
    });

    if (requester.userId) {
      await notify(
        tx,
        session,
        requester.userId,
        `Request ${nextStatus}`,
        `Your ${labelForType(task.requestType)} was ${nextStatus}.`,
        "/app",
        "approval_decision",
      );
    }

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: input.action === "approve" ? "approve" : "reject",
      entityType: `${task.requestType}_request`,
      entityId: task.requestId,
      metadata: {
        comment: input.comment,
        status: nextStatus,
      },
    });
  });
  await recordApprovalCheckpoint(session, input.requestId, decidedRequestType);
  await recordApprovalTelemetry(session, input.requestId, input.action);
}

async function decideCustomFormApproval(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  input: {
    task: {
      id: string;
      tenantId: string;
      companyId: string;
      requestType: ApprovalWorkflowRequestType;
      requestId: string;
      formSubmissionId: string | null;
      requesterEmployeeId: string;
      riskSummary: string;
    };
    nextStatus: "approved" | "rejected";
    action: ApprovalAction;
    comment: string;
    requester: { id: string; displayName: string; userId: string | null };
  },
) {
  const submission = await tx.formSubmission.findUniqueOrThrow({
    where: { id: input.task.formSubmissionId! },
    include: {
      formTemplate: {
        include: {
          workflowSteps: {
            orderBy: { stepOrder: "asc" },
          },
        },
      },
    },
  });

  if (input.action === "reject") {
    await tx.formSubmission.update({
      where: { id: submission.id },
      data: { status: "rejected" },
    });
    await createCustomFormDecisionSideEffects(tx, session, {
      task: input.task,
      action: input.action,
      status: "rejected",
      comment: input.comment,
      requester: input.requester,
      employeeNotificationBody: `Your custom form was rejected.`,
    });
    return;
  }

  const nextStep = findNextWorkflowStep({
    steps: submission.formTemplate.workflowSteps,
    currentStepOrder: submission.currentStepOrder,
    values: submission.valuesJson as Record<string, string>,
  });

  if (!nextStep) {
    await tx.formSubmission.update({
      where: { id: submission.id },
      data: { status: "approved" },
    });
    await createCustomFormDecisionSideEffects(tx, session, {
      task: input.task,
      action: input.action,
      status: "approved",
      comment: input.comment,
      requester: input.requester,
      employeeNotificationBody: `Your custom form was approved.`,
    });
    return;
  }

  const approver = await getApproverForWorkflowStep(tx, session, nextStep.approverType);
  await tx.formSubmission.update({
    where: { id: submission.id },
    data: {
      status: "pending",
      currentStepOrder: nextStep.stepOrder,
    },
  });
  await createApprovalRecords(tx, session, {
    type: "custom_form",
    requestId: submission.id,
    formSubmissionId: submission.id,
    requesterEmployeeId: input.requester.id,
    approverEmployeeId: approver.id,
    actorEmployeeId: session.employee!.id,
    action: "routed",
    comment: getStepLabel(nextStep),
    riskSummary: input.task.riskSummary,
  });
  await notify(
    tx,
    session,
    approver.userId,
    "Form approval needed",
    `${input.requester.displayName} submitted ${submission.formTemplate.title}.`,
    "/manager/inbox",
    "approval_submitted",
  );
  await createCustomFormDecisionEvent(tx, session, {
    task: input.task,
    status: "approved",
    comment: input.comment,
  });
  await writeAuditLog(tx, {
    tenantId: session.tenantId!,
    companyId: session.companyId!,
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    action: "approve",
    entityType: "custom_form_workflow_step",
    entityId: submission.id,
    metadata: {
      comment: input.comment,
      fromStepOrder: submission.currentStepOrder,
      toStepOrder: nextStep.stepOrder,
      nextApproverType: nextStep.approverType,
    },
  });
}

async function createCustomFormDecisionSideEffects(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  input: {
    task: {
      id: string;
      requestType: ApprovalWorkflowRequestType;
      requestId: string;
      formSubmissionId: string | null;
    };
    action: ApprovalAction;
    status: "approved" | "rejected";
    comment: string;
    requester: { userId: string | null };
    employeeNotificationBody: string;
  },
) {
  await createCustomFormDecisionEvent(tx, session, {
    task: input.task,
    status: input.status,
    comment: input.comment,
  });
  if (input.requester.userId) {
    await notify(
      tx,
      session,
      input.requester.userId,
      `Request ${input.status}`,
      input.employeeNotificationBody,
      "/app",
      "approval_decision",
    );
  }
  await writeAuditLog(tx, {
    tenantId: session.tenantId!,
    companyId: session.companyId!,
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    action: input.action === "approve" ? "approve" : "reject",
    entityType: "custom_form_request",
    entityId: input.task.requestId,
    metadata: {
      comment: input.comment,
      status: input.status,
    },
  });
}

async function createCustomFormDecisionEvent(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  input: {
    task: {
      id: string;
      requestType: ApprovalWorkflowRequestType;
      requestId: string;
      formSubmissionId: string | null;
    };
    status: "approved" | "rejected";
    comment: string;
  },
) {
  await tx.approvalEvent.create({
    data: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      approvalTaskId: input.task.id,
      requestType: input.task.requestType,
      requestId: input.task.requestId,
      formSubmissionId: input.task.formSubmissionId,
      actorEmployeeId: session.employee!.id,
      action: input.status,
      comment: input.comment,
    },
  });
}

async function getPrismaEmployeeWorkspace(
  db: PrismaClient,
  session: SessionLike,
): Promise<EmployeeWorkspace> {
  const workDate = startOfToday();
  const [schedule, attendanceRecord, leaveBalance, requests, templates, notifications] =
    await Promise.all([
      db.workSchedule.findUnique({
        where: {
          employeeId_workDate: {
            employeeId: session.employee!.id,
            workDate,
          },
        },
      }),
      db.attendanceRecord.findUnique({
        where: {
          employeeId_workDate: {
            employeeId: session.employee!.id,
            workDate,
          },
        },
      }),
      db.leaveBalance.findFirst({
        where: {
          employeeId: session.employee!.id,
        },
        include: {
          leavePolicy: true,
        },
      }),
      getEmployeeRequests(db, session.employee!.id),
      db.formTemplate.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          status: "active",
        },
        include: {
          workflowSteps: {
            orderBy: { stepOrder: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.notification.findMany({
        where: {
          recipientUserId: session.user!.id,
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

  return {
    attendance: {
      workDate,
      shiftName: schedule?.shiftName ?? "Regular 09:00-18:00",
      scheduledStart: schedule?.scheduledStart ?? withTime(workDate, 9),
      scheduledEnd: schedule?.scheduledEnd ?? withTime(workDate, 18),
      clockInAt: attendanceRecord?.clockInAt ?? null,
      clockOutAt: attendanceRecord?.clockOutAt ?? null,
      clockInSource: attendanceRecord?.clockInSource ?? null,
      clockOutSource: attendanceRecord?.clockOutSource ?? null,
      status: attendanceRecord?.status ?? "not_started",
    },
    leaveBalance: leaveBalance
      ? {
          policyId: leaveBalance.leavePolicyId,
          policyName: leaveBalance.leavePolicy.name,
          grantedUnits: Number(leaveBalance.grantedUnits),
          usedUnits: Number(leaveBalance.usedUnits),
          pendingUnits: Number(leaveBalance.pendingUnits),
          settledUnits: Number(leaveBalance.settledUnits),
          carryoverUnits: Number(leaveBalance.carryoverUnits),
          carryoverUsedUnits: Number(leaveBalance.carryoverUsedUnits),
          currentYearUnits: Number(leaveBalance.currentYearUnits),
          currentYearUsedUnits: Number(leaveBalance.currentYearUsedUnits),
          remainingUnits: Number(leaveBalance.remainingUnits),
        }
      : {
          policyId: "missing",
          policyName: "Annual leave",
          grantedUnits: 0,
          usedUnits: 0,
          pendingUnits: 0,
          settledUnits: 0,
          carryoverUnits: 0,
          carryoverUsedUnits: 0,
          currentYearUnits: 0,
          currentYearUsedUnits: 0,
          remainingUnits: 0,
        },
    requests,
    formTemplates: templates.map(mapFormTemplate),
    notifications: notifications.map(mapNotification),
  };
}

async function getPrismaManagerInbox(
  db: PrismaClient,
  session: SessionLike,
): Promise<ManagerInbox> {
  const [tasks, notifications] = await Promise.all([
    db.approvalTask.findMany({
      where: {
        approverEmployeeId: session.employee!.id,
      },
      include: {
        events: {
          include: { actorEmployee: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.notification.findMany({
      where: {
        recipientUserId: session.user!.id,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const requests = await Promise.all(tasks.map((task) => mapTaskToWorkflow(db, task)));
  return {
    pending: requests.filter((request) => request.status === "pending"),
    decided: requests.filter((request) => request.status !== "pending"),
    notifications: notifications.map(mapNotification),
  };
}

async function getPayrollAdjustmentInboxItems(session: SessionLike): Promise<WorkflowRequest[]> {
  const adjustments = await listPayrollAdjustments({
    role: "owner",
    tenantId: session.tenantId,
    companyId: session.companyId,
    user: session.user,
    employee: session.employee,
  });
  return adjustments.map(mapPayrollAdjustmentToWorkflow);
}

function mapPayrollAdjustmentToWorkflow(adjustment: PayrollAdjustmentView): WorkflowRequest {
  return {
    id: adjustment.id,
    type: "payroll_adjustment",
    employeeId: adjustment.employeeId,
    employeeName: adjustment.employeeName,
    managerId: null,
    status: adjustment.status === "pending" ? "pending" : adjustment.status === "rejected" ? "rejected" : "approved",
    title: "Payroll adjustment",
    detail: `${adjustment.kind} · ${formatMoney(adjustment.amount)} · ${adjustment.reason}`,
    riskSummary: "Sensitive payroll change. Verify HR reason, payroll run, and supporting records before approval.",
    currentStepLabel: "Owner approval",
    createdAt: adjustment.decidedAt ?? adjustment.appliedAt ?? new Date(),
    timeline: [
      {
        id: `${adjustment.id}-request`,
        action: "requested",
        actorName: "HR",
        comment: adjustment.reason,
        createdAt: adjustment.decidedAt ?? adjustment.appliedAt ?? new Date(),
      },
      ...(adjustment.status === "pending"
        ? []
        : [
            {
              id: `${adjustment.id}-decision`,
              action: adjustment.status === "applied" ? "approved" : "rejected",
              actorName: "Owner",
              comment: adjustment.decisionComment,
              createdAt: adjustment.decidedAt ?? adjustment.appliedAt ?? new Date(),
            },
          ]),
    ],
  };
}

async function getEmployeeRequests(db: PrismaClient, employeeId: string) {
  const tasks = await db.approvalTask.findMany({
    where: {
      requesterEmployeeId: employeeId,
    },
    include: {
      events: {
        include: { actorEmployee: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(tasks.map((task) => mapTaskToWorkflow(db, task)));
}

async function mapTaskToWorkflow(
  db: PrismaClient,
  task: Prisma.ApprovalTaskGetPayload<{
    include: { events: { include: { actorEmployee: true } } };
  }>,
): Promise<WorkflowRequest> {
  const employee = await db.employee.findUniqueOrThrow({
    where: { id: task.requesterEmployeeId },
  });
  const timeline = task.events.map((event) => ({
    id: event.id,
    action: event.action,
    actorName: event.actorEmployee?.displayName ?? employee.displayName,
    comment: event.comment,
    createdAt: event.createdAt,
  }));

  if (task.requestType === "leave" && task.leaveRequestId) {
    const request = await db.leaveRequest.findUniqueOrThrow({
      where: { id: task.leaveRequestId },
      include: { leavePolicy: true },
    });
    return {
      id: request.id,
      type: "leave",
      employeeId: employee.id,
      employeeName: employee.displayName,
      managerId: task.approverEmployeeId,
      status: request.status,
      title: request.leavePolicy.name,
      detail: `${formatDateTime(request.startAt)} - ${formatDateTime(request.endAt)} · ${Number(request.units)} day(s)`,
      riskSummary: task.riskSummary,
      attachments: readAttachmentMetadata(request.attachmentMetadataJson),
      units: Number(request.units),
      createdAt: request.createdAt,
      timeline,
    };
  }

  if (task.requestType === "overtime" && task.overtimeRequestId) {
    const request = await db.overtimeRequest.findUniqueOrThrow({
      where: { id: task.overtimeRequestId },
    });
    return {
      id: request.id,
      type: "overtime",
      employeeId: employee.id,
      employeeName: employee.displayName,
      managerId: task.approverEmployeeId,
      status: request.status,
      title: "Overtime request",
      detail: `${formatDateTime(request.startAt)} - ${formatDateTime(request.endAt)} · ${request.minutes} minutes`,
      riskSummary: task.riskSummary,
      minutes: request.minutes,
      createdAt: request.createdAt,
      timeline,
    };
  }

  if (task.requestType === "custom_form" && task.formSubmissionId) {
    const request = await db.formSubmission.findUniqueOrThrow({
      where: { id: task.formSubmissionId },
      include: {
        formTemplate: {
          include: {
            workflowSteps: true,
          },
        },
      },
    });
    const currentStep = request.formTemplate.workflowSteps.find(
      (step) => step.stepOrder === request.currentStepOrder,
    );
    return {
      id: request.id,
      type: "custom_form",
      employeeId: employee.id,
      employeeName: employee.displayName,
      managerId: task.approverEmployeeId,
      status: request.status,
      title: request.formTemplate.title,
      detail: summarizeFormValues(
        request.formTemplate.fieldsJson as FormField[],
        request.valuesJson as Record<string, string>,
      ),
      riskSummary: task.riskSummary,
      currentStepLabel: currentStep ? getStepLabel(currentStep) : `Step ${request.currentStepOrder}`,
      formTemplateId: request.formTemplateId,
      values: request.valuesJson as Record<string, string>,
      attachments: readAttachmentMetadata(request.attachmentMetadataJson),
      createdAt: request.createdAt,
      timeline,
    };
  }

  const request = await db.punchCorrectionRequest.findUniqueOrThrow({
    where: { id: task.punchCorrectionRequestId! },
  });
  return {
    id: request.id,
    type: "punch_correction",
    employeeId: employee.id,
    employeeName: employee.displayName,
    managerId: task.approverEmployeeId,
    status: request.status,
    title: "Punch correction",
    detail: [
      request.requestedClockInAt ? `Clock in ${formatTime(request.requestedClockInAt)}` : null,
      request.requestedClockOutAt ? `Clock out ${formatTime(request.requestedClockOutAt)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    riskSummary: task.riskSummary,
    workDate: request.workDate,
    createdAt: request.createdAt,
    timeline,
  };
}

async function getRequestContext(tx: Prisma.TransactionClient, session: SessionLike) {
  const employee = await tx.employee.findUniqueOrThrow({
    where: { id: session.employee!.id },
  });
  if (!employee.managerId) {
    throw new Error("No manager is assigned for this employee.");
  }
  const manager = await tx.employee.findUniqueOrThrow({
    where: { id: employee.managerId },
  });
  if (!manager.userId) {
    throw new Error("Manager does not have a user account.");
  }

  return { employee, manager };
}

async function getApproverForWorkflowStep(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  approverType: string,
) {
  if (approverType === "hr_admin") {
    const hrRole = await tx.userRole.findFirst({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        role: { key: "hr_admin" },
      },
      include: {
        user: {
          include: {
            employee: true,
          },
        },
      },
    });
    if (!hrRole?.user.employee) {
      throw new Error("No HR admin employee is available for this workflow.");
    }
    return hrRole.user.employee;
  }

  const context = await getRequestContext(tx, session);
  return context.manager;
}

async function createApprovalRecords(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  input: {
    type: ApprovalWorkflowRequestType;
    requestId: string;
    leaveRequestId?: string;
    overtimeRequestId?: string;
    punchCorrectionRequestId?: string;
    formSubmissionId?: string;
    requesterEmployeeId: string;
    approverEmployeeId: string;
    actorEmployeeId: string;
    action: string;
    comment: string;
    riskSummary: string;
  },
) {
  const task = await tx.approvalTask.create({
    data: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      requestType: input.type,
      requestId: input.requestId,
      leaveRequestId: input.leaveRequestId,
      overtimeRequestId: input.overtimeRequestId,
      punchCorrectionRequestId: input.punchCorrectionRequestId,
      formSubmissionId: input.formSubmissionId,
      requesterEmployeeId: input.requesterEmployeeId,
      approverEmployeeId: input.approverEmployeeId,
      riskSummary: input.riskSummary,
    },
  });

  await tx.approvalEvent.create({
    data: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      approvalTaskId: task.id,
      requestType: input.type,
      requestId: input.requestId,
      leaveRequestId: input.leaveRequestId,
      overtimeRequestId: input.overtimeRequestId,
      punchCorrectionRequestId: input.punchCorrectionRequestId,
      formSubmissionId: input.formSubmissionId,
      actorEmployeeId: input.actorEmployeeId,
      action: input.action,
      comment: input.comment,
    },
  });
}

async function updateRequestStatus(
  tx: Prisma.TransactionClient,
  type: ApprovalWorkflowRequestType,
  requestId: string,
  status: "approved" | "rejected",
) {
  if (type === "leave") {
    await tx.leaveRequest.update({ where: { id: requestId }, data: { status } });
    return;
  }
  if (type === "overtime") {
    await tx.overtimeRequest.update({ where: { id: requestId }, data: { status } });
    return;
  }
  if (type === "custom_form") {
    await tx.formSubmission.update({ where: { id: requestId }, data: { status } });
    return;
  }
  await tx.punchCorrectionRequest.update({ where: { id: requestId }, data: { status } });
}

async function notify(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  recipientUserId: string | null,
  title: string,
  body: string,
  linkUrl: string,
  eventType: NotificationEventType = "general",
) {
  if (!recipientUserId) {
    return;
  }

  await sendNotificationInTransaction(tx, {
    tenantId: session.tenantId!,
    companyId: session.companyId!,
    recipientUserId,
    title,
    body,
    linkUrl,
    eventType,
  });
}

async function auditCreate(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  entityType: string,
  entityId: string,
  after: unknown,
  metadata: Record<string, unknown> = {},
) {
  await writeAuditLog(tx, {
    tenantId: session.tenantId!,
    companyId: session.companyId!,
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    action: "create",
    entityType,
    entityId,
    after,
    metadata: {
      source: "employee_self_service",
      ...metadata,
    },
  });
}

function mapNotification(notification: {
  id: string;
  title: string;
  body: string;
  linkUrl: string;
  status: "unread" | "read";
  createdAt: Date;
}): NotificationView {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    linkUrl: notification.linkUrl,
    status: notification.status,
    createdAt: notification.createdAt,
  };
}

function mapFormTemplate(template: {
  id: string;
  title: string;
  description: string;
  category: string;
  fieldsJson: Prisma.JsonValue;
  visibilityRulesJson: Prisma.JsonValue;
  status: string;
  workflowSteps: Array<{
    id: string;
    stepOrder: number;
    approverType: string;
    approverRef: string | null;
    conditionJson: Prisma.JsonValue;
  }>;
}): FormTemplateView {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    category: template.category,
    fields: template.fieldsJson as FormField[],
    visibilityRules: readFormVisibilityRules(template.visibilityRulesJson),
    visibilitySummary: summarizeVisibilityRules(template.fieldsJson as FormField[]),
    status: template.status === "inactive" ? "inactive" : "active",
    workflowSteps: template.workflowSteps.map((step) => ({
      id: step.id,
      order: step.stepOrder,
      label: step.approverType === "hr_admin" ? "HR review" : "Manager review",
      approverType:
        step.approverType === "hr_admin"
          ? "hr_admin"
          : step.approverType === "requester"
            ? "requester"
            : step.approverType === "department_manager"
              ? "department_manager"
              : step.approverType === "specific_user"
                ? "specific_user"
                : "direct_manager",
      approverRef: step.approverRef,
      conditionPlaceholder: null,
      condition: readWorkflowCondition(step.conditionJson),
    })),
  };
}

function buildStepConditionJson(
  step: "direct_manager" | "hr_admin",
  hrCondition?: { fieldId: string; expectedValue: string } | null,
) {
  if (step !== "hr_admin" || !hrCondition?.fieldId.trim() || !hrCondition.expectedValue.trim()) {
    return Prisma.JsonNull;
  }
  return {
    type: "field_equals",
    fieldId: hrCondition.fieldId.trim(),
    expectedValue: hrCondition.expectedValue.trim(),
  };
}

function summarizeFormValues(fields: FormField[], values: Record<string, string>) {
  return visibleFormFields(fields, values)
    .slice(0, 3)
    .map((field) => `${field.label}: ${values[field.id] ?? "-"}`)
    .join(" · ");
}

async function recordAttendanceCheckpoint(session: SessionLike, direction: "in" | "out") {
  if (direction !== "out") {
    return;
  }
  try {
    await recordBetaPilotAutomatedEvidence(session, {
      checkpointId: "day_3",
      evidenceType: "smoke_test",
      evidenceRef: `attendance_clock_out:${session.employee?.id ?? "unknown"}:${startOfToday().toISOString()}`,
      requiredEvidenceTypes: ["smoke_test", "approval_flow"],
    });
  } catch {
    // Pilot evidence is advisory and must never block attendance.
  }
}

async function recordApprovalCheckpoint(
  session: SessionLike,
  requestId: string,
  requestType: RequestType | null,
) {
  if (requestType !== "leave") {
    return;
  }
  try {
    await recordBetaPilotAutomatedEvidence(session, {
      checkpointId: "day_3",
      evidenceType: "approval_flow",
      evidenceRef: `approval_flow:${requestType}:${requestId}`,
      requiredEvidenceTypes: ["smoke_test", "approval_flow"],
    });
  } catch {
    // Pilot evidence is advisory and must never block approval decisions.
  }
}

async function recordMobileTaskTelemetry(
  session: SessionLike,
  taskType: string,
  startedAt?: Date | null,
) {
  await recordWorkflowTelemetry(session, {
    eventName: "mobile_task_started",
    workflow: "mobile_task",
    step: "employee_self_service",
    metadata: { taskType },
  });
  await recordWorkflowTelemetry(session, {
    eventName: "mobile_task_completed",
    workflow: "mobile_task",
    step: "employee_self_service",
    durationMs: durationSince(startedAt),
    metadata: { taskType },
  });
}

async function recordApprovalTelemetry(
  session: SessionLike,
  requestId: string,
  action: ApprovalAction,
) {
  if (!canUseDatabase(session)) {
    return;
  }

  try {
    const task = await getDb().approvalTask.findFirst({
      where: {
        requestId,
        approverEmployeeId: session.employee!.id,
        requestType: "leave",
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!task) {
      return;
    }
    await recordWorkflowTelemetry(session, {
      eventName: "manager_approval_done",
      workflow: "approval",
      step: "manager_leave",
      durationMs: durationSince(task.createdAt),
      success: action === "approve",
      metadata: { requestType: task.requestType },
    });
  } catch {
    // Telemetry must never block approval decisions.
  }
}

async function recordWorkflowTelemetry(
  session: SessionLike,
  input: Parameters<typeof recordProductTelemetryEvent>[1],
) {
  const role = asRoleKey(session.role);
  if (!role) {
    return;
  }
  try {
    await recordProductTelemetryEvent(
      {
        ...session,
        role,
      },
      input,
    );
  } catch {
    // Product analytics is advisory and must not break HR workflows.
  }
}

function durationSince(startedAt?: Date | null) {
  if (!startedAt) {
    return null;
  }
  const elapsed = Date.now() - startedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 24 * 60 * 60 * 1000) {
    return null;
  }
  return Math.max(1_000, Math.round(elapsed));
}

function canUseDatabase(session: SessionLike) {
  return Boolean(
    process.env.DATABASE_URL && session.tenantId && session.companyId && session.user && session.employee,
  );
}

function startOfToday() {
  return startOfDate(new Date());
}

function startOfDate(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function withTime(date: Date, hour: number) {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next;
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function asRoleKey(role: string): RoleKey | null {
  return roleKeys.includes(role as RoleKey) ? (role as RoleKey) : null;
}

function labelForType(type: RequestType) {
  if (type === "leave") return "leave request";
  if (type === "overtime") return "overtime request";
  if (type === "custom_form") return "custom form";
  if (type === "payroll_adjustment") return "payroll adjustment";
  return "punch correction";
}
