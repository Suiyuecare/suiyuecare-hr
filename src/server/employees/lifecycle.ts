import type { EmploymentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";

export type LifecycleEventType = "transfer" | "promotion" | "leave" | "return" | "termination";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type LifecycleEventInput = {
  employeeId: string;
  eventType: LifecycleEventType;
  effectiveDate: Date;
  reason: string;
  nextDepartmentId?: string | null;
  nextJobTitle?: string | null;
};

export type LifecycleEventRow = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  eventType: LifecycleEventType;
  effectiveDate: Date;
  reason: string;
  previousDepartmentName: string | null;
  nextDepartmentName: string | null;
  previousJobTitle: string | null;
  nextJobTitle: string | null;
  previousStatus: EmploymentStatus | null;
  nextStatus: EmploymentStatus | null;
  createdAt: Date;
};

export type EmployeeLifecycleWorkspace = {
  employees: Array<{
    id: string;
    employeeNo: string;
    displayName: string;
    jobTitle: string;
    employmentStatus: EmploymentStatus;
    departmentId: string | null;
  }>;
  departments: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  events: LifecycleEventRow[];
};

type DemoEmployee = EmployeeLifecycleWorkspace["employees"][number];
type DemoDepartment = EmployeeLifecycleWorkspace["departments"][number];

type LifecycleDemoState = {
  employees: DemoEmployee[];
  departments: DemoDepartment[];
  events: LifecycleEventRow[];
};

type DbLifecycleEventRecord = {
  id: string;
  employeeId: string;
  employee: { employeeNo: string; displayName: string };
  eventType: string;
  effectiveDate: Date;
  reason: string;
  previousDepartmentId: string | null;
  nextDepartmentId: string | null;
  previousJobTitle: string | null;
  nextJobTitle: string | null;
  previousStatus: EmploymentStatus | null;
  nextStatus: EmploymentStatus | null;
  createdAt: Date;
};

const globalForLifecycle = globalThis as unknown as {
  hrOneLifecycleDemoState?: LifecycleDemoState;
};

export async function getEmployeeLifecycleWorkspace(session: SessionLike): Promise<EmployeeLifecycleWorkspace> {
  assertPermission(session.role, "employee:write");
  if (canUseDatabase(session)) {
    try {
      const [employees, departments, events] = await Promise.all([
        getDb().employee.findMany({
          where: { tenantId: session.tenantId!, companyId: session.companyId! },
          orderBy: { employeeNo: "asc" },
        }),
        getDb().department.findMany({
          where: { tenantId: session.tenantId!, companyId: session.companyId! },
          orderBy: { code: "asc" },
        }),
        getDb().employeeLifecycleEvent.findMany({
          where: { tenantId: session.tenantId!, companyId: session.companyId! },
          include: { employee: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);
      const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
      return {
        employees: employees.map((employee) => ({
          id: employee.id,
          employeeNo: employee.employeeNo,
          displayName: employee.displayName,
          jobTitle: employee.jobTitle,
          employmentStatus: employee.employmentStatus,
          departmentId: employee.departmentId,
        })),
        departments: departments.map((department) => ({
          id: department.id,
          code: department.code,
          name: department.name,
        })),
        events: events.map((event) => mapDbEvent(event, departmentNames)),
      };
    } catch {
      return demoWorkspace();
    }
  }
  return demoWorkspace();
}

export async function recordLifecycleEvent(session: SessionLike, input: LifecycleEventInput) {
  assertPermission(session.role, "employee:write");
  const normalized = normalizeInput(input);
  if (canUseDatabase(session)) {
    try {
      return recordDbLifecycleEvent(session, normalized);
    } catch {
      return recordDemoLifecycleEvent(session, normalized);
    }
  }
  return recordDemoLifecycleEvent(session, normalized);
}

export function resetEmployeeLifecycleDemoState() {
  const overview = getFallbackCompanyOverview();
  globalForLifecycle.hrOneLifecycleDemoState = {
    employees: overview.company.employees.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      jobTitle: employee.jobTitle,
      employmentStatus: "active",
      departmentId: employee.department?.id ?? null,
    })),
    departments: overview.company.departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
    })),
    events: [],
  };
}

async function recordDbLifecycleEvent(
  session: SessionLike,
  input: ReturnType<typeof normalizeInput>,
) {
  const db = getDb();
  const employee = await db.employee.findFirst({
    where: {
      id: input.employeeId,
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
  });
  if (!employee) throw new Error("Employee not found.");
  const nextDepartmentId = await validateDepartment(session, input.nextDepartmentId);
  const nextStatus = statusForEvent(input.eventType);
  const nextJobTitle = input.nextJobTitle ?? employee.jobTitle;

  return db.$transaction(async (tx) => {
    const updatedEmployee = await tx.employee.update({
      where: { id: employee.id },
      data: {
        departmentId: nextDepartmentId ?? employee.departmentId,
        jobTitle: nextJobTitle,
        employmentStatus: nextStatus ?? employee.employmentStatus,
      },
    });
    const event = await tx.employeeLifecycleEvent.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: employee.id,
        eventType: input.eventType,
        effectiveDate: input.effectiveDate,
        reason: input.reason,
        previousDepartmentId: employee.departmentId,
        nextDepartmentId: nextDepartmentId ?? employee.departmentId,
        previousJobTitle: employee.jobTitle,
        nextJobTitle,
        previousStatus: employee.employmentStatus,
        nextStatus: nextStatus ?? employee.employmentStatus,
        metadataJson: {
          source: "employee_lifecycle_page",
          effectiveDate: input.effectiveDate.toISOString().slice(0, 10),
        } satisfies Prisma.InputJsonValue,
        createdByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "employee_lifecycle_event",
      entityId: event.id,
      before: {
        employeeId: employee.id,
        departmentId: employee.departmentId,
        jobTitle: employee.jobTitle,
        employmentStatus: employee.employmentStatus,
      },
      after: {
        employeeId: updatedEmployee.id,
        departmentId: updatedEmployee.departmentId,
        jobTitle: updatedEmployee.jobTitle,
        employmentStatus: updatedEmployee.employmentStatus,
        eventType: input.eventType,
      },
      metadata: {
        employeeId: employee.id,
        eventType: input.eventType,
        effectiveDate: input.effectiveDate.toISOString().slice(0, 10),
      },
    });
    const workspace = await getEmployeeLifecycleWorkspace(session);
    return workspace.events.find((item) => item.id === event.id) ?? null;
  });
}

function recordDemoLifecycleEvent(
  session: SessionLike,
  input: ReturnType<typeof normalizeInput>,
) {
  const state = getDemoState();
  const employee = state.employees.find((item) => item.id === input.employeeId);
  if (!employee) throw new Error("Employee not found.");
  const nextDepartmentId = input.nextDepartmentId && state.departments.some((item) => item.id === input.nextDepartmentId)
    ? input.nextDepartmentId
    : employee.departmentId;
  const nextDepartment = state.departments.find((item) => item.id === nextDepartmentId) ?? null;
  const previousDepartment = state.departments.find((item) => item.id === employee.departmentId) ?? null;
  const nextStatus = statusForEvent(input.eventType) ?? employee.employmentStatus;
  const nextJobTitle = input.nextJobTitle ?? employee.jobTitle;
  const event: LifecycleEventRow = {
    id: crypto.randomUUID(),
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.displayName,
    eventType: input.eventType,
    effectiveDate: input.effectiveDate,
    reason: input.reason,
    previousDepartmentName: previousDepartment?.name ?? null,
    nextDepartmentName: nextDepartment?.name ?? null,
    previousJobTitle: employee.jobTitle,
    nextJobTitle,
    previousStatus: employee.employmentStatus,
    nextStatus,
    createdAt: new Date(),
  };
  employee.departmentId = nextDepartmentId;
  employee.jobTitle = nextJobTitle;
  employee.employmentStatus = nextStatus;
  state.events.unshift(event);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "employee_lifecycle_event",
    entityId: event.id,
    before: {
      employeeId: employee.id,
      departmentId: event.previousDepartmentName,
      jobTitle: event.previousJobTitle,
      employmentStatus: event.previousStatus,
    },
    after: {
      employeeId: employee.id,
      departmentId: event.nextDepartmentName,
      jobTitle: event.nextJobTitle,
      employmentStatus: event.nextStatus,
      eventType: event.eventType,
    },
    metadata: {
      employeeId: employee.id,
      eventType: event.eventType,
      effectiveDate: input.effectiveDate.toISOString().slice(0, 10),
    },
  });
  return event;
}

function demoWorkspace(): EmployeeLifecycleWorkspace {
  const state = getDemoState();
  return {
    employees: state.employees,
    departments: state.departments,
    events: state.events,
  };
}

function getDemoState() {
  if (!globalForLifecycle.hrOneLifecycleDemoState) {
    resetEmployeeLifecycleDemoState();
  }
  return globalForLifecycle.hrOneLifecycleDemoState!;
}

function mapDbEvent(
  event: DbLifecycleEventRecord,
  departmentNames: Map<string, string>,
): LifecycleEventRow {
  return {
    id: event.id,
    employeeId: event.employeeId,
    employeeNo: event.employee.employeeNo,
    employeeName: event.employee.displayName,
    eventType: normalizeEventType(event.eventType),
    effectiveDate: event.effectiveDate,
    reason: event.reason,
    previousDepartmentName: event.previousDepartmentId ? departmentNames.get(event.previousDepartmentId) ?? null : null,
    nextDepartmentName: event.nextDepartmentId ? departmentNames.get(event.nextDepartmentId) ?? null : null,
    previousJobTitle: event.previousJobTitle,
    nextJobTitle: event.nextJobTitle,
    previousStatus: event.previousStatus,
    nextStatus: event.nextStatus,
    createdAt: event.createdAt,
  };
}

async function validateDepartment(session: SessionLike, departmentId: string | null) {
  if (!departmentId) return null;
  const department = await getDb().department.findFirst({
    where: {
      id: departmentId,
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
  });
  if (!department) throw new Error("Department not found.");
  return department.id;
}

function normalizeInput(input: LifecycleEventInput) {
  if (!input.employeeId) throw new Error("Employee is required.");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Reason is required.");
  return {
    employeeId: input.employeeId,
    eventType: normalizeEventType(input.eventType),
    effectiveDate: startOfDate(input.effectiveDate),
    reason,
    nextDepartmentId: input.nextDepartmentId?.trim() || null,
    nextJobTitle: input.nextJobTitle?.trim() || null,
  };
}

function normalizeEventType(value: string): LifecycleEventType {
  if (value === "promotion" || value === "leave" || value === "return" || value === "termination") {
    return value;
  }
  return "transfer";
}

function statusForEvent(eventType: LifecycleEventType): EmploymentStatus | null {
  if (eventType === "termination") return "terminated";
  if (eventType === "leave") return "on_leave";
  if (eventType === "return") return "active";
  return null;
}

function startOfDate(date: Date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
