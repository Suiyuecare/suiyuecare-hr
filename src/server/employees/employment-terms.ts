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
  contractLifecycleSummaryHash: string | null;
  severancePensionBonusSummaryHash: string | null;
  mealLodgingToolCostSummaryHash: string | null;
  safetyHealthSummaryHash: string | null;
  trainingSummaryHash: string | null;
  disasterCompensationSicknessSummaryHash: string | null;
  disciplineSummaryHash: string | null;
  rewardDisciplineSummaryHash: string | null;
  rightsObligationsSummaryHash: string | null;
  sourceRef: string | null;
  article7MissingFields: string[];
  article7Ready: boolean;
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
    article7ReadyCount: number;
    article7GapCount: number;
    sourceCount: number;
  };
};

const article7RequiredFields = [
  "workplace_and_work",
  "worktime_rest_leave_shift",
  "wage_calculation_payment",
  "contract_lifecycle",
  "severance_pension_bonus",
  "meal_lodging_tool_cost",
  "safety_health",
  "training",
  "welfare",
  "disaster_compensation_sickness",
  "discipline",
  "reward_discipline",
  "rights_obligations",
  "source_ref",
] as const;

type DemoState = {
  terms: EmploymentTermView[];
};

const globalForEmploymentTerms = globalThis as unknown as {
  hrOneEmploymentTermsDemoState?: DemoState;
};

export async function getEmploymentTermsWorkspace(session: SessionLike): Promise<EmploymentTermsWorkspace> {
  assertPermission(session.role, "employment_terms:manage");
  if (canUseDatabase(session)) {
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
  }
  return getDemoWorkspace();
}

export async function getOwnEmploymentTerms(session: SessionLike) {
  assertPermission(session.role, "employment_terms:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  if (canUseDatabase(session)) {
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
    contractLifecycleSummary?: string | null;
    severancePensionBonusSummary?: string | null;
    mealLodgingToolCostSummary?: string | null;
    safetyHealthSummary?: string | null;
    trainingSummary?: string | null;
    disasterCompensationSicknessSummary?: string | null;
    disciplineSummary?: string | null;
    rewardDisciplineSummary?: string | null;
    rightsObligationsSummary?: string | null;
    sourceRef?: string | null;
    acknowledgementRequired: boolean;
  },
) {
  assertPermission(session.role, "employment_terms:manage");
  const normalized = normalizeInput(input);
  if (canUseDatabase(session)) {
    return saveDbTerm(session, normalized);
  }
  return saveDemoTerm(session, normalized);
}

export async function acknowledgeEmploymentTerm(session: SessionLike, termId: string) {
  assertPermission(session.role, "employment_terms:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  if (canUseDatabase(session)) {
    return acknowledgeDbTerm(session, termId);
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
      jobTitle: localizeDemoJobTitle(employee.jobTitle),
      workLocation: "台北辦公室 / 經核准遠端工作",
      regularWorkSchedule: "固定 09:00-18:00，休息一小時；輪班與休假依有效班表與假勤政策。",
      wagePaymentDay: "每月 5 個營業日內匯款",
      wageBasisSummaryHash: stableHash(`${employee.id}:salary-profile-linked`),
      benefitsSummary: "勞健保、勞退、特休與公司福利依有效 HR One 政策辦理。",
      contractLifecycleSummaryHash: stableHash(`${employee.id}:contract-lifecycle`),
      severancePensionBonusSummaryHash: stableHash(`${employee.id}:severance-pension-bonus`),
      mealLodgingToolCostSummaryHash: stableHash(`${employee.id}:meal-lodging-tool-cost`),
      safetyHealthSummaryHash: stableHash(`${employee.id}:safety-health`),
      trainingSummaryHash: stableHash(`${employee.id}:training`),
      disasterCompensationSicknessSummaryHash: stableHash(`${employee.id}:disaster-compensation-sickness`),
      disciplineSummaryHash: stableHash(`${employee.id}:discipline`),
      rewardDisciplineSummaryHash: stableHash(`${employee.id}:reward-discipline`),
      rightsObligationsSummaryHash: stableHash(`${employee.id}:rights-obligations`),
      sourceRef: "demo://employment-terms/2026.01",
      article7MissingFields: [],
      article7Ready: true,
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
  const baseTerm: Omit<EmploymentTermView, "article7MissingFields" | "article7Ready"> = {
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
    contractLifecycleSummaryHash: stableHash(input.contractLifecycleSummary),
    severancePensionBonusSummaryHash: stableHash(input.severancePensionBonusSummary),
    mealLodgingToolCostSummaryHash: stableHash(input.mealLodgingToolCostSummary),
    safetyHealthSummaryHash: stableHash(input.safetyHealthSummary),
    trainingSummaryHash: stableHash(input.trainingSummary),
    disasterCompensationSicknessSummaryHash: stableHash(input.disasterCompensationSicknessSummary),
    disciplineSummaryHash: stableHash(input.disciplineSummary),
    rewardDisciplineSummaryHash: stableHash(input.rewardDisciplineSummary),
    rightsObligationsSummaryHash: stableHash(input.rightsObligationsSummary),
    sourceRef: input.sourceRef,
    acknowledgementRequired: input.acknowledgementRequired,
    acknowledgementHash: index >= 0 ? state.terms[index].acknowledgementHash : null,
    acknowledgedAt: index >= 0 ? state.terms[index].acknowledgedAt : null,
  };
  const article7MissingFields = missingArticle7Fields(baseTerm);
  const term: EmploymentTermView = {
    ...baseTerm,
    article7MissingFields,
    article7Ready: article7MissingFields.length === 0,
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
    contractLifecycleSummary: cleanText(input.contractLifecycleSummary, 500) || "Contract formation, termination, and retirement follow active company work rules and Taiwan labor standards.",
    severancePensionBonusSummary: cleanText(input.severancePensionBonusSummary, 500) || "Severance, retirement, allowances, and bonuses follow active payroll and legal rules.",
    mealLodgingToolCostSummary: cleanText(input.mealLodgingToolCostSummary, 400) || "No employee-borne meal, lodging, or tool costs unless separately approved and lawful.",
    safetyHealthSummary: cleanText(input.safetyHealthSummary, 400) || "Safety and health requirements follow company workplace safety policies.",
    trainingSummary: cleanText(input.trainingSummary, 400) || "Required education and training follow active HR training policies.",
    disasterCompensationSicknessSummary: cleanText(input.disasterCompensationSicknessSummary, 500) || "Occupational disaster compensation and sickness subsidy follow statutory and company policies.",
    disciplineSummary: cleanText(input.disciplineSummary, 400) || "Work discipline follows approved company work rules.",
    rewardDisciplineSummary: cleanText(input.rewardDisciplineSummary, 400) || "Rewards and disciplinary measures follow approved company work rules.",
    rightsObligationsSummary: cleanText(input.rightsObligationsSummary, 500) || "Other labor-management rights and obligations follow approved work rules and policy documents.",
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
    contractLifecycleSummaryHash: stableHash(input.contractLifecycleSummary),
    severancePensionBonusSummaryHash: stableHash(input.severancePensionBonusSummary),
    mealLodgingToolCostSummaryHash: stableHash(input.mealLodgingToolCostSummary),
    safetyHealthSummaryHash: stableHash(input.safetyHealthSummary),
    trainingSummaryHash: stableHash(input.trainingSummary),
    disasterCompensationSicknessSummaryHash: stableHash(input.disasterCompensationSicknessSummary),
    disciplineSummaryHash: stableHash(input.disciplineSummary),
    rewardDisciplineSummaryHash: stableHash(input.rewardDisciplineSummary),
    rightsObligationsSummaryHash: stableHash(input.rightsObligationsSummary),
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
  contractLifecycleSummaryHash: string | null;
  severancePensionBonusSummaryHash: string | null;
  mealLodgingToolCostSummaryHash: string | null;
  safetyHealthSummaryHash: string | null;
  trainingSummaryHash: string | null;
  disasterCompensationSicknessSummaryHash: string | null;
  disciplineSummaryHash: string | null;
  rewardDisciplineSummaryHash: string | null;
  rightsObligationsSummaryHash: string | null;
  sourceRef: string | null;
  acknowledgementRequired: boolean;
  acknowledgementHash: string | null;
  acknowledgedAt: Date | null;
}): EmploymentTermView {
  const article7MissingFields = missingArticle7Fields(record);
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
    contractLifecycleSummaryHash: record.contractLifecycleSummaryHash,
    severancePensionBonusSummaryHash: record.severancePensionBonusSummaryHash,
    mealLodgingToolCostSummaryHash: record.mealLodgingToolCostSummaryHash,
    safetyHealthSummaryHash: record.safetyHealthSummaryHash,
    trainingSummaryHash: record.trainingSummaryHash,
    disasterCompensationSicknessSummaryHash: record.disasterCompensationSicknessSummaryHash,
    disciplineSummaryHash: record.disciplineSummaryHash,
    rewardDisciplineSummaryHash: record.rewardDisciplineSummaryHash,
    rightsObligationsSummaryHash: record.rightsObligationsSummaryHash,
    sourceRef: record.sourceRef,
    article7MissingFields,
    article7Ready: article7MissingFields.length === 0,
    acknowledgementRequired: record.acknowledgementRequired,
    acknowledgementHash: record.acknowledgementHash,
    acknowledgedAt: record.acknowledgedAt,
  };
}

function summarizeCoverage(terms: EmploymentTermView[]) {
  const active = terms.filter((term) => term.status === "active" && term.acknowledgementRequired);
  const acknowledgedCount = active.filter((term) => term.acknowledgedAt).length;
  const article7ReadyCount = active.filter((term) => term.article7Ready).length;
  return {
    activeTermsCount: active.length,
    acknowledgedCount,
    pendingCount: Math.max(0, active.length - acknowledgedCount),
    coverageRate: active.length === 0 ? 100 : Math.round((acknowledgedCount / active.length) * 100),
    article7ReadyCount,
    article7GapCount: Math.max(0, active.length - article7ReadyCount),
    sourceCount: active.filter((term) => term.sourceRef).length,
  };
}

function missingArticle7Fields(term: {
  jobTitle?: string | null;
  workLocation?: string | null;
  regularWorkSchedule?: string | null;
  wagePaymentDay?: string | null;
  wageBasisSummaryHash?: string | null;
  benefitsSummary?: string | null;
  contractLifecycleSummaryHash?: string | null;
  severancePensionBonusSummaryHash?: string | null;
  mealLodgingToolCostSummaryHash?: string | null;
  safetyHealthSummaryHash?: string | null;
  trainingSummaryHash?: string | null;
  disasterCompensationSicknessSummaryHash?: string | null;
  disciplineSummaryHash?: string | null;
  rewardDisciplineSummaryHash?: string | null;
  rightsObligationsSummaryHash?: string | null;
  sourceRef?: string | null;
}) {
  const missing = new Set<string>();
  if (!term.jobTitle || !term.workLocation) missing.add("workplace_and_work");
  if (!term.regularWorkSchedule) missing.add("worktime_rest_leave_shift");
  if (!term.wagePaymentDay || !term.wageBasisSummaryHash) missing.add("wage_calculation_payment");
  if (!term.contractLifecycleSummaryHash) missing.add("contract_lifecycle");
  if (!term.severancePensionBonusSummaryHash) missing.add("severance_pension_bonus");
  if (!term.mealLodgingToolCostSummaryHash) missing.add("meal_lodging_tool_cost");
  if (!term.safetyHealthSummaryHash) missing.add("safety_health");
  if (!term.trainingSummaryHash) missing.add("training");
  if (!term.benefitsSummary) missing.add("welfare");
  if (!term.disasterCompensationSicknessSummaryHash) missing.add("disaster_compensation_sickness");
  if (!term.disciplineSummaryHash) missing.add("discipline");
  if (!term.rewardDisciplineSummaryHash) missing.add("reward_discipline");
  if (!term.rightsObligationsSummaryHash) missing.add("rights_obligations");
  if (!term.sourceRef) missing.add("source_ref");
  return article7RequiredFields.filter((field) => missing.has(field));
}

function termAuditPayload(term: EmploymentTermView) {
  return {
    employeeId: term.employeeId,
    version: term.version,
    status: term.status,
    jobTitleHash: stableHash(term.jobTitle),
    workLocationHash: stableHash(term.workLocation),
    wageBasisSummaryHash: term.wageBasisSummaryHash,
    contractLifecycleSummaryHash: term.contractLifecycleSummaryHash,
    severancePensionBonusSummaryHash: term.severancePensionBonusSummaryHash,
    mealLodgingToolCostSummaryHash: term.mealLodgingToolCostSummaryHash,
    safetyHealthSummaryHash: term.safetyHealthSummaryHash,
    trainingSummaryHash: term.trainingSummaryHash,
    disasterCompensationSicknessSummaryHash: term.disasterCompensationSicknessSummaryHash,
    disciplineSummaryHash: term.disciplineSummaryHash,
    rewardDisciplineSummaryHash: term.rewardDisciplineSummaryHash,
    rightsObligationsSummaryHash: term.rightsObligationsSummaryHash,
    article7Ready: term.article7Ready,
    article7MissingFields: term.article7MissingFields,
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
    article7Ready: term.article7Ready,
    article7MissingFieldCount: term.article7MissingFields.length,
    hasContractLifecycleSummaryHash: Boolean(term.contractLifecycleSummaryHash),
    hasSeverancePensionBonusSummaryHash: Boolean(term.severancePensionBonusSummaryHash),
    hasMealLodgingToolCostSummaryHash: Boolean(term.mealLodgingToolCostSummaryHash),
    hasSafetyHealthSummaryHash: Boolean(term.safetyHealthSummaryHash),
    hasTrainingSummaryHash: Boolean(term.trainingSummaryHash),
    hasDisasterCompensationSicknessSummaryHash: Boolean(term.disasterCompensationSicknessSummaryHash),
    hasDisciplineSummaryHash: Boolean(term.disciplineSummaryHash),
    hasRewardDisciplineSummaryHash: Boolean(term.rewardDisciplineSummaryHash),
    hasRightsObligationsSummaryHash: Boolean(term.rightsObligationsSummaryHash),
    acknowledgementRequired: term.acknowledgementRequired,
    acknowledged: Boolean(term.acknowledgedAt),
    wageBasisSummaryHash: term.wageBasisSummaryHash,
    rawWageTermsIncluded: false,
    rawHealthTermsIncluded: false,
    rawDisciplineTermsIncluded: false,
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

function localizeDemoJobTitle(jobTitle: string) {
  const labels: Record<string, string> = {
    "HR Admin": "人資管理員",
    "Engineering Manager": "工程主管",
    "Frontend Engineer": "前端工程師",
    "Backend Engineer": "後端工程師",
    "Customer Success": "客戶成功專員",
    "Payroll Specialist": "薪資專員",
    "Operations": "營運專員",
  };
  return labels[jobTitle] ?? jobTitle;
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
