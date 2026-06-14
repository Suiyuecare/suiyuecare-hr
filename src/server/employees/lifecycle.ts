import type { EmploymentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import {
  getActiveTaiwanLaborStandardsConfig,
  getTaiwanLaborStandardsConfig,
} from "@/server/rules/settings";
import {
  calculateTerminationCompliance,
  type PensionScheme,
  type TerminationComplianceSnapshot,
  type TerminationReasonCategory,
} from "./termination-compliance";

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
  terminationReasonCategory?: TerminationReasonCategory | null;
  pensionScheme?: PensionScheme | null;
  averageMonthlyWage?: number | null;
  finalPayPrepared?: boolean;
  unusedLeaveSettlementPrepared?: boolean;
  insuranceWithdrawalPrepared?: boolean;
  accessRevocationPrepared?: boolean;
  documentRetentionPrepared?: boolean;
  employeeCertificatePrepared?: boolean;
};

export type TerminationOffboardingChecklist = {
  ready: boolean;
  missing: string[];
  detail: string;
  dueDate: Date;
  finalPayPrepared: boolean;
  unusedLeaveSettlementPrepared: boolean;
  insuranceWithdrawalPrepared: boolean;
  accessRevocationPrepared: boolean;
  documentRetentionPrepared: boolean;
  employeeCertificatePrepared: boolean;
  sourceIds: string[];
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
  terminationCompliance: TerminationComplianceSnapshot | null;
  terminationOffboarding: TerminationOffboardingChecklist | null;
  createdAt: Date;
};

export type EmployeeLifecycleWorkspace = {
  employees: Array<{
    id: string;
    employeeNo: string;
    displayName: string;
    jobTitle: string;
    employmentStatus: EmploymentStatus;
    hireDate: Date;
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
  metadataJson: unknown;
  createdAt: Date;
};

const globalForLifecycle = globalThis as unknown as {
  hrOneLifecycleDemoState?: LifecycleDemoState;
};

export async function getEmployeeLifecycleWorkspace(session: SessionLike): Promise<EmployeeLifecycleWorkspace> {
  assertPermission(session.role, "employee:write");
  if (canUseDatabase(session)) {
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
        hireDate: employee.hireDate,
        departmentId: employee.departmentId,
      })),
      departments: departments.map((department) => ({
        id: department.id,
        code: department.code,
        name: department.name,
      })),
      events: events.map((event) => mapDbEvent(event, departmentNames)),
    };
  }
  return demoWorkspace();
}

export async function recordLifecycleEvent(session: SessionLike, input: LifecycleEventInput) {
  assertPermission(session.role, "employee:write");
  const normalized = normalizeInput(input);
  if (canUseDatabase(session)) {
    return recordDbLifecycleEvent(session, normalized);
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
      hireDate: demoHireDate(employee.id),
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
  const terminationCompliance = input.eventType === "termination"
    ? calculateTerminationCompliance({
        hireDate: employee.hireDate,
        effectiveDate: input.effectiveDate,
        reasonCategory: input.terminationReasonCategory,
        pensionScheme: input.pensionScheme,
        averageMonthlyWage: input.averageMonthlyWage,
        config: await getTaiwanLaborStandardsConfig({
          ...session,
          tenantId: session.tenantId ?? null,
          companyId: session.companyId ?? null,
        }),
      })
    : null;
  const terminationOffboarding = input.eventType === "termination"
    ? buildTerminationOffboardingChecklist(input, await getTaiwanLaborStandardsConfig({
        ...session,
        tenantId: session.tenantId ?? null,
        companyId: session.companyId ?? null,
      }))
    : null;

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
          terminationCompliance,
          terminationOffboarding,
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
        terminationComplianceCaptured: Boolean(terminationCompliance),
        terminationRequiresHumanReview: terminationCompliance?.requiresHumanReview ?? false,
        terminationOffboardingReady: terminationOffboarding?.ready ?? null,
        terminationOffboardingMissingCount: terminationOffboarding?.missing.length ?? 0,
        sensitiveValuesRedacted: true,
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
  const terminationCompliance = input.eventType === "termination"
    ? calculateTerminationCompliance({
        hireDate: employee.hireDate,
        effectiveDate: input.effectiveDate,
        reasonCategory: input.terminationReasonCategory,
        pensionScheme: input.pensionScheme,
        averageMonthlyWage: input.averageMonthlyWage,
        config: getActiveTaiwanLaborStandardsConfig(),
      })
    : null;
  const terminationOffboarding = input.eventType === "termination"
    ? buildTerminationOffboardingChecklist(input, getActiveTaiwanLaborStandardsConfig())
    : null;
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
    terminationCompliance,
    terminationOffboarding,
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
      terminationComplianceCaptured: Boolean(terminationCompliance),
      terminationRequiresHumanReview: terminationCompliance?.requiresHumanReview ?? false,
      terminationOffboardingReady: terminationOffboarding?.ready ?? null,
      terminationOffboardingMissingCount: terminationOffboarding?.missing.length ?? 0,
      sensitiveValuesRedacted: true,
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
    terminationCompliance: readTerminationCompliance(event.metadataJson),
    terminationOffboarding: readTerminationOffboarding(event.metadataJson),
    createdAt: event.createdAt,
  };
}

function buildTerminationOffboardingChecklist(
  input: ReturnType<typeof normalizeInput>,
  config: Awaited<ReturnType<typeof getTaiwanLaborStandardsConfig>>,
): TerminationOffboardingChecklist {
  const checklist = {
    finalPayPrepared: input.finalPayPrepared,
    unusedLeaveSettlementPrepared: input.unusedLeaveSettlementPrepared,
    insuranceWithdrawalPrepared: input.insuranceWithdrawalPrepared,
    accessRevocationPrepared: input.accessRevocationPrepared,
    documentRetentionPrepared: input.documentRetentionPrepared,
    employeeCertificatePrepared: input.employeeCertificatePrepared,
  };
  const missing = [
    !checklist.finalPayPrepared ? "final wage and payable item review" : null,
    !checklist.unusedLeaveSettlementPrepared ? "unused annual leave settlement review" : null,
    !checklist.insuranceWithdrawalPrepared ? "statutory insurance withdrawal preparation" : null,
    !checklist.accessRevocationPrepared ? "system access revocation plan" : null,
    !checklist.documentRetentionPrepared ? "employee record retention plan" : null,
    !checklist.employeeCertificatePrepared ? "employment certificate request readiness" : null,
  ].filter((item): item is string => Boolean(item));
  const dueDate = addDays(
    input.effectiveDate,
    config.statutoryOnboarding.insuranceWithdrawalDueDaysFromTermination,
  );
  return {
    ...checklist,
    ready: missing.length === 0,
    missing,
    dueDate,
    detail: missing.length
      ? `${missing.length} offboarding item(s) still need HR review before termination close.`
      : "Termination offboarding checklist is ready for HR confirmation.",
    sourceIds: config.sources
      .filter((source) => source.id === "tw-lsa-article-16-17" || source.id === "tw-labor-pension-act-article-12")
      .map((source) => source.id),
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
    terminationReasonCategory: normalizeTerminationReasonCategory(input.terminationReasonCategory),
    pensionScheme: normalizePensionScheme(input.pensionScheme),
    averageMonthlyWage: normalizeOptionalMoney(input.averageMonthlyWage),
    finalPayPrepared: Boolean(input.finalPayPrepared),
    unusedLeaveSettlementPrepared: Boolean(input.unusedLeaveSettlementPrepared),
    insuranceWithdrawalPrepared: Boolean(input.insuranceWithdrawalPrepared),
    accessRevocationPrepared: Boolean(input.accessRevocationPrepared),
    documentRetentionPrepared: Boolean(input.documentRetentionPrepared),
    employeeCertificatePrepared: Boolean(input.employeeCertificatePrepared),
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

function normalizeTerminationReasonCategory(value?: TerminationReasonCategory | null): TerminationReasonCategory {
  if (
    value === "resignation" ||
    value === "layoff" ||
    value === "misconduct" ||
    value === "retirement" ||
    value === "contract_end" ||
    value === "other"
  ) {
    return value;
  }
  return "other";
}

function normalizePensionScheme(value?: PensionScheme | null): PensionScheme {
  if (value === "labor_standards_old") return "labor_standards_old";
  return "labor_pension_new";
}

function normalizeOptionalMoney(value?: number | null) {
  if (value === undefined || value === null || Number(value) === 0) return null;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Average monthly wage must be zero or greater.");
  return parsed;
}

function readTerminationCompliance(value: unknown): TerminationComplianceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const compliance = (value as Record<string, unknown>).terminationCompliance;
  if (!compliance || typeof compliance !== "object" || Array.isArray(compliance)) return null;
  return compliance as TerminationComplianceSnapshot;
}

function readTerminationOffboarding(value: unknown): TerminationOffboardingChecklist | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const offboarding = (value as Record<string, unknown>).terminationOffboarding;
  if (!offboarding || typeof offboarding !== "object" || Array.isArray(offboarding)) return null;
  const record = offboarding as Record<string, unknown>;
  return {
    ready: record.ready === true,
    missing: Array.isArray(record.missing) ? record.missing.filter((item): item is string => typeof item === "string") : [],
    detail: typeof record.detail === "string" ? record.detail : "Termination offboarding checklist status is unavailable.",
    dueDate: readDate(record.dueDate),
    finalPayPrepared: record.finalPayPrepared === true,
    unusedLeaveSettlementPrepared: record.unusedLeaveSettlementPrepared === true,
    insuranceWithdrawalPrepared: record.insuranceWithdrawalPrepared === true,
    accessRevocationPrepared: record.accessRevocationPrepared === true,
    documentRetentionPrepared: record.documentRetentionPrepared === true,
    employeeCertificatePrepared: record.employeeCertificatePrepared === true,
    sourceIds: Array.isArray(record.sourceIds) ? record.sourceIds.filter((item): item is string => typeof item === "string") : [],
  };
}

function demoHireDate(employeeId: string) {
  const dates: Record<string, string> = {
    "demo-hr-employee": "2023-03-01T00:00:00.000Z",
    "demo-manager-employee": "2022-08-15T00:00:00.000Z",
    "demo-employee-1": "2024-01-10T00:00:00.000Z",
    "demo-employee-2": "2024-02-01T00:00:00.000Z",
    "demo-employee-3": "2024-05-20T00:00:00.000Z",
  };
  return new Date(dates[employeeId] ?? "2024-01-01T00:00:00.000Z");
}


function startOfDate(date: Date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return startOfDate(value);
}

function readDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date("1970-01-01T00:00:00.000Z");
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
