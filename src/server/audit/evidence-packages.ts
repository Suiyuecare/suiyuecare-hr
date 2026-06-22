import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import type { ProductionDatabaseRemediationReport } from "@/server/readiness/production-database-remediation";
import { getAuditLogs, type AuditLogView } from "./queries";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type AuditEvidencePackageView = {
  id: string;
  packageType: AuditEvidencePackageType;
  periodStart: Date;
  periodEnd: Date;
  status: "generated";
  recordCount: number;
  coveredEntityTypes: string[];
  summaryRows: Array<{ entityType: string; count: number; actions: string[] }>;
  warnings: string[];
  contentHash: string;
  generatedAt: Date;
};

export type AuditEvidencePackageType = "labor_inspection" | "production_database_gate";

type AuditEvidenceDemoState = {
  packages: AuditEvidencePackageView[];
};

const requiredLaborInspectionEntities = [
  "employee_lifecycle_event",
  "salary_profile",
  "payroll_export",
  "rule_settings",
  "attendance_policy",
  "leave_policy",
] as const;

const globalForAuditEvidence = globalThis as unknown as {
  hrOneAuditEvidenceDemoState?: AuditEvidenceDemoState;
};

export async function getAuditEvidenceWorkspace(session: SessionLike) {
  assertPermission(session.role, "audit:read");
  const packages = canUseDatabase(session)
    ? await listDbPackages(session).catch(() => getDemoState().packages)
    : getDemoState().packages;
  return {
    packages,
    latest: latestPackageByType(packages, "labor_inspection") ?? packages[0] ?? null,
    latestProductionDatabase: latestPackageByType(packages, "production_database_gate"),
  };
}

export async function generateAuditEvidencePackage(
  session: SessionLike,
  input?: { periodStart?: Date; periodEnd?: Date },
) {
  assertPermission(session.role, "audit:read");
  const period = normalizePeriod(input?.periodStart, input?.periodEnd);
  const logs = await getAuditLogs(session, 500);
  const periodLogs = logs.filter((log) => log.createdAt >= period.periodStart && log.createdAt <= period.periodEnd);
  const draft = buildPackageDraft(periodLogs, period.periodStart, period.periodEnd);

  if (canUseDatabase(session)) {
    try {
      return await createDbPackage(session, draft);
    } catch {
      return createDemoPackage(session, draft);
    }
  }
  return createDemoPackage(session, draft);
}

export async function generateProductionDatabaseEvidencePackage(
  session: SessionLike,
  report: ProductionDatabaseRemediationReport,
) {
  assertPermission(session.role, "audit:read");
  const generatedAt = new Date(report.generatedAt);
  const safeGeneratedAt = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;
  const draft = buildProductionDatabasePackageDraft(report, startOfDate(safeGeneratedAt), endOfDate(safeGeneratedAt));

  if (canUseDatabase(session)) {
    try {
      return await createDbPackage(session, draft);
    } catch {
      return createDemoPackage(session, draft);
    }
  }
  return createDemoPackage(session, draft);
}

export function resetAuditEvidenceDemoState() {
  globalForAuditEvidence.hrOneAuditEvidenceDemoState = {
    packages: [],
  };
}

async function listDbPackages(session: SessionLike & { tenantId: string; companyId: string }) {
  const records = await getDb().auditEvidencePackage.findMany({
    where: { tenantId: session.tenantId, companyId: session.companyId },
    orderBy: { generatedAt: "desc" },
    take: 10,
  });
  return records.map(readPackageRecord);
}

async function createDbPackage(
  session: SessionLike & { tenantId: string; companyId: string },
  draft: AuditEvidencePackageView,
) {
  const record = await getDb().$transaction(async (tx) => {
    const created = await tx.auditEvidencePackage.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        packageType: draft.packageType,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        recordCount: draft.recordCount,
        coveredEntityTypes: draft.coveredEntityTypes,
        summaryJson: draft.summaryRows,
        warningsJson: draft.warnings,
        contentHash: draft.contentHash,
        generatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "audit_evidence_package",
      entityId: created.id,
      before: null,
      after: {
        packageType: draft.packageType,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        recordCount: draft.recordCount,
        contentHash: draft.contentHash,
      },
      metadata: auditMetadata(draft),
    });
    return created;
  });
  return readPackageRecord(record);
}

function createDemoPackage(session: SessionLike, draft: AuditEvidencePackageView) {
  const view = {
    ...draft,
    id: crypto.randomUUID(),
    generatedAt: new Date(),
  };
  getDemoState().packages.unshift(view);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "audit_evidence_package",
    entityId: view.id,
    before: null,
    after: {
      packageType: view.packageType,
      periodStart: view.periodStart,
      periodEnd: view.periodEnd,
      recordCount: view.recordCount,
      contentHash: view.contentHash,
    },
    metadata: auditMetadata(view),
  });
  return view;
}

function buildPackageDraft(logs: AuditLogView[], periodStart: Date, periodEnd: Date): AuditEvidencePackageView {
  const grouped = new Map<string, { count: number; actions: Set<string> }>();
  for (const log of logs) {
    const bucket = grouped.get(log.entityType) ?? { count: 0, actions: new Set<string>() };
    bucket.count += 1;
    bucket.actions.add(log.action);
    grouped.set(log.entityType, bucket);
  }
  const summaryRows = [...grouped.entries()]
    .map(([entityType, value]) => ({
      entityType,
      count: value.count,
      actions: [...value.actions].sort(),
    }))
    .sort((a, b) => a.entityType.localeCompare(b.entityType));
  const coveredEntityTypes = summaryRows.map((row) => row.entityType);
  const warnings = requiredLaborInspectionEntities
    .filter((entityType) => !coveredEntityTypes.includes(entityType))
    .map((entityType) => `No ${entityType} audit evidence in selected period.`);
  const contentHash = stableHash({
    packageType: "labor_inspection",
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    recordCount: logs.length,
    summaryRows,
    warnings,
  });
  return {
    id: "draft",
    packageType: "labor_inspection",
    periodStart,
    periodEnd,
    status: "generated",
    recordCount: logs.length,
    coveredEntityTypes,
    summaryRows,
    warnings,
    contentHash,
    generatedAt: new Date(),
  };
}

function buildProductionDatabasePackageDraft(
  report: ProductionDatabaseRemediationReport,
  periodStart: Date,
  periodEnd: Date,
): AuditEvidencePackageView {
  const gateBlocked = report.gate.checks.filter((check) => !check.passed);
  const launchBlocked = report.launchChecklist.filter((item) => item.status === "blocked");
  const cutoverBlocked = report.vercelCutover.steps.filter((step) => step.status === "blocked");
  const privateSchemaNotChecked = report.privateSchema.status === "not_checked";
  const summaryRows = [
    {
      entityType: "production_database_gate",
      count: report.gate.checks.length,
      actions: [report.status, report.rootCause, `blocked:${gateBlocked.length}`],
    },
    {
      entityType: "supabase_private_schema_rls",
      count: report.privateSchema.checks.length,
      actions: [
        report.privateSchema.status,
        `failed:${report.privateSchema.failedCheckNames.length}`,
        `rlsDisabled:${metricValue(report.privateSchema.metrics.rlsDisabledTableCount)}`,
        `browserGrants:${metricValue(report.privateSchema.metrics.exposedTablePrivilegeCount)}`,
      ],
    },
    {
      entityType: "vercel_production_cutover",
      count: report.vercelCutover.steps.length,
      actions: [report.vercelCutover.status, `blocked:${cutoverBlocked.length}`],
    },
    {
      entityType: "production_launch_checklist",
      count: report.launchChecklist.length,
      actions: [
        `done:${report.launchChecklist.filter((item) => item.status === "done").length}`,
        `blocked:${launchBlocked.length}`,
      ],
    },
  ];
  const warnings = [
    report.status === "ready" ? null : `Production database gate is ${report.status}; root cause ${report.rootCause}.`,
    privateSchemaNotChecked ? "Supabase private schema / RLS verifier has not been attached." : null,
    report.privateSchema.status === "blocked"
      ? `Supabase private schema / RLS verifier failed: ${report.privateSchema.failedCheckNames.join(", ")}.`
      : null,
    gateBlocked.length ? `${gateBlocked.length} live readiness check(s) are blocked.` : null,
    launchBlocked.length ? `${launchBlocked.length} launch checklist item(s) are blocked.` : null,
    cutoverBlocked.length ? `${cutoverBlocked.length} Vercel cutover step(s) are blocked.` : null,
  ].filter((item): item is string => Boolean(item));
  const coveredEntityTypes = summaryRows.map((row) => row.entityType);
  const recordCount =
    report.gate.checks.length +
    report.privateSchema.checks.length +
    report.launchChecklist.length +
    report.vercelCutover.steps.length;
  const contentHash = stableHash({
    packageType: "production_database_gate",
    generatedAt: report.generatedAt,
    status: report.status,
    rootCause: report.rootCause,
    readinessUrl: report.readinessUrl,
    envDraftStatus: report.envDraft?.status ?? "not_attached",
    privateSchemaStatus: report.privateSchema.status,
    privateSchemaMetrics: report.privateSchema.metrics,
    summaryRows,
    warnings,
  });
  return {
    id: "draft",
    packageType: "production_database_gate",
    periodStart,
    periodEnd,
    status: "generated",
    recordCount,
    coveredEntityTypes,
    summaryRows,
    warnings,
    contentHash,
    generatedAt: new Date(),
  };
}

function auditMetadata(draft: AuditEvidencePackageView) {
  return {
    packageType: draft.packageType,
    periodStart: formatDate(draft.periodStart),
    periodEnd: formatDate(draft.periodEnd),
    recordCount: draft.recordCount,
    coveredEntityTypes: draft.coveredEntityTypes,
    warningCount: draft.warnings.length,
    contentHash: draft.contentHash,
    rawAuditPayloadIncluded: false,
    sensitiveValuesRedacted: true,
  };
}

function readPackageRecord(record: {
  id: string;
  packageType: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  recordCount: number;
  coveredEntityTypes: Prisma.JsonValue;
  summaryJson: Prisma.JsonValue;
  warningsJson: Prisma.JsonValue;
  contentHash: string;
  generatedAt: Date;
}): AuditEvidencePackageView {
  return {
    id: record.id,
    packageType: normalizePackageType(record.packageType),
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    status: "generated",
    recordCount: record.recordCount,
    coveredEntityTypes: readStringArray(record.coveredEntityTypes),
    summaryRows: readSummaryRows(record.summaryJson),
    warnings: readStringArray(record.warningsJson),
    contentHash: record.contentHash,
    generatedAt: record.generatedAt,
  };
}

function normalizePackageType(value: string): AuditEvidencePackageType {
  return value === "production_database_gate" ? "production_database_gate" : "labor_inspection";
}

function latestPackageByType(packages: AuditEvidencePackageView[], packageType: AuditEvidencePackageType) {
  return packages.find((item) => item.packageType === packageType) ?? null;
}

function readSummaryRows(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter(isRecord)
    .map((item) => ({
      entityType: typeof item.entityType === "string" ? item.entityType : "unknown",
      count: typeof item.count === "number" ? item.count : 0,
      actions: readStringArray(item.actions as Prisma.JsonValue),
    }));
}

function readStringArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizePeriod(periodStart?: Date, periodEnd?: Date) {
  const now = new Date();
  const start = startOfDate(periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1));
  const end = endOfDate(periodEnd ?? new Date(start.getFullYear(), start.getMonth() + 1, 0));
  return end < start
    ? { periodStart: start, periodEnd: endOfDate(start) }
    : { periodStart: start, periodEnd: end };
}

function startOfDate(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDate(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function metricValue(value: number | null) {
  return value === null ? "not_checked" : String(value);
}

function getDemoState() {
  if (!globalForAuditEvidence.hrOneAuditEvidenceDemoState) {
    resetAuditEvidenceDemoState();
  }
  return globalForAuditEvidence.hrOneAuditEvidenceDemoState!;
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
