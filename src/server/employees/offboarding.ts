import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getEmployeeLifecycleWorkspace, type LifecycleEventRow } from "./lifecycle";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export const offboardingTaskTypes = [
  "final_wage_review",
  "unused_leave_settlement",
  "statutory_insurance_withdrawal",
  "access_revocation",
  "record_retention",
  "employment_certificate",
] as const;

export type OffboardingTaskType = (typeof offboardingTaskTypes)[number];
export type OffboardingTaskStatus = "pending" | "completed" | "waived";

export type OffboardingTaskView = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  lifecycleEventId: string;
  effectiveDate: Date;
  taskType: OffboardingTaskType;
  status: OffboardingTaskStatus;
  dueDate: Date;
  completedAt: Date | null;
  evidenceHash: string | null;
  overdue: boolean;
  updatedAt: Date;
};

export type OffboardingReadiness = {
  ready: boolean;
  total: number;
  readyCount: number;
  pendingCount: number;
  overdueCount: number;
  detail: string;
  missing: string[];
};

export type OffboardingWorkspace = {
  tasks: OffboardingTaskView[];
  readiness: OffboardingReadiness;
};

export type UpdateOffboardingTaskInput = {
  employeeId: string;
  lifecycleEventId: string;
  taskType: string;
  status: string;
  completedAt?: Date | null;
  evidenceRef?: string | null;
  notes?: string | null;
};

type DemoState = {
  tasks: OffboardingTaskView[];
};

const globalForOffboarding = globalThis as unknown as {
  hrOneOffboardingDemoState?: DemoState;
};

export async function getOffboardingWorkspace(session: SessionLike): Promise<OffboardingWorkspace> {
  assertPermission(session.role, "employee:write");
  if (canUseDatabase(session)) {
    return getDbWorkspace(session);
  }
  return getDemoWorkspace(session);
}

export async function updateOffboardingTask(session: SessionLike, input: UpdateOffboardingTaskInput) {
  assertPermission(session.role, "employee:write");
  const normalized = normalizeInput(input);
  if (canUseDatabase(session)) {
    return updateDbTask(session, normalized);
  }
  return updateDemoTask(session, normalized);
}

export function evaluateOffboardingReadiness(tasks: OffboardingTaskView[], now = new Date()): OffboardingReadiness {
  const evaluated = tasks.map((task) => ({ ...task, overdue: isTaskOverdue(task, now) }));
  const readyCount = evaluated.filter((task) => isTaskReady(task)).length;
  const pending = evaluated.filter((task) => !isTaskReady(task));
  const overdue = evaluated.filter((task) => task.overdue);
  const missing = [
    pending.length ? `${pending.length} pending offboarding task(s)` : null,
    overdue.length ? `${overdue.length} overdue offboarding task(s)` : null,
  ].filter(Boolean) as string[];
  return {
    ready: evaluated.length === 0 || (pending.length === 0 && overdue.length === 0),
    total: evaluated.length,
    readyCount,
    pendingCount: pending.length,
    overdueCount: overdue.length,
    detail: `${readyCount}/${evaluated.length} offboarding task(s) ready; ${pending.length} pending; ${overdue.length} overdue.`,
    missing,
  };
}

export function resetOffboardingDemoState() {
  globalForOffboarding.hrOneOffboardingDemoState = { tasks: [] };
}

async function getDbWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const [lifecycleWorkspace, dbTasks] = await Promise.all([
    getEmployeeLifecycleWorkspace(session),
    getDb().employeeOffboardingTask.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId },
      include: {
        employee: { select: { employeeNo: true, displayName: true } },
        lifecycleEvent: { select: { effectiveDate: true } },
      },
      orderBy: [{ dueDate: "asc" }, { taskType: "asc" }],
    }),
  ]);
  const tasks = mergeTasks(
    terminationEvents(lifecycleWorkspace.events),
    dbTasks.map((task) => ({
      id: task.id,
      employeeId: task.employeeId,
      employeeNo: task.employee.employeeNo,
      employeeName: task.employee.displayName,
      lifecycleEventId: task.lifecycleEventId,
      effectiveDate: task.lifecycleEvent.effectiveDate,
      taskType: normalizeTaskType(task.taskType),
      status: normalizeStatus(task.status),
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      evidenceHash: task.evidenceHash,
      overdue: false,
      updatedAt: task.updatedAt,
    })),
  );
  return {
    tasks,
    readiness: evaluateOffboardingReadiness(tasks),
  };
}

async function updateDbTask(
  session: SessionLike & { tenantId: string; companyId: string },
  input: ReturnType<typeof normalizeInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const event = await tx.employeeLifecycleEvent.findFirst({
      where: {
        id: input.lifecycleEventId,
        employeeId: input.employeeId,
        tenantId: session.tenantId,
        companyId: session.companyId,
        eventType: "termination",
      },
      include: { employee: { select: { employeeNo: true, displayName: true } } },
    });
    if (!event) throw new Error("Termination lifecycle event not found.");
    const dueDate = dueDateForTask(input.taskType, event.effectiveDate, readTerminationDueDate(event.metadataJson));
    const before = await tx.employeeOffboardingTask.findUnique({
      where: {
        companyId_lifecycleEventId_taskType: {
          companyId: session.companyId,
          lifecycleEventId: input.lifecycleEventId,
          taskType: input.taskType,
        },
      },
    });
    const updated = await tx.employeeOffboardingTask.upsert({
      where: {
        companyId_lifecycleEventId_taskType: {
          companyId: session.companyId,
          lifecycleEventId: input.lifecycleEventId,
          taskType: input.taskType,
        },
      },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: input.employeeId,
        lifecycleEventId: input.lifecycleEventId,
        taskType: input.taskType,
        status: input.status,
        dueDate,
        completedAt: input.status === "completed" ? input.completedAt : null,
        evidenceRef: input.evidenceRef,
        evidenceHash: input.evidenceRef ? stableHash(input.evidenceRef) : null,
        notesHash: input.notes ? stableHash(input.notes) : null,
        updatedByUserId: session.user?.id,
      },
      update: {
        status: input.status,
        dueDate,
        completedAt: input.status === "completed" ? input.completedAt : null,
        evidenceRef: input.evidenceRef,
        evidenceHash: input.evidenceRef ? stableHash(input.evidenceRef) : null,
        notesHash: input.notes ? stableHash(input.notes) : null,
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "employee_offboarding_task",
      entityId: updated.id,
      before,
      after: updated,
      metadata: auditMetadata(input),
    });
    return updated;
  });
}

async function getDemoWorkspace(session: SessionLike) {
  const lifecycleWorkspace = await getEmployeeLifecycleWorkspace(session);
  const tasks = mergeTasks(terminationEvents(lifecycleWorkspace.events), getDemoState().tasks);
  return {
    tasks,
    readiness: evaluateOffboardingReadiness(tasks),
  };
}

async function updateDemoTask(session: SessionLike, input: ReturnType<typeof normalizeInput>) {
  const state = getDemoState();
  const lifecycleWorkspace = await getEmployeeLifecycleWorkspace(session);
  const lifecycleEvent = terminationEvents(lifecycleWorkspace.events).find(
    (event) => event.id === input.lifecycleEventId && event.employeeId === input.employeeId,
  );
  if (!lifecycleEvent) throw new Error("Termination lifecycle event not found.");
  const before = state.tasks.find(
    (task) => task.lifecycleEventId === input.lifecycleEventId && task.taskType === input.taskType,
  );
  const dueDate = dueDateForTask(input.taskType, lifecycleEvent.effectiveDate, lifecycleEvent.terminationOffboarding?.dueDate ?? null);
  const after: OffboardingTaskView = {
    id: before?.id ?? `demo-offboarding-${input.lifecycleEventId}-${input.taskType}`,
    employeeId: input.employeeId,
    employeeNo: lifecycleEvent.employeeNo,
    employeeName: lifecycleEvent.employeeName,
    lifecycleEventId: input.lifecycleEventId,
    effectiveDate: lifecycleEvent.effectiveDate,
    taskType: input.taskType,
    status: input.status,
    dueDate,
    completedAt: input.status === "completed" ? input.completedAt : null,
    evidenceHash: input.evidenceRef ? stableHash(input.evidenceRef) : null,
    overdue: false,
    updatedAt: new Date(),
  };
  after.overdue = isTaskOverdue(after);
  state.tasks = [
    after,
    ...state.tasks.filter((task) => !(task.lifecycleEventId === input.lifecycleEventId && task.taskType === input.taskType)),
  ];
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: before ? "update" : "create",
    entityType: "employee_offboarding_task",
    entityId: after.id,
    before,
    after,
    metadata: auditMetadata(input),
  });
  return after;
}

function getDemoState() {
  if (!globalForOffboarding.hrOneOffboardingDemoState) resetOffboardingDemoState();
  return globalForOffboarding.hrOneOffboardingDemoState!;
}

function terminationEvents(events: LifecycleEventRow[]) {
  return events.filter((event) => event.eventType === "termination");
}

function mergeTasks(terminationRows: LifecycleEventRow[], savedTasks: OffboardingTaskView[]) {
  const saved = new Map(savedTasks.map((task) => [`${task.lifecycleEventId}:${task.taskType}`, task]));
  const tasks = terminationRows.flatMap((event) =>
    offboardingTaskTypes.map((taskType) => {
      const key = `${event.id}:${taskType}`;
      const base = saved.get(key) ?? defaultTask(event, taskType);
      return {
        ...base,
        overdue: isTaskOverdue(base),
        updatedAt: base.updatedAt,
      };
    }),
  );
  return tasks.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.taskType.localeCompare(b.taskType));
}

function defaultTask(event: LifecycleEventRow, taskType: OffboardingTaskType): OffboardingTaskView {
  const dueDate = dueDateForTask(taskType, event.effectiveDate, event.terminationOffboarding?.dueDate ?? null);
  const prepared = preparedFromChecklist(event, taskType);
  const status: OffboardingTaskStatus = prepared ? "completed" : "pending";
  const task: OffboardingTaskView = {
    id: `virtual-${event.id}-${taskType}`,
    employeeId: event.employeeId,
    employeeNo: event.employeeNo,
    employeeName: event.employeeName,
    lifecycleEventId: event.id,
    effectiveDate: event.effectiveDate,
    taskType,
    status,
    dueDate,
    completedAt: prepared ? event.createdAt : null,
    evidenceHash: null,
    overdue: false,
    updatedAt: event.createdAt,
  };
  task.overdue = isTaskOverdue(task);
  return task;
}

function preparedFromChecklist(event: LifecycleEventRow, taskType: OffboardingTaskType) {
  const checklist = event.terminationOffboarding;
  if (!checklist) return false;
  if (taskType === "final_wage_review") return checklist.finalPayPrepared;
  if (taskType === "unused_leave_settlement") return checklist.unusedLeaveSettlementPrepared;
  if (taskType === "statutory_insurance_withdrawal") return checklist.insuranceWithdrawalPrepared;
  if (taskType === "access_revocation") return checklist.accessRevocationPrepared;
  if (taskType === "record_retention") return checklist.documentRetentionPrepared;
  return checklist.employeeCertificatePrepared;
}

function dueDateForTask(taskType: OffboardingTaskType, effectiveDate: Date, insuranceDueDate: Date | null) {
  if (taskType === "statutory_insurance_withdrawal" && insuranceDueDate) return insuranceDueDate;
  if (taskType === "record_retention") return addDays(effectiveDate, 7);
  if (taskType === "employment_certificate") return addDays(effectiveDate, 7);
  return effectiveDate;
}

function normalizeInput(input: UpdateOffboardingTaskInput) {
  const completedAt = input.completedAt && !Number.isNaN(input.completedAt.getTime()) ? input.completedAt : new Date();
  return {
    employeeId: cleanText(input.employeeId, 120),
    lifecycleEventId: cleanText(input.lifecycleEventId, 120),
    taskType: normalizeTaskType(input.taskType),
    status: normalizeStatus(input.status),
    completedAt,
    evidenceRef: cleanText(input.evidenceRef, 240) || null,
    notes: cleanText(input.notes, 500) || null,
  };
}

function auditMetadata(input: ReturnType<typeof normalizeInput>) {
  return {
    employeeId: input.employeeId,
    lifecycleEventId: input.lifecycleEventId,
    taskType: input.taskType,
    status: input.status,
    evidenceRefHash: input.evidenceRef ? stableHash(input.evidenceRef) : null,
    notesHash: input.notes ? stableHash(input.notes) : null,
    rawEvidenceIncluded: false,
    rawNotesIncluded: false,
  };
}

function readTerminationDueDate(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const offboarding = (metadata as Record<string, unknown>).terminationOffboarding;
  if (!offboarding || typeof offboarding !== "object" || Array.isArray(offboarding)) return null;
  const value = (offboarding as Record<string, unknown>).dueDate;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTaskType(value: string): OffboardingTaskType {
  return offboardingTaskTypes.includes(value as OffboardingTaskType) ? value as OffboardingTaskType : "final_wage_review";
}

function normalizeStatus(value: string): OffboardingTaskStatus {
  if (value === "completed" || value === "waived") return value;
  return "pending";
}

function isTaskReady(task: OffboardingTaskView) {
  return task.status === "completed" || task.status === "waived";
}

function isTaskOverdue(task: OffboardingTaskView, now = new Date()) {
  return !isTaskReady(task) && startOfDay(task.dueDate).getTime() < startOfDay(now).getTime();
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
