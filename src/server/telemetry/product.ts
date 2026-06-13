import type { Prisma } from "@prisma/client";
import { redactSensitivePayload } from "@/server/audit/redaction";
import type { RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type ProductTelemetryEventInput = {
  eventName: string;
  workflow: string;
  step: string;
  durationMs?: number | null;
  success?: boolean;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export type ProductTelemetrySnapshot = {
  averageLeaveSuccessSeconds: number | null;
  averageManagerApprovalSeconds: number | null;
  employeeMobileCompletionPercent: number | null;
  hrSelfServeFormPercent: number | null;
  eventCount: number;
};

type ProductTelemetryDemoEvent = Required<Omit<ProductTelemetryEventInput, "durationMs" | "metadata">> & {
  tenantId: string;
  companyId: string;
  durationMs: number | null;
  metadata: Record<string, unknown>;
};

const globalForTelemetry = globalThis as unknown as {
  hrOneProductTelemetryDemoState?: {
    events: ProductTelemetryDemoEvent[];
  };
};

export async function recordProductTelemetryEvent(
  session: SessionLike,
  input: ProductTelemetryEventInput,
) {
  const normalized = normalizeEvent(session, input);
  if (canUseDatabase(session)) {
    try {
      await getDb().productTelemetryEvent.create({
        data: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          actorUserId: session.user?.id,
          actorEmployeeId: session.employee?.id,
          eventName: normalized.eventName,
          workflow: normalized.workflow,
          step: normalized.step,
          durationMs: normalized.durationMs,
          success: normalized.success,
          metadataJson: normalized.metadata as Prisma.InputJsonValue,
          occurredAt: normalized.occurredAt,
        },
      });
      return;
    } catch {
      // Local demo mode may have DATABASE_URL unset or a database unavailable.
    }
  }
  getProductTelemetryDemoState().events.push({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    ...normalized,
  });
}

export function recordDemoProductTelemetryEvent(input: ProductTelemetryEventInput) {
  const normalized = normalizeEvent({
    role: "employee",
    tenantId: "demo-tenant",
    companyId: "demo-company",
    user: null,
    employee: null,
  }, input);
  getProductTelemetryDemoState().events.push({
    tenantId: "demo-tenant",
    companyId: "demo-company",
    ...normalized,
  });
}

export function getProductTelemetryDemoEvents() {
  return [...getProductTelemetryDemoState().events];
}

export async function getProductTelemetrySnapshot(
  session?: Pick<SessionLike, "tenantId" | "companyId">,
): Promise<ProductTelemetrySnapshot> {
  if (canUseDatabase(session)) {
    try {
      const events = await getDb().productTelemetryEvent.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        orderBy: { occurredAt: "desc" },
        take: 500,
      });
      return summarizeTelemetry(events.map((event) => ({
        eventName: event.eventName,
        workflow: event.workflow,
        step: event.step,
        durationMs: event.durationMs,
        success: event.success,
        metadata: safeMetadata(event.metadataJson),
        occurredAt: event.occurredAt,
      })));
    } catch {
      return summarizeTelemetry(getProductTelemetryDemoState().events);
    }
  }
  return summarizeTelemetry(getProductTelemetryDemoState().events);
}

export function resetProductTelemetryDemoState() {
  const now = new Date();
  globalForTelemetry.hrOneProductTelemetryDemoState = {
    events: [
      demoEvent("leave_request_success", "leave", "first_success", 52_000, true, now),
      demoEvent("leave_request_success", "leave", "first_success", 58_000, true, now),
      demoEvent("manager_approval_done", "approval", "manager_leave", 12_000, true, now),
      demoEvent("manager_approval_done", "approval", "manager_leave", 14_000, true, now),
      demoEvent("mobile_task_started", "mobile_task", "employee_self_service", null, true, now),
      demoEvent("mobile_task_completed", "mobile_task", "employee_self_service", null, true, now),
      demoEvent("mobile_task_started", "mobile_task", "employee_self_service", null, true, now),
      demoEvent("mobile_task_completed", "mobile_task", "employee_self_service", null, true, now),
      demoEvent("mobile_task_started", "mobile_task", "employee_self_service", null, true, now),
      demoEvent("form_template_created", "form_builder", "hr_self_serve", null, true, now, { engineeringSupport: false }),
      demoEvent("form_template_created", "form_builder", "hr_self_serve", null, true, now, { engineeringSupport: false }),
      demoEvent("form_template_created", "form_builder", "hr_self_serve", null, true, now, { engineeringSupport: true }),
    ],
  };
}

function getProductTelemetryDemoState() {
  if (!globalForTelemetry.hrOneProductTelemetryDemoState) {
    resetProductTelemetryDemoState();
  }
  return globalForTelemetry.hrOneProductTelemetryDemoState!;
}

function summarizeTelemetry(events: Array<{
  eventName: string;
  workflow: string;
  step: string;
  durationMs: number | null;
  success: boolean;
  metadata: Record<string, unknown>;
}>) {
  const leaveSuccess = events.filter((event) =>
    event.workflow === "leave" &&
    event.step === "first_success" &&
    event.success &&
    event.durationMs !== null,
  );
  const managerApprovals = events.filter((event) =>
    event.workflow === "approval" &&
    event.step === "manager_leave" &&
    event.success &&
    event.durationMs !== null,
  );
  const mobileStarted = events.filter((event) => event.eventName === "mobile_task_started").length;
  const mobileCompleted = events.filter((event) => event.eventName === "mobile_task_completed").length;
  const formCreates = events.filter((event) =>
    event.workflow === "form_builder" &&
    event.step === "hr_self_serve" &&
    event.success,
  );
  const selfServeForms = formCreates.filter((event) => event.metadata.engineeringSupport === false).length;
  return {
    averageLeaveSuccessSeconds: averageSeconds(leaveSuccess),
    averageManagerApprovalSeconds: averageSeconds(managerApprovals),
    employeeMobileCompletionPercent: mobileStarted > 0
      ? Math.round((mobileCompleted / mobileStarted) * 100)
      : null,
    hrSelfServeFormPercent: formCreates.length > 0
      ? Math.round((selfServeForms / formCreates.length) * 100)
      : null,
    eventCount: events.length,
  };
}

function averageSeconds(events: Array<{ durationMs: number | null }>) {
  if (events.length === 0) return null;
  return Math.round(events.reduce((sum, event) => sum + (event.durationMs ?? 0), 0) / events.length / 1000);
}

function normalizeEvent(session: SessionLike, input: ProductTelemetryEventInput) {
  return {
    eventName: cleanKey(input.eventName),
    workflow: cleanKey(input.workflow),
    step: cleanKey(input.step),
    durationMs: normalizeDuration(input.durationMs),
    success: input.success ?? true,
    metadata: redactSensitivePayload(input.metadata ?? {}),
    occurredAt: input.occurredAt ?? new Date(),
  };
}

function cleanKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 80);
}

function normalizeDuration(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function safeMetadata(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function demoEvent(
  eventName: string,
  workflow: string,
  step: string,
  durationMs: number | null,
  success: boolean,
  occurredAt: Date,
  metadata: Record<string, unknown> = {},
): ProductTelemetryDemoEvent {
  return {
    tenantId: "demo-tenant",
    companyId: "demo-company",
    eventName,
    workflow,
    step,
    durationMs,
    success,
    metadata,
    occurredAt,
  };
}

function canUseDatabase(
  session?: Pick<SessionLike, "tenantId" | "companyId">,
): session is Pick<SessionLike, "tenantId" | "companyId"> & { tenantId: string; companyId: string } {
  if (!session) {
    return false;
  }

  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
