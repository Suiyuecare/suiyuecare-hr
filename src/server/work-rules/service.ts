import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, hasPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type WorkRuleStatus = "draft" | "active" | "retired";
export type WorkRuleReviewStatus = "pending_review" | "approved" | "rejected";

export type CompanyWorkRuleView = {
  id: string;
  title: string;
  category: string;
  summary: string;
  version: string;
  status: WorkRuleStatus;
  reviewStatus: WorkRuleReviewStatus;
  sourceRef: string | null;
  contentHash: string;
  acknowledgementRequired: boolean;
  effectiveFrom: Date;
  publishedAt: Date | null;
};

export type EmployeeWorkRuleAcknowledgementView = {
  id: string;
  employeeId: string;
  employeeName: string;
  workRuleId: string;
  workRuleTitle: string;
  version: string;
  acknowledgementHash: string;
  source: string;
  acknowledgedAt: Date;
};

export type WorkRuleReadiness = {
  ready: boolean;
  activeRequiredCount: number;
  requiredAcknowledgementCount: number;
  acknowledgedCount: number;
  pendingReviewCount: number;
  missing: string[];
  detail: string;
};

export type WorkRulesWorkspace = {
  rules: CompanyWorkRuleView[];
  acknowledgements: EmployeeWorkRuleAcknowledgementView[];
  readiness: WorkRuleReadiness;
};

const fallbackEmployees = getFallbackCompanyOverview().company.employees.map((employee) => ({
  id: employee.id,
  displayName: employee.displayName,
}));

type WorkRulesDemoState = {
  rules: CompanyWorkRuleView[];
  acknowledgements: EmployeeWorkRuleAcknowledgementView[];
};

const globalForWorkRules = globalThis as unknown as {
  hrOneWorkRulesDemoState?: WorkRulesDemoState;
};

export async function getWorkRulesWorkspace(session: SessionLike): Promise<WorkRulesWorkspace> {
  assertWorkRuleRead(session);
  if (canUseDatabase(session)) {
    try {
      return getDbWorkRulesWorkspace(session);
    } catch {
      return getDemoWorkRulesWorkspace(session);
    }
  }
  return getDemoWorkRulesWorkspace(session);
}

export async function saveCompanyWorkRule(
  session: SessionLike,
  input: Partial<CompanyWorkRuleView> & { id?: string | null; content?: string | null },
) {
  assertPermission(session.role, "work_rule:manage");
  const normalized = normalizeRule(input);
  if (canUseDatabase(session)) {
    try {
      return saveDbWorkRule(session, input.id ?? null, normalized);
    } catch {
      return saveDemoWorkRule(session, input.id ?? null, normalized);
    }
  }
  return saveDemoWorkRule(session, input.id ?? null, normalized);
}

export async function acknowledgeCompanyWorkRule(session: SessionLike, workRuleId: string) {
  assertPermission(session.role, "work_rule:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  if (canUseDatabase(session)) {
    try {
      return acknowledgeDbWorkRule(session, workRuleId);
    } catch {
      return acknowledgeDemoWorkRule(session, workRuleId);
    }
  }
  return acknowledgeDemoWorkRule(session, workRuleId);
}

export function evaluateWorkRuleReadiness(input: {
  rules: CompanyWorkRuleView[];
  acknowledgements: EmployeeWorkRuleAcknowledgementView[];
  activeEmployeeCount: number;
  activeEmployeeIds?: string[];
}): WorkRuleReadiness {
  const activeRequiredRules = input.rules.filter(
    (rule) => rule.status === "active" && rule.acknowledgementRequired,
  );
  const pendingReviewCount = input.rules.filter((rule) => rule.reviewStatus !== "approved").length;
  const activeEmployeeIds = input.activeEmployeeIds ?? fallbackEmployees.slice(0, input.activeEmployeeCount).map((employee) => employee.id);
  const requiredPairs = new Set<string>();
  for (const rule of activeRequiredRules) {
    for (const employeeId of activeEmployeeIds) {
      requiredPairs.add(`${employeeId}:${rule.id}`);
    }
  }
  const acknowledgedPairs = new Set(
    input.acknowledgements
      .filter((ack) => activeRequiredRules.some((rule) => rule.id === ack.workRuleId && rule.version === ack.version))
      .map((ack) => `${ack.employeeId}:${ack.workRuleId}`),
  );
  const acknowledgedCount = [...acknowledgedPairs].filter((pair) => requiredPairs.has(pair)).length;
  const requiredAcknowledgementCount = activeRequiredRules.length * input.activeEmployeeCount;
  const missing = [
    activeRequiredRules.length === 0 ? "active company work rules or employee handbook" : null,
    pendingReviewCount > 0 ? "HR/legal review approval for all work rules" : null,
    acknowledgedCount < requiredAcknowledgementCount ? "employee acknowledgement coverage" : null,
  ].filter(Boolean) as string[];

  return {
    ready: missing.length === 0,
    activeRequiredCount: activeRequiredRules.length,
    requiredAcknowledgementCount,
    acknowledgedCount,
    pendingReviewCount,
    missing,
    detail: `${activeRequiredRules.length} active required rule(s); ${acknowledgedCount}/${requiredAcknowledgementCount} acknowledgement(s); ${pendingReviewCount} pending review.`,
  };
}

export function resetWorkRulesDemoState() {
  const rule: CompanyWorkRuleView = {
    id: "demo-work-rule-handbook",
    title: "Employee handbook and work rules",
    category: "Company rules",
    summary:
      "Covers attendance, leave, overtime approval, payroll close evidence, information security, and respectful workplace expectations.",
    version: "2026.01",
    status: "active",
    reviewStatus: "approved",
    sourceRef: "demo://work-rules/employee-handbook-2026",
    contentHash: stableHash("demo-work-rules-2026.01"),
    acknowledgementRequired: true,
    effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
    publishedAt: new Date("2026-06-01T00:00:00.000Z"),
  };
  globalForWorkRules.hrOneWorkRulesDemoState = {
    rules: [rule],
    acknowledgements: fallbackEmployees.map((employee, index) => ({
      id: `demo-work-rule-ack-${index + 1}`,
      employeeId: employee.id,
      employeeName: employee.displayName,
      workRuleId: rule.id,
      workRuleTitle: rule.title,
      version: rule.version,
      acknowledgementHash: stableHash(`${employee.id}:${rule.id}:${rule.version}`),
      source: "seed",
      acknowledgedAt: new Date("2026-06-01T01:00:00.000Z"),
    })),
  };
}

async function getDbWorkRulesWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const [employeeRows, ruleRows, acknowledgementRows] = await Promise.all([
    getDb().employee.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId, employmentStatus: "active" },
      select: { id: true },
      orderBy: { employeeNo: "asc" },
    }),
    getDb().companyWorkRule.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId },
      orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
    }),
    getDb().employeeWorkRuleAcknowledgement.findMany({
      where: selfScopedWhere(session),
      include: {
        employee: { select: { displayName: true } },
        workRule: { select: { title: true } },
      },
      orderBy: { acknowledgedAt: "desc" },
    }),
  ]);
  const rules = ruleRows.map(readRuleRecord);
  const acknowledgements = acknowledgementRows.map(readAcknowledgementRecord);
  return {
    rules,
    acknowledgements,
    readiness: evaluateWorkRuleReadiness({
      rules,
      acknowledgements: await getAllDbAcknowledgementsForReadiness(session),
      activeEmployeeCount: employeeRows.length,
      activeEmployeeIds: employeeRows.map((employee) => employee.id),
    }),
  };
}

async function getAllDbAcknowledgementsForReadiness(session: SessionLike & { tenantId: string; companyId: string }) {
  const rows = await getDb().employeeWorkRuleAcknowledgement.findMany({
    where: { tenantId: session.tenantId, companyId: session.companyId },
    include: {
      employee: { select: { displayName: true } },
      workRule: { select: { title: true } },
    },
  });
  return rows.map(readAcknowledgementRecord);
}

async function saveDbWorkRule(
  session: SessionLike & { tenantId: string; companyId: string },
  ruleId: string | null,
  input: Omit<CompanyWorkRuleView, "id" | "publishedAt">,
) {
  const rule = await getDb().$transaction(async (tx) => {
    const before = ruleId
      ? await tx.companyWorkRule.findFirst({
          where: { id: ruleId, tenantId: session.tenantId, companyId: session.companyId },
        })
      : null;
    const publishedAt = input.status === "active" ? before?.publishedAt ?? new Date() : null;
    const record = before
      ? await tx.companyWorkRule.update({
          where: { id: before.id },
          data: { ...input, publishedAt, updatedByUserId: session.user?.id },
        })
      : await tx.companyWorkRule.create({
          data: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            ...input,
            publishedAt,
            createdByUserId: session.user?.id,
            updatedByUserId: session.user?.id,
          },
        });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "company_work_rule",
      entityId: record.id,
      before: before ? workRuleAuditPayload(readRuleRecord(before)) : undefined,
      after: workRuleAuditPayload(readRuleRecord(record)),
      metadata: workRuleAuditMetadata(readRuleRecord(record)),
    });
    return record;
  });
  return readRuleRecord(rule);
}

async function acknowledgeDbWorkRule(
  session: SessionLike & { tenantId: string; companyId: string },
  workRuleId: string,
) {
  const acknowledgement = await getDb().$transaction(async (tx) => {
    const rule = await tx.companyWorkRule.findFirstOrThrow({
      where: {
        id: workRuleId,
        tenantId: session.tenantId,
        companyId: session.companyId,
        status: "active",
        acknowledgementRequired: true,
      },
    });
    const acknowledgementHash = stableHash(`${session.employee!.id}:${rule.id}:${rule.version}:${rule.contentHash}`);
    const record = await tx.employeeWorkRuleAcknowledgement.upsert({
      where: { employeeId_workRuleId: { employeeId: session.employee!.id, workRuleId: rule.id } },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: session.employee!.id,
        workRuleId: rule.id,
        version: rule.version,
        acknowledgementHash,
        source: "employee_self_service",
      },
      update: {
        version: rule.version,
        acknowledgementHash,
        source: "employee_self_service",
        acknowledgedAt: new Date(),
      },
      include: {
        employee: { select: { displayName: true } },
        workRule: { select: { title: true } },
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "approve",
      entityType: "employee_work_rule_acknowledgement",
      entityId: record.id,
      after: {
        workRuleId: rule.id,
        version: rule.version,
        acknowledgementHash,
      },
      metadata: {
        workRuleId: rule.id,
        workRuleVersion: rule.version,
        acknowledgementHash,
        rawWorkRuleContentIncluded: false,
      },
    });
    return record;
  });
  return readAcknowledgementRecord(acknowledgement);
}

function getDemoWorkRulesWorkspace(session: SessionLike): WorkRulesWorkspace {
  const state = getDemoState();
  const acknowledgements = selfScopeList(session, state.acknowledgements, (item) => item.employeeId);
  return {
    rules: state.rules,
    acknowledgements,
    readiness: evaluateWorkRuleReadiness({
      rules: state.rules,
      acknowledgements: state.acknowledgements,
      activeEmployeeCount: fallbackEmployees.length,
    }),
  };
}

function saveDemoWorkRule(
  session: SessionLike,
  ruleId: string | null,
  input: Omit<CompanyWorkRuleView, "id" | "publishedAt">,
) {
  const state = getDemoState();
  const index = ruleId ? state.rules.findIndex((rule) => rule.id === ruleId) : -1;
  const before = index >= 0 ? state.rules[index] : null;
  const rule: CompanyWorkRuleView = {
    ...input,
    id: before?.id ?? crypto.randomUUID(),
    publishedAt: input.status === "active" ? before?.publishedAt ?? new Date() : null,
  };
  if (index >= 0) state.rules[index] = rule;
  else state.rules.unshift(rule);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: before ? "update" : "create",
    entityType: "company_work_rule",
    entityId: rule.id,
    before: before ? workRuleAuditPayload(before) : undefined,
    after: workRuleAuditPayload(rule),
    metadata: workRuleAuditMetadata(rule),
  });
  return rule;
}

function acknowledgeDemoWorkRule(session: SessionLike, workRuleId: string) {
  const state = getDemoState();
  const rule = state.rules.find((item) => item.id === workRuleId && item.status === "active" && item.acknowledgementRequired);
  if (!rule) throw new Error("Active work rule not found.");
  const employee = session.employee;
  if (!employee?.id) throw new Error("Employee context is required.");
  const acknowledgementHash = stableHash(`${employee.id}:${rule.id}:${rule.version}:${rule.contentHash}`);
  const existingIndex = state.acknowledgements.findIndex(
    (item) => item.employeeId === employee.id && item.workRuleId === rule.id,
  );
  const acknowledgement: EmployeeWorkRuleAcknowledgementView = {
    id: existingIndex >= 0 ? state.acknowledgements[existingIndex].id : crypto.randomUUID(),
    employeeId: employee.id,
    employeeName: employee.displayName,
    workRuleId: rule.id,
    workRuleTitle: rule.title,
    version: rule.version,
    acknowledgementHash,
    source: "employee_self_service",
    acknowledgedAt: new Date(),
  };
  if (existingIndex >= 0) state.acknowledgements[existingIndex] = acknowledgement;
  else state.acknowledgements.unshift(acknowledgement);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: employee.id,
    actorName: employee.displayName,
    action: "approve",
    entityType: "employee_work_rule_acknowledgement",
    entityId: acknowledgement.id,
    after: {
      workRuleId: rule.id,
      version: rule.version,
      acknowledgementHash,
    },
    metadata: {
      workRuleId: rule.id,
      workRuleVersion: rule.version,
      acknowledgementHash,
      rawWorkRuleContentIncluded: false,
    },
  });
  return acknowledgement;
}

function readRuleRecord(record: {
  id: string;
  title: string;
  category: string;
  summary: string;
  version: string;
  status: string;
  reviewStatus: string;
  sourceRef: string | null;
  contentHash: string;
  acknowledgementRequired: boolean;
  effectiveFrom: Date;
  publishedAt: Date | null;
}): CompanyWorkRuleView {
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    summary: record.summary,
    version: record.version,
    status: normalizeStatus(record.status),
    reviewStatus: normalizeReviewStatus(record.reviewStatus),
    sourceRef: record.sourceRef,
    contentHash: record.contentHash,
    acknowledgementRequired: record.acknowledgementRequired,
    effectiveFrom: record.effectiveFrom,
    publishedAt: record.publishedAt,
  };
}

function readAcknowledgementRecord(record: {
  id: string;
  employeeId: string;
  employee: { displayName: string };
  workRuleId: string;
  workRule: { title: string };
  version: string;
  acknowledgementHash: string;
  source: string;
  acknowledgedAt: Date;
}): EmployeeWorkRuleAcknowledgementView {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employee.displayName,
    workRuleId: record.workRuleId,
    workRuleTitle: record.workRule.title,
    version: record.version,
    acknowledgementHash: record.acknowledgementHash,
    source: record.source,
    acknowledgedAt: record.acknowledgedAt,
  };
}

function normalizeRule(input: Partial<CompanyWorkRuleView> & { content?: string | null }): Omit<CompanyWorkRuleView, "id" | "publishedAt"> {
  const version = cleanText(input.version, 40) || "2026.01";
  const contentHash = input.contentHash || stableHash(cleanText(input.content, 4000) || `${input.title}:${version}`);
  return {
    title: cleanText(input.title, 120) || "Employee handbook and work rules",
    category: cleanText(input.category, 80) || "Company rules",
    summary: cleanText(input.summary, 1000) || "Company work rules requiring employee acknowledgement.",
    version,
    status: normalizeStatus(input.status),
    reviewStatus: normalizeReviewStatus(input.reviewStatus),
    sourceRef: cleanText(input.sourceRef, 240) || null,
    contentHash,
    acknowledgementRequired: input.acknowledgementRequired ?? true,
    effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
  };
}

function workRuleAuditPayload(rule: CompanyWorkRuleView) {
  return {
    titleHash: stableHash(rule.title),
    category: rule.category,
    version: rule.version,
    status: rule.status,
    reviewStatus: rule.reviewStatus,
    acknowledgementRequired: rule.acknowledgementRequired,
    contentHash: rule.contentHash,
  };
}

function workRuleAuditMetadata(rule: CompanyWorkRuleView) {
  return {
    titleHash: stableHash(rule.title),
    category: rule.category,
    version: rule.version,
    status: rule.status,
    reviewStatus: rule.reviewStatus,
    sourceConfigured: Boolean(rule.sourceRef),
    acknowledgementRequired: rule.acknowledgementRequired,
    rawWorkRuleContentIncluded: false,
  };
}

function assertWorkRuleRead(session: SessionLike) {
  if (hasPermission(session.role, "work_rule:manage") || hasPermission(session.role, "work_rule:self")) return;
  throw new Error(`Role ${session.role} cannot work_rule:read`);
}

function selfScopedWhere(session: SessionLike & { tenantId: string; companyId: string }) {
  return {
    tenantId: session.tenantId,
    companyId: session.companyId,
    ...(hasPermission(session.role, "work_rule:manage") ? {} : { employeeId: session.employee?.id ?? "__missing__" }),
  };
}

function selfScopeList<T>(session: SessionLike, rows: T[], employeeId: (row: T) => string) {
  if (hasPermission(session.role, "work_rule:manage")) return rows;
  return rows.filter((row) => employeeId(row) === session.employee?.id);
}

function getDemoState() {
  if (!globalForWorkRules.hrOneWorkRulesDemoState) resetWorkRulesDemoState();
  return globalForWorkRules.hrOneWorkRulesDemoState!;
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}

function normalizeStatus(value: unknown): WorkRuleStatus {
  return value === "draft" || value === "retired" || value === "active" ? value : "draft";
}

function normalizeReviewStatus(value: unknown): WorkRuleReviewStatus {
  return value === "approved" || value === "rejected" || value === "pending_review" ? value : "pending_review";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}
