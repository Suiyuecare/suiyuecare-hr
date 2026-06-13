import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type EmploymentTermStatus = "draft" | "active" | "retired";

export type EmploymentTermView = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  version: string;
  status: EmploymentTermStatus;
  effectiveFrom: Date;
  jobTitle: string;
  workLocation: string;
  regularWorkSchedule: string;
  wagePaymentDay: string;
  wageBasisSummaryHash: string;
  benefitsSummary: string;
  sourceRef: string | null;
  acknowledgementRequired: boolean;
  acknowledgementHash: string | null;
  acknowledgedAt: Date | null;
};

export type EmploymentTermsWorkspace = {
  employees: Array<{ id: string; employeeNo: string; displayName: string; jobTitle: string }>;
  terms: EmploymentTermView[];
  coverage: {
    activeTermsCount: number;
    acknowledgedCount: number;
    pendingCount: number;
    coverageRate: number;
  };
};

type DemoState = {
  terms: EmploymentTermView[];
};

const globalForEmploymentTerms = globalThis as unknown as {
  hrOneEmploymentTermsDemoState?: DemoState;
};

export async function getEmploymentTermsWorkspace(session: SessionLike): Promise<EmploymentTermsWorkspace> {
  assertPermission(session.role, "employment_terms:manage");
  if (canUseDatabase(session)) {
    try {
      const [employees, terms] = await Promise.all([
        getDb().employee.findMany({
          where: { tenantId: session.tenantId!, companyId: session.companyId!, employmentStatus: "active" },
          orderBy: { employeeNo: "asc" },
        }),
        getDb().employeeEmploymentTerm.findMany({
          where: { tenantId: session.tenantId!, companyId: session.companyId! },
          include: { employee: true },
          orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
        }),
      ]);
      const termViews = terms.map(mapDbTerm);
      return {
        employees: employees.map((employee) => ({
          id: employee.id,
          employeeNo: employee.employeeNo,
          displayName: employee.displayName,
          jobTitle: employee.jobTitle,
        })),
        terms: termViews,
        coverage: summarizeCoverage(termViews),
      };
    } catch {
      return getDemoWorkspace();
    }
  }
  return getDemoWorkspace();
}

export async function getOwnEmploymentTerms(session: SessionLike) {
  assertPermission(session.role, "employment_terms:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  if (canUseDatabase(session)) {
    try {
      const terms = await getDb().employeeEmploymentTerm.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employeeId: session.employee.id,
          status: "active",
        },
        include: { employee: true },
        orderBy: { effectiveFrom: "desc" },
      });
      return terms.map(mapDbTerm);
    } catch {
      return getDemoState().terms.filter((term) => term.employeeId === session.employee?.id && term.status === "active");
    }
  }
  return getDemoState().terms.filter((term) => term.employeeId === session.employee?.id && term.status === "active");
}

export async function saveEmploymentTerm(
  session: SessionLike,
  input: {
    employeeId: string;
    version: string;
    status: EmploymentTermStatus;
    effectiveFrom: Date;
    jobTitle: string;
    workLocation: string;
    regularWorkSchedule: string;
    wagePaymentDay: string;
    wageBasisSummary: string;
    benefitsSummary: string;
    sourceRef?: string | null;
    acknowledgementRequired: boolean;
  },
) {
  assertPermission(session.role, "employment_terms:manage");
  const normalized = normalizeInput(input);
  if (canUseDatabase(session)) {
    try {
      return saveDbTerm(session, normalized);
    } catch {
      return saveDemoTerm(session, normalized);
    }
  }
  return saveDemoTerm(session, normalized);
}

export async function acknowledgeEmploymentTerm(session: SessionLike, termId: string) {
  assertPermission(session.role, "employment_terms:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  if (canUseDatabase(session)) {
    try {
      return acknowledgeDbTerm(session, termId);
    } catch {
      return acknowledgeDemoTerm(session, termId);
    }
  }
  return acknowledgeDemoTerm(session, termId);
}

export function resetEmploymentTermsDemoState() {
  const overview = getFallbackCompanyOverview();
  const employees = overview.company.employees;
  globalForEmploymentTerms.hrOneEmploymentTermsDemoState = {
    terms: employees.slice(0, 3).map((employee, index) => ({
      id: `demo-employment-term-${index + 1}`,
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      employeeName: employee.displayName,
      version: "2026.01",
      status: "active",
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      jobTitle: employee.jobTitle,
      workLocation: "Taipei office / approved remote work",
      regularWorkSchedule: "Regular 09:00-18:00, one-hour break, based on active shift policy.",
      wagePaymentDay: "Monthly, paid by the 5th business day.",
      wageBasisSummaryHash: stableHash(`${employee.id}:salary-profile-linked`),
      benefitsSummary: "Statutory insurance, labor pension, annual leave, and company benefits follow active HR One policies.",
      sourceRef: "demo://employment-terms/2026.01",
      acknowledgementRequired: true,
      acknowledgementHash: index === 0 ? stableHash(`${employee.id}:employment-terms:2026.01`) : null,
      acknowledgedAt: index === 0 ? new Date("2026-06-01T02:00:00.000Z") : null,
    })),
  };
}

async function saveDbTerm(
  session: SessionLike & { tenantId: string; companyId: string },
  input: ReturnType<typeof normalizeInput>,
) {
  const term = await getDb().$transaction(async (tx) => {
    const employee = await tx.employee.findFirstOrThrow({
      where: { id: input.employeeId, tenantId: session.tenantId, companyId: session.companyId },
    });
    const record = await tx.employeeEmploymentTerm.upsert({
      where: {
        employeeId_version: {
          employeeId: employee.id,
          version: input.version,
        },
      },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: employee.id,
        ...writeInput(input),
        createdByUserId: session.user?.id,
        updatedByUserId: session.user?.id,
      },
      update: {
        ...writeInput(input),
        acknowledgementHash: input.status === "active" ? undefined : null,
        acknowledgedAt: input.status === "active" ? undefined : null,
        updatedByUserId: session.user?.id,
      },
      include: { employee: true },
    });
    const view = mapDbTerm(record);
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "employee_employment_term",
      entityId: record.id,
      after: termAuditPayload(view),
      metadata: termAuditMetadata(view),
    });
    return view;
  });
  return term;
}

async function acknowledgeDbTerm(
  session: SessionLike & { tenantId: string; companyId: string },
  termId: string,
) {
  const term = await getDb().$transaction(async (tx) => {
    const before = await tx.employeeEmploymentTerm.findFirstOrThrow({
      where: {
        id: termId,
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: session.employee!.id,
        status: "active",
      },
      include: { employee: true },
    });
    const acknowledgementHash = stableHash(`${before.employeeId}:${before.version}:${before.wageBasisSummaryHash}`);
    const record = await tx.employeeEmploymentTerm.update({
      where: { id: before.id },
      data: { acknowledgementHash, acknowledgedAt: new Date() },
      include: { employee: true },
    });
    const view = mapDbTerm(record);
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "approve",
      entityType: "employee_employment_term_acknowledgement",
      entityId: record.id,
      after: {
        termId: record.id,
        version: record.version,
        acknowledgementHash,
      },
      metadata: {
        termId: record.id,
        version: record.version,
        acknowledgementHash,
        rawWageTermsIncluded: false,
      },
    });
    return view;
  });
  return term;
}

function getDemoWorkspace(): EmploymentTermsWorkspace {
  const overview = getFallbackCompanyOverview();
  const terms = getDemoState().terms;
  return {
    employees: overview.company.employees.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      jobTitle: employee.jobTitle,
    })),
    terms,
    coverage: summarizeCoverage(terms),
  };
}

function saveDemoTerm(session: SessionLike, input: ReturnType<typeof normalizeInput>) {
  const overview = getFallbackCompanyOverview();
  const employee = overview.company.employees.find((item) => item.id === input.employeeId);
  if (!employee) throw new Error("Employee not found.");
  const state = getDemoState();
  const index = state.terms.findIndex((term) => term.employeeId === employee.id && term.version === input.version);
  const term: EmploymentTermView = {
    id: index >= 0 ? state.terms[index].id : crypto.randomUUID(),
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.displayName,
    version: input.version,
    status: input.status,
    effectiveFrom: input.effectiveFrom,
    jobTitle: input.jobTitle,
    workLocation: input.workLocation,
    regularWorkSchedule: input.regularWorkSchedule,
    wagePaymentDay: input.wagePaymentDay,
    wageBasisSummaryHash: stableHash(input.wageBasisSummary),
    benefitsSummary: input.benefitsSummary,
    sourceRef: input.sourceRef,
    acknowledgementRequired: input.acknowledgementRequired,
    acknowledgementHash: index >= 0 ? state.terms[index].acknowledgementHash : null,
    acknowledgedAt: index >= 0 ? state.terms[index].acknowledgedAt : null,
  };
  if (index >= 0) state.terms[index] = term;
  else state.terms.unshift(term);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "employee_employment_term",
    entityId: term.id,
    after: termAuditPayload(term),
    metadata: termAuditMetadata(term),
  });
  return term;
}

function acknowledgeDemoTerm(session: SessionLike, termId: string) {
  const state = getDemoState();
  const index = state.terms.findIndex(
    (term) => term.id === termId && term.employeeId === session.employee?.id && term.status === "active",
  );
  if (index < 0) throw new Error("Employment terms not found.");
  const before = state.terms[index];
  const acknowledgementHash = stableHash(`${before.employeeId}:${before.version}:${before.wageBasisSummaryHash}`);
  const term = { ...before, acknowledgementHash, acknowledgedAt: new Date() };
  state.terms[index] = term;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName,
    action: "approve",
    entityType: "employee_employment_term_acknowledgement",
    entityId: term.id,
    after: { termId: term.id, version: term.version, acknowledgementHash },
    metadata: {
      termId: term.id,
      version: term.version,
      acknowledgementHash,
      rawWageTermsIncluded: false,
    },
  });
  return term;
}

function normalizeInput(input: Parameters<typeof saveEmploymentTerm>[1]) {
  return {
    employeeId: cleanText(input.employeeId, 120),
    version: cleanText(input.version, 40) || "2026.01",
    status: normalizeStatus(input.status),
    effectiveFrom: validDate(input.effectiveFrom),
    jobTitle: cleanText(input.jobTitle, 120) || "Employee",
    workLocation: cleanText(input.workLocation, 240) || "Company approved workplace",
    regularWorkSchedule: cleanText(input.regularWorkSchedule, 500) || "Based on active attendance policy and shift schedule.",
    wagePaymentDay: cleanText(input.wagePaymentDay, 120) || "Monthly payroll date configured by HR.",
    wageBasisSummary: cleanText(input.wageBasisSummary, 500) || "Linked to active salary profile.",
    benefitsSummary: cleanText(input.benefitsSummary, 800) || "Benefits follow active HR policies.",
    sourceRef: cleanText(input.sourceRef, 240) || null,
    acknowledgementRequired: input.acknowledgementRequired,
  };
}

function writeInput(input: ReturnType<typeof normalizeInput>) {
  return {
    version: input.version,
    status: input.status,
    effectiveFrom: input.effectiveFrom,
    jobTitle: input.jobTitle,
    workLocation: input.workLocation,
    regularWorkSchedule: input.regularWorkSchedule,
    wagePaymentDay: input.wagePaymentDay,
    wageBasisSummaryHash: stableHash(input.wageBasisSummary),
    benefitsSummary: input.benefitsSummary,
    sourceRef: input.sourceRef,
    acknowledgementRequired: input.acknowledgementRequired,
  };
}

function mapDbTerm(record: {
  id: string;
  employeeId: string;
  employee: { employeeNo: string; displayName: string };
  version: string;
  status: string;
  effectiveFrom: Date;
  jobTitle: string;
  workLocation: string;
  regularWorkSchedule: string;
  wagePaymentDay: string;
  wageBasisSummaryHash: string;
  benefitsSummary: string;
  sourceRef: string | null;
  acknowledgementRequired: boolean;
  acknowledgementHash: string | null;
  acknowledgedAt: Date | null;
}): EmploymentTermView {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeNo: record.employee.employeeNo,
    employeeName: record.employee.displayName,
    version: record.version,
    status: normalizeStatus(record.status),
    effectiveFrom: record.effectiveFrom,
    jobTitle: record.jobTitle,
    workLocation: record.workLocation,
    regularWorkSchedule: record.regularWorkSchedule,
    wagePaymentDay: record.wagePaymentDay,
    wageBasisSummaryHash: record.wageBasisSummaryHash,
    benefitsSummary: record.benefitsSummary,
    sourceRef: record.sourceRef,
    acknowledgementRequired: record.acknowledgementRequired,
    acknowledgementHash: record.acknowledgementHash,
    acknowledgedAt: record.acknowledgedAt,
  };
}

function summarizeCoverage(terms: EmploymentTermView[]) {
  const active = terms.filter((term) => term.status === "active" && term.acknowledgementRequired);
  const acknowledgedCount = active.filter((term) => term.acknowledgedAt).length;
  return {
    activeTermsCount: active.length,
    acknowledgedCount,
    pendingCount: Math.max(0, active.length - acknowledgedCount),
    coverageRate: active.length === 0 ? 100 : Math.round((acknowledgedCount / active.length) * 100),
  };
}

function termAuditPayload(term: EmploymentTermView) {
  return {
    employeeId: term.employeeId,
    version: term.version,
    status: term.status,
    jobTitleHash: stableHash(term.jobTitle),
    workLocationHash: stableHash(term.workLocation),
    wageBasisSummaryHash: term.wageBasisSummaryHash,
    acknowledgementRequired: term.acknowledgementRequired,
    acknowledged: Boolean(term.acknowledgedAt),
  };
}

function termAuditMetadata(term: EmploymentTermView) {
  return {
    employeeId: term.employeeId,
    version: term.version,
    status: term.status,
    sourceConfigured: Boolean(term.sourceRef),
    acknowledgementRequired: term.acknowledgementRequired,
    acknowledged: Boolean(term.acknowledgedAt),
    wageBasisSummaryHash: term.wageBasisSummaryHash,
    rawWageTermsIncluded: false,
  };
}

function getDemoState() {
  if (!globalForEmploymentTerms.hrOneEmploymentTermsDemoState) resetEmploymentTermsDemoState();
  return globalForEmploymentTerms.hrOneEmploymentTermsDemoState!;
}

function normalizeStatus(value: unknown): EmploymentTermStatus {
  return value === "active" || value === "retired" || value === "draft" ? value : "draft";
}

function validDate(value: Date) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
