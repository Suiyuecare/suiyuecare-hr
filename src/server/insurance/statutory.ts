import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export const statutoryInsuranceTypes = [
  "labor_insurance",
  "employment_insurance",
  "occupational_accident_insurance",
  "national_health_insurance",
  "labor_pension",
] as const;

export type StatutoryInsuranceType = (typeof statutoryInsuranceTypes)[number];
export type StatutoryInsuranceStatus = "pending" | "enrolled" | "exempt" | "withdrawn";

export type StatutoryInsuranceRecordView = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  insuranceType: StatutoryInsuranceType;
  status: StatutoryInsuranceStatus;
  dueDate: Date;
  enrolledAt: Date | null;
  withdrawnAt: Date | null;
  evidenceRef: string | null;
  evidenceHash: string | null;
  exemptionReason: string | null;
  overdue: boolean;
  daysUntilDue: number;
  updatedAt: Date;
};

export type StatutoryInsuranceReadiness = {
  ready: boolean;
  total: number;
  readyCount: number;
  pendingCount: number;
  overdueCount: number;
  detail: string;
  missing: string[];
};

export type StatutoryInsuranceWorkspace = {
  records: StatutoryInsuranceRecordView[];
  readiness: StatutoryInsuranceReadiness;
};

export type UpdateStatutoryInsuranceInput = {
  employeeId: string;
  insuranceType: string;
  status: string;
  effectiveDate?: Date | null;
  evidenceRef?: string | null;
  exemptionReason?: string | null;
  notes?: string | null;
};

type DemoState = {
  records: StatutoryInsuranceRecordView[];
};

const globalForInsurance = globalThis as unknown as {
  hrOneStatutoryInsuranceDemoState?: DemoState;
};

export async function getStatutoryInsuranceWorkspace(session: SessionLike): Promise<StatutoryInsuranceWorkspace> {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    return getDbWorkspace(session);
  }
  return getDemoWorkspace();
}

export async function updateStatutoryInsuranceRecord(
  session: SessionLike,
  input: UpdateStatutoryInsuranceInput,
) {
  assertPermission(session.role, "payroll:manage");
  const normalized = normalizeInput(input);
  if (canUseDatabase(session)) {
    return updateDbRecord(session, normalized);
  }
  return updateDemoRecord(session, normalized);
}

export function evaluateStatutoryInsuranceReadiness(
  records: StatutoryInsuranceRecordView[],
  now = new Date(),
): StatutoryInsuranceReadiness {
  const evaluated = records.map((record) => ({
    ...record,
    overdue: isRecordOverdue(record, now),
  }));
  const readyCount = evaluated.filter((record) => isRecordReady(record)).length;
  const pending = evaluated.filter((record) => !isRecordReady(record));
  const overdue = evaluated.filter((record) => record.overdue);
  const missing = [
    pending.length > 0 ? `${pending.length} pending statutory insurance record(s)` : null,
    overdue.length > 0 ? `${overdue.length} overdue statutory insurance record(s)` : null,
  ].filter(Boolean) as string[];
  return {
    ready: records.length > 0 && pending.length === 0 && overdue.length === 0,
    total: records.length,
    readyCount,
    pendingCount: pending.length,
    overdueCount: overdue.length,
    detail: `${readyCount}/${records.length} statutory insurance record(s) ready; ${pending.length} pending; ${overdue.length} overdue.`,
    missing,
  };
}

export function resetStatutoryInsuranceDemoState() {
  globalForInsurance.hrOneStatutoryInsuranceDemoState = undefined;
}

async function getDbWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const db = getDb();
  const [employees, records, laborConfig] = await Promise.all([
    db.employee.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId, employmentStatus: "active" },
      orderBy: { employeeNo: "asc" },
      select: { id: true, employeeNo: true, displayName: true, hireDate: true },
    }),
    db.statutoryInsuranceRecord.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId },
      include: { employee: { select: { employeeNo: true, displayName: true } } },
      orderBy: [{ employee: { employeeNo: "asc" } }, { insuranceType: "asc" }],
    }),
    getTaiwanLaborStandardsConfig(session),
  ]);
  const recordViews = records.map((record) => readDbRecord(record));
  const missing = missingDefaultRecords(
    employees.map((employee) => ({ ...employee, hireDate: employee.hireDate })),
    recordViews,
    laborConfig.statutoryOnboarding,
  );
  const merged = [...recordViews, ...missing];
  return {
    records: merged,
    readiness: evaluateStatutoryInsuranceReadiness(merged),
  };
}

async function updateDbRecord(
  session: SessionLike & { tenantId: string; companyId: string },
  input: ReturnType<typeof normalizeInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, tenantId: session.tenantId, companyId: session.companyId },
      select: { id: true, employeeNo: true, displayName: true, hireDate: true },
    });
    if (!employee) throw new Error("Employee not found for statutory insurance update.");
    const laborConfig = await getTaiwanLaborStandardsConfig(session);
    const dueDate = calculateDueDate(input.insuranceType, employee.hireDate, laborConfig.statutoryOnboarding);
    const before = await tx.statutoryInsuranceRecord.findUnique({
      where: {
        companyId_employeeId_insuranceType: {
          companyId: session.companyId,
          employeeId: input.employeeId,
          insuranceType: input.insuranceType,
        },
      },
    });
    const record = await tx.statutoryInsuranceRecord.upsert({
      where: {
        companyId_employeeId_insuranceType: {
          companyId: session.companyId,
          employeeId: input.employeeId,
          insuranceType: input.insuranceType,
        },
      },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: input.employeeId,
        insuranceType: input.insuranceType,
        status: input.status,
        dueDate,
        enrolledAt: input.status === "enrolled" ? input.effectiveDate : null,
        withdrawnAt: input.status === "withdrawn" ? input.effectiveDate : null,
        evidenceRef: input.evidenceRef,
        evidenceHash: input.evidenceRef ? stableHash(input.evidenceRef) : null,
        exemptionReason: input.status === "exempt" ? input.exemptionReason : null,
        notesHash: input.notes ? stableHash(input.notes) : null,
        updatedByUserId: session.user?.id,
      },
      update: {
        status: input.status,
        dueDate,
        enrolledAt: input.status === "enrolled" ? input.effectiveDate : null,
        withdrawnAt: input.status === "withdrawn" ? input.effectiveDate : null,
        evidenceRef: input.evidenceRef,
        evidenceHash: input.evidenceRef ? stableHash(input.evidenceRef) : null,
        exemptionReason: input.status === "exempt" ? input.exemptionReason : null,
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
      entityType: "statutory_insurance_record",
      entityId: record.id,
      before,
      after: record,
      metadata: auditMetadata(input, record.evidenceHash),
    });
    return readDbRecord({ ...record, employee });
  });
}

function getDemoWorkspace() {
  const records = getDemoState().records;
  return {
    records,
    readiness: evaluateStatutoryInsuranceReadiness(records),
  };
}

function updateDemoRecord(session: SessionLike, input: ReturnType<typeof normalizeInput>) {
  const state = getDemoState();
  const index = state.records.findIndex(
    (record) => record.employeeId === input.employeeId && record.insuranceType === input.insuranceType,
  );
  if (index < 0) throw new Error("Employee not found for statutory insurance update.");
  const before = state.records[index];
  const evidenceHash = input.evidenceRef ? stableHash(input.evidenceRef) : null;
  const after: StatutoryInsuranceRecordView = {
    ...before,
    status: input.status,
    enrolledAt: input.status === "enrolled" ? input.effectiveDate : null,
    withdrawnAt: input.status === "withdrawn" ? input.effectiveDate : null,
    evidenceRef: input.evidenceRef,
    evidenceHash,
    exemptionReason: input.status === "exempt" ? input.exemptionReason : null,
    overdue: false,
    daysUntilDue: daysBetween(new Date(), before.dueDate),
    updatedAt: new Date(),
  };
  after.overdue = isRecordOverdue(after);
  state.records[index] = after;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName,
    action: before.status === "pending" ? "create" : "update",
    entityType: "statutory_insurance_record",
    entityId: after.id,
    before,
    after,
    metadata: auditMetadata(input, evidenceHash),
  });
  return after;
}

function getDemoState() {
  if (!globalForInsurance.hrOneStatutoryInsuranceDemoState) {
    const employees = getFallbackCompanyOverview().company.employees.map((employee, index) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      hireDate: new Date(Date.UTC(2026, 0, index + 2)),
    }));
    globalForInsurance.hrOneStatutoryInsuranceDemoState = {
      records: employees.flatMap((employee, employeeIndex) =>
        statutoryInsuranceTypes.map((insuranceType, typeIndex) => {
          const pending = employee.id === "demo-employee-3" && typeIndex < 2;
          const dueDate = addDays(employee.hireDate, 0);
          const record: StatutoryInsuranceRecordView = {
            id: `demo-insurance-${employee.id}-${insuranceType}`,
            employeeId: employee.id,
            employeeNo: employee.employeeNo,
            employeeName: employee.displayName,
            insuranceType,
            status: pending ? "pending" : "enrolled",
            dueDate,
            enrolledAt: pending ? null : addDays(employee.hireDate, employeeIndex === 0 ? 0 : 1),
            withdrawnAt: null,
            evidenceRef: pending ? null : `portal://${employee.employeeNo}/${insuranceType}`,
            evidenceHash: pending ? null : stableHash(`portal://${employee.employeeNo}/${insuranceType}`),
            exemptionReason: null,
            overdue: false,
            daysUntilDue: daysBetween(new Date(), dueDate),
            updatedAt: new Date("2026-06-13T00:00:00.000Z"),
          };
          record.overdue = isRecordOverdue(record);
          return record;
        }),
      ),
    };
  }
  return globalForInsurance.hrOneStatutoryInsuranceDemoState;
}

function missingDefaultRecords(
  employees: Array<{ id: string; employeeNo: string; displayName: string; hireDate: Date }>,
  records: StatutoryInsuranceRecordView[],
  statutoryOnboarding: {
    laborInsuranceEnrollmentDueDaysFromHire: number;
    employmentInsuranceEnrollmentDueDaysFromHire: number;
    occupationalAccidentInsuranceEnrollmentDueDaysFromHire: number;
  },
) {
  const existing = new Set(records.map((record) => `${record.employeeId}:${record.insuranceType}`));
  return employees.flatMap((employee) =>
    statutoryInsuranceTypes.flatMap((insuranceType) => {
      if (existing.has(`${employee.id}:${insuranceType}`)) return [];
      const dueDate = calculateDueDate(insuranceType, employee.hireDate, statutoryOnboarding);
      const record: StatutoryInsuranceRecordView = {
        id: `missing-${employee.id}-${insuranceType}`,
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        employeeName: employee.displayName,
        insuranceType,
        status: "pending",
        dueDate,
        enrolledAt: null,
        withdrawnAt: null,
        evidenceRef: null,
        evidenceHash: null,
        exemptionReason: null,
        overdue: false,
        daysUntilDue: daysBetween(new Date(), dueDate),
        updatedAt: new Date(),
      };
      record.overdue = isRecordOverdue(record);
      return record;
    }),
  );
}

function calculateDueDate(
  insuranceType: StatutoryInsuranceType,
  hireDate: Date,
  statutoryOnboarding: {
    laborInsuranceEnrollmentDueDaysFromHire: number;
    employmentInsuranceEnrollmentDueDaysFromHire: number;
    occupationalAccidentInsuranceEnrollmentDueDaysFromHire: number;
  },
) {
  const dueDays =
    insuranceType === "employment_insurance"
      ? statutoryOnboarding.employmentInsuranceEnrollmentDueDaysFromHire
      : insuranceType === "occupational_accident_insurance"
        ? statutoryOnboarding.occupationalAccidentInsuranceEnrollmentDueDaysFromHire
        : statutoryOnboarding.laborInsuranceEnrollmentDueDaysFromHire;
  return addDays(hireDate, dueDays);
}

function readDbRecord(record: {
  id: string;
  employeeId: string;
  insuranceType: string;
  status: string;
  dueDate: Date;
  enrolledAt: Date | null;
  withdrawnAt: Date | null;
  evidenceRef: string | null;
  evidenceHash: string | null;
  exemptionReason: string | null;
  updatedAt: Date;
  employee: { employeeNo: string; displayName: string };
}): StatutoryInsuranceRecordView {
  const mapped: StatutoryInsuranceRecordView = {
    id: record.id,
    employeeId: record.employeeId,
    employeeNo: record.employee.employeeNo,
    employeeName: record.employee.displayName,
    insuranceType: normalizeInsuranceType(record.insuranceType),
    status: normalizeStatus(record.status),
    dueDate: record.dueDate,
    enrolledAt: record.enrolledAt,
    withdrawnAt: record.withdrawnAt,
    evidenceRef: record.evidenceRef,
    evidenceHash: record.evidenceHash,
    exemptionReason: record.exemptionReason,
    overdue: false,
    daysUntilDue: daysBetween(new Date(), record.dueDate),
    updatedAt: record.updatedAt,
  };
  mapped.overdue = isRecordOverdue(mapped);
  return mapped;
}

function normalizeInput(input: UpdateStatutoryInsuranceInput) {
  const status = normalizeStatus(input.status);
  return {
    employeeId: cleanText(input.employeeId, 120),
    insuranceType: normalizeInsuranceType(input.insuranceType),
    status,
    effectiveDate: input.effectiveDate && !Number.isNaN(input.effectiveDate.getTime()) ? input.effectiveDate : new Date(),
    evidenceRef: cleanText(input.evidenceRef, 240) || null,
    exemptionReason: cleanText(input.exemptionReason, 240) || null,
    notes: cleanText(input.notes, 500) || null,
  };
}

function auditMetadata(input: ReturnType<typeof normalizeInput>, evidenceHash: string | null) {
  return {
    employeeId: input.employeeId,
    insuranceType: input.insuranceType,
    status: input.status,
    evidenceHash,
    evidenceRefHash: input.evidenceRef ? stableHash(input.evidenceRef) : null,
    exemptionReasonHash: input.exemptionReason ? stableHash(input.exemptionReason) : null,
    notesHash: input.notes ? stableHash(input.notes) : null,
    rawEvidenceIncluded: false,
    rawNotesIncluded: false,
  };
}

function normalizeInsuranceType(value: string): StatutoryInsuranceType {
  return statutoryInsuranceTypes.includes(value as StatutoryInsuranceType)
    ? value as StatutoryInsuranceType
    : "labor_insurance";
}

function normalizeStatus(value: string): StatutoryInsuranceStatus {
  if (value === "enrolled" || value === "exempt" || value === "withdrawn") return value;
  return "pending";
}

function isRecordReady(record: StatutoryInsuranceRecordView) {
  return record.status === "enrolled" || record.status === "exempt" || record.status === "withdrawn";
}

function isRecordOverdue(record: StatutoryInsuranceRecordView, now = new Date()) {
  return !isRecordReady(record) && record.dueDate.getTime() < startOfDay(now).getTime();
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
