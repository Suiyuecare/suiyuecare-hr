import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, hasPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type IncidentVerificationStatus = "unverified" | "verified" | "failed";
export type IncidentType = "occupational_accident" | "near_miss" | "safety_hazard" | "harassment" | "workplace_violence";
export type IncidentSeverity = "low" | "medium" | "high" | "severe";
export type IncidentStatus = "submitted" | "in_review" | "authority_reported" | "corrective_action" | "closed" | "rejected";

export type CompanyIncidentSettings = {
  reportingEnabled: boolean;
  anonymousReportingEnabled: boolean;
  severeIncidentNotifyHours: number;
  investigationTargetDays: number;
  harassmentPolicyVersion: string;
  safetyPolicyVersion: string;
  authorityReportRequired: boolean;
  verificationStatus: IncidentVerificationStatus;
  lastReviewedAt: Date | null;
};

export type WorkplaceIncidentView = {
  id: string;
  reporterEmployeeId: string | null;
  reporterName: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurredAt: Date;
  summary: string;
  location: string | null;
  confidential: boolean;
  authorityReportNeeded: boolean;
  authorityReportDueAt: Date | null;
  authorityReportedAt: Date | null;
  investigationDueAt: Date;
  closedAt: Date | null;
  correctiveAction: string | null;
  createdAt: Date;
};

export type IncidentReadiness = {
  ready: boolean;
  openIncidentCount: number;
  overdueInvestigationCount: number;
  overdueAuthorityReportCount: number;
  missing: string[];
  detail: string;
};

export type IncidentWorkspace = {
  settings: CompanyIncidentSettings;
  incidents: WorkplaceIncidentView[];
  readiness: IncidentReadiness;
};

const defaultIncidentSettings: CompanyIncidentSettings = {
  reportingEnabled: true,
  anonymousReportingEnabled: false,
  severeIncidentNotifyHours: 8,
  investigationTargetDays: 7,
  harassmentPolicyVersion: "2026.01",
  safetyPolicyVersion: "2026.01",
  authorityReportRequired: true,
  verificationStatus: "unverified",
  lastReviewedAt: null,
};

type IncidentDemoState = {
  settings: CompanyIncidentSettings;
  incidents: WorkplaceIncidentView[];
};

const globalForIncidents = globalThis as unknown as {
  hrOneIncidentDemoState?: IncidentDemoState;
};

export async function getIncidentWorkspace(session: SessionLike): Promise<IncidentWorkspace> {
  assertIncidentRead(session);
  if (canUseDatabase(session)) {
    try {
      return getDbIncidentWorkspace(session as SessionLike & { tenantId: string; companyId: string });
    } catch {
      return getDemoIncidentWorkspace(session);
    }
  }
  return getDemoIncidentWorkspace(session);
}

export async function updateIncidentSettings(session: SessionLike, input: Partial<CompanyIncidentSettings>) {
  assertPermission(session.role, "incident:manage");
  const before = (await getIncidentWorkspace({ ...session, role: "owner" })).settings;
  const normalized = normalizeSettings(input, before);
  if (canUseDatabase(session)) {
    try {
      return updateDbIncidentSettings(session as SessionLike & { tenantId: string; companyId: string }, before, normalized);
    } catch {
      return updateDemoIncidentSettings(session, before, normalized);
    }
  }
  return updateDemoIncidentSettings(session, before, normalized);
}

export async function reportWorkplaceIncident(
  session: SessionLike,
  input: {
    incidentType: IncidentType;
    severity: IncidentSeverity;
    occurredAt: Date;
    summary: string;
    location?: string | null;
    confidential?: boolean;
  },
) {
  assertPermission(session.role, "incident:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  const settings = (await getIncidentWorkspace({ ...session, role: "employee" })).settings;
  if (!settings.reportingEnabled) throw new Error("Workplace incident reporting is not enabled.");
  const normalized = normalizeIncidentInput(input, settings);
  if (canUseDatabase(session)) {
    try {
      return createDbIncident(session as SessionLike & { tenantId: string; companyId: string }, normalized);
    } catch {
      return createDemoIncident(session, normalized);
    }
  }
  return createDemoIncident(session, normalized);
}

export async function updateWorkplaceIncident(
  session: SessionLike,
  input: { incidentId: string; status: IncidentStatus; correctiveAction?: string | null; authorityReported?: boolean },
) {
  assertPermission(session.role, "incident:manage");
  const status = normalizeStatus(input.status);
  const correctiveAction = cleanText(input.correctiveAction, 800) || null;
  if (canUseDatabase(session)) {
    try {
      return updateDbIncident(session as SessionLike & { tenantId: string; companyId: string }, {
        incidentId: input.incidentId,
        status,
        correctiveAction,
        authorityReported: Boolean(input.authorityReported),
      });
    } catch {
      return updateDemoIncident(session, {
        incidentId: input.incidentId,
        status,
        correctiveAction,
        authorityReported: Boolean(input.authorityReported),
      });
    }
  }
  return updateDemoIncident(session, {
    incidentId: input.incidentId,
    status,
    correctiveAction,
    authorityReported: Boolean(input.authorityReported),
  });
}

export function evaluateIncidentReadiness(input: {
  settings: CompanyIncidentSettings;
  incidents: WorkplaceIncidentView[];
  now?: Date;
}): IncidentReadiness {
  const now = input.now ?? new Date();
  const openIncidents = input.incidents.filter((incident) => !["closed", "rejected"].includes(incident.status));
  const overdueInvestigations = openIncidents.filter((incident) => incident.investigationDueAt.getTime() < now.getTime());
  const overdueAuthorityReports = openIncidents.filter((incident) =>
    incident.authorityReportNeeded &&
    !incident.authorityReportedAt &&
    incident.authorityReportDueAt &&
    incident.authorityReportDueAt.getTime() < now.getTime(),
  );
  const missing = [
    !input.settings.reportingEnabled ? "employee incident reporting enabled" : null,
    input.settings.verificationStatus !== "verified" ? "incident response policy HR/legal review" : null,
    input.settings.authorityReportRequired && input.settings.severeIncidentNotifyHours > 8
      ? "8-hour severe incident notification target"
      : null,
    overdueInvestigations.length > 0 ? "overdue incident investigations" : null,
    overdueAuthorityReports.length > 0 ? "overdue authority report follow-up" : null,
  ].filter(Boolean) as string[];
  return {
    ready: missing.length === 0,
    openIncidentCount: openIncidents.length,
    overdueInvestigationCount: overdueInvestigations.length,
    overdueAuthorityReportCount: overdueAuthorityReports.length,
    missing,
    detail: `${openIncidents.length} open incident(s); ${overdueInvestigations.length} overdue investigation(s); ${overdueAuthorityReports.length} overdue authority report(s); review ${input.settings.verificationStatus}.`,
  };
}

export function resetIncidentDemoState() {
  globalForIncidents.hrOneIncidentDemoState = {
    settings: { ...defaultIncidentSettings },
    incidents: [],
  };
}

async function getDbIncidentWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const db = getDb();
  const [settingsRecord, incidentRows] = await Promise.all([
    db.companyIncidentSetting.findUnique({ where: { companyId: session.companyId } }),
    db.workplaceIncident.findMany({
      where: selfScopedWhere(session),
      include: { reporterEmployee: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const settings = settingsRecord ? readSettingsRecord(settingsRecord) : defaultIncidentSettings;
  const incidents = incidentRows.map(readIncidentRecord);
  return {
    settings,
    incidents,
    readiness: evaluateIncidentReadiness({ settings, incidents }),
  };
}

async function updateDbIncidentSettings(
  session: SessionLike & { tenantId: string; companyId: string },
  before: CompanyIncidentSettings,
  after: CompanyIncidentSettings,
) {
  const record = await getDb().$transaction(async (tx) => {
    const updated = await tx.companyIncidentSetting.upsert({
      where: { companyId: session.companyId },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        ...writeSettingsRecord(after),
        updatedByUserId: session.user?.id,
      },
      update: {
        ...writeSettingsRecord(after),
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "incident_settings",
      entityId: updated.id,
      before,
      after,
      metadata: settingsAuditMetadata(before, after),
    });
    return updated;
  });
  return readSettingsRecord(record);
}

async function createDbIncident(
  session: SessionLike & { tenantId: string; companyId: string },
  input: NormalizedIncidentInput,
) {
  const incident = await getDb().$transaction(async (tx) => {
    const record = await tx.workplaceIncident.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        reporterEmployeeId: session.employee?.id,
        incidentType: input.incidentType,
        severity: input.severity,
        occurredAt: input.occurredAt,
        summary: input.summary,
        location: input.location,
        confidential: input.confidential,
        authorityReportNeeded: input.authorityReportNeeded,
        authorityReportDueAt: input.authorityReportDueAt,
        investigationDueAt: input.investigationDueAt,
        reportedByUserId: session.user?.id,
        metadataJson: incidentMetadata(input) as object,
      },
      include: { reporterEmployee: { select: { displayName: true } } },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "workplace_incident",
      entityId: record.id,
      after: incidentAuditPayload(readIncidentRecord(record)),
      metadata: incidentMetadata(input),
    });
    return record;
  });
  return readIncidentRecord(incident);
}

async function updateDbIncident(
  session: SessionLike & { tenantId: string; companyId: string },
  input: { incidentId: string; status: IncidentStatus; correctiveAction: string | null; authorityReported: boolean },
) {
  const incident = await getDb().$transaction(async (tx) => {
    const before = await tx.workplaceIncident.findFirstOrThrow({
      where: { id: input.incidentId, tenantId: session.tenantId, companyId: session.companyId },
    });
    const authorityReportedAt = input.authorityReported ? new Date() : before.authorityReportedAt;
    const closedAt = input.status === "closed" || input.status === "rejected" ? new Date() : null;
    const updated = await tx.workplaceIncident.update({
      where: { id: before.id },
      data: {
        status: input.status,
        correctiveAction: input.correctiveAction,
        assignedToUserId: session.user?.id,
        authorityReportedAt,
        closedAt,
      },
      include: { reporterEmployee: { select: { displayName: true } } },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: input.status === "rejected" ? "reject" : "update",
      entityType: "workplace_incident",
      entityId: updated.id,
      before: { status: before.status },
      after: incidentAuditPayload(readIncidentRecord(updated)),
      metadata: {
        incidentType: updated.incidentType,
        severity: updated.severity,
        status: updated.status,
        authorityReported: Boolean(updated.authorityReportedAt),
        correctiveActionHash: input.correctiveAction ? stableHash(input.correctiveAction) : null,
        rawIncidentSummaryIncluded: false,
      },
    });
    return updated;
  });
  return readIncidentRecord(incident);
}

function getDemoIncidentWorkspace(session: SessionLike): IncidentWorkspace {
  const state = getDemoState();
  const incidents = selfScopeList(session, state.incidents, (item) => item.reporterEmployeeId);
  return {
    settings: state.settings,
    incidents,
    readiness: evaluateIncidentReadiness({ settings: state.settings, incidents: state.incidents }),
  };
}

function updateDemoIncidentSettings(
  session: SessionLike,
  before: CompanyIncidentSettings,
  after: CompanyIncidentSettings,
) {
  getDemoState().settings = { ...after };
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "incident_settings",
    entityId: "demo-incident-settings",
    before,
    after,
    metadata: settingsAuditMetadata(before, after),
  });
  return after;
}

function createDemoIncident(session: SessionLike, input: NormalizedIncidentInput) {
  const incident: WorkplaceIncidentView = {
    id: crypto.randomUUID(),
    reporterEmployeeId: session.employee?.id ?? null,
    reporterName: session.employee?.displayName ?? "Employee",
    incidentType: input.incidentType,
    severity: input.severity,
    status: "submitted",
    occurredAt: input.occurredAt,
    summary: input.summary,
    location: input.location,
    confidential: input.confidential,
    authorityReportNeeded: input.authorityReportNeeded,
    authorityReportDueAt: input.authorityReportDueAt,
    authorityReportedAt: null,
    investigationDueAt: input.investigationDueAt,
    closedAt: null,
    correctiveAction: null,
    createdAt: new Date(),
  };
  getDemoState().incidents.unshift(incident);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName,
    action: "create",
    entityType: "workplace_incident",
    entityId: incident.id,
    after: incidentAuditPayload(incident),
    metadata: incidentMetadata(input),
  });
  return incident;
}

function updateDemoIncident(
  session: SessionLike,
  input: { incidentId: string; status: IncidentStatus; correctiveAction: string | null; authorityReported: boolean },
) {
  const state = getDemoState();
  const index = state.incidents.findIndex((incident) => incident.id === input.incidentId);
  if (index < 0) throw new Error("Workplace incident not found.");
  const before = state.incidents[index];
  const updated: WorkplaceIncidentView = {
    ...before,
    status: input.status,
    correctiveAction: input.correctiveAction,
    authorityReportedAt: input.authorityReported ? new Date() : before.authorityReportedAt,
    closedAt: input.status === "closed" || input.status === "rejected" ? new Date() : null,
  };
  state.incidents[index] = updated;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: input.status === "rejected" ? "reject" : "update",
    entityType: "workplace_incident",
    entityId: updated.id,
    before: { status: before.status },
    after: incidentAuditPayload(updated),
    metadata: {
      incidentType: updated.incidentType,
      severity: updated.severity,
      status: updated.status,
      authorityReported: Boolean(updated.authorityReportedAt),
      correctiveActionHash: input.correctiveAction ? stableHash(input.correctiveAction) : null,
      rawIncidentSummaryIncluded: false,
    },
  });
  return updated;
}

type NormalizedIncidentInput = {
  incidentType: IncidentType;
  severity: IncidentSeverity;
  occurredAt: Date;
  summary: string;
  location: string | null;
  confidential: boolean;
  authorityReportNeeded: boolean;
  authorityReportDueAt: Date | null;
  investigationDueAt: Date;
};

function normalizeIncidentInput(
  input: {
    incidentType: IncidentType;
    severity: IncidentSeverity;
    occurredAt: Date;
    summary: string;
    location?: string | null;
    confidential?: boolean;
  },
  settings: CompanyIncidentSettings,
): NormalizedIncidentInput {
  const occurredAt = Number.isNaN(input.occurredAt.getTime()) ? new Date() : input.occurredAt;
  const severity = normalizeSeverity(input.severity);
  const incidentType = normalizeType(input.incidentType);
  const summary = cleanText(input.summary, 1000);
  if (!summary) throw new Error("Incident summary is required.");
  const authorityReportNeeded = settings.authorityReportRequired &&
    (severity === "severe" || incidentType === "occupational_accident");
  return {
    incidentType,
    severity,
    occurredAt,
    summary,
    location: cleanText(input.location, 160) || null,
    confidential: input.confidential ?? true,
    authorityReportNeeded,
    authorityReportDueAt: authorityReportNeeded ? addHours(occurredAt, settings.severeIncidentNotifyHours) : null,
    investigationDueAt: addDays(new Date(), settings.investigationTargetDays),
  };
}

function evaluateSettingsStatus(value: unknown, fallback: IncidentVerificationStatus): IncidentVerificationStatus {
  return value === "verified" || value === "failed" || value === "unverified" ? value : fallback;
}

function normalizeSettings(input: Partial<CompanyIncidentSettings>, before: CompanyIncidentSettings): CompanyIncidentSettings {
  const verificationStatus = evaluateSettingsStatus(input.verificationStatus, before.verificationStatus);
  return {
    reportingEnabled: input.reportingEnabled ?? before.reportingEnabled,
    anonymousReportingEnabled: input.anonymousReportingEnabled ?? before.anonymousReportingEnabled,
    severeIncidentNotifyHours: clampInteger(input.severeIncidentNotifyHours, before.severeIncidentNotifyHours, 1, 24),
    investigationTargetDays: clampInteger(input.investigationTargetDays, before.investigationTargetDays, 1, 30),
    harassmentPolicyVersion: cleanText(input.harassmentPolicyVersion, 40) || before.harassmentPolicyVersion,
    safetyPolicyVersion: cleanText(input.safetyPolicyVersion, 40) || before.safetyPolicyVersion,
    authorityReportRequired: input.authorityReportRequired ?? before.authorityReportRequired,
    verificationStatus,
    lastReviewedAt: verificationStatus === "verified" ? input.lastReviewedAt ?? before.lastReviewedAt ?? new Date() : null,
  };
}

function readSettingsRecord(record: {
  reportingEnabled: boolean;
  anonymousReportingEnabled: boolean;
  severeIncidentNotifyHours: number;
  investigationTargetDays: number;
  harassmentPolicyVersion: string;
  safetyPolicyVersion: string;
  authorityReportRequired: boolean;
  verificationStatus: string;
  lastReviewedAt: Date | null;
}): CompanyIncidentSettings {
  return {
    reportingEnabled: record.reportingEnabled,
    anonymousReportingEnabled: record.anonymousReportingEnabled,
    severeIncidentNotifyHours: record.severeIncidentNotifyHours,
    investigationTargetDays: record.investigationTargetDays,
    harassmentPolicyVersion: record.harassmentPolicyVersion,
    safetyPolicyVersion: record.safetyPolicyVersion,
    authorityReportRequired: record.authorityReportRequired,
    verificationStatus: evaluateSettingsStatus(record.verificationStatus, "unverified"),
    lastReviewedAt: record.lastReviewedAt,
  };
}

function writeSettingsRecord(settings: CompanyIncidentSettings) {
  return {
    reportingEnabled: settings.reportingEnabled,
    anonymousReportingEnabled: settings.anonymousReportingEnabled,
    severeIncidentNotifyHours: settings.severeIncidentNotifyHours,
    investigationTargetDays: settings.investigationTargetDays,
    harassmentPolicyVersion: settings.harassmentPolicyVersion,
    safetyPolicyVersion: settings.safetyPolicyVersion,
    authorityReportRequired: settings.authorityReportRequired,
    verificationStatus: settings.verificationStatus,
    lastReviewedAt: settings.verificationStatus === "verified" ? settings.lastReviewedAt ?? new Date() : null,
  };
}

function readIncidentRecord(record: {
  id: string;
  reporterEmployeeId: string | null;
  reporterEmployee: { displayName: string } | null;
  incidentType: string;
  severity: string;
  status: string;
  occurredAt: Date;
  summary: string;
  location: string | null;
  confidential: boolean;
  authorityReportNeeded: boolean;
  authorityReportDueAt: Date | null;
  authorityReportedAt: Date | null;
  investigationDueAt: Date;
  closedAt: Date | null;
  correctiveAction: string | null;
  createdAt: Date;
}): WorkplaceIncidentView {
  return {
    id: record.id,
    reporterEmployeeId: record.reporterEmployeeId,
    reporterName: record.reporterEmployee?.displayName ?? "Confidential",
    incidentType: normalizeType(record.incidentType),
    severity: normalizeSeverity(record.severity),
    status: normalizeStatus(record.status),
    occurredAt: record.occurredAt,
    summary: record.summary,
    location: record.location,
    confidential: record.confidential,
    authorityReportNeeded: record.authorityReportNeeded,
    authorityReportDueAt: record.authorityReportDueAt,
    authorityReportedAt: record.authorityReportedAt,
    investigationDueAt: record.investigationDueAt,
    closedAt: record.closedAt,
    correctiveAction: record.correctiveAction,
    createdAt: record.createdAt,
  };
}

function assertIncidentRead(session: SessionLike) {
  if (hasPermission(session.role, "incident:manage") || hasPermission(session.role, "incident:self")) return;
  throw new Error(`Role ${session.role} cannot incident:read`);
}

function selfScopedWhere(session: SessionLike & { tenantId: string; companyId: string }) {
  return {
    tenantId: session.tenantId,
    companyId: session.companyId,
    ...(hasPermission(session.role, "incident:manage") ? {} : { reporterEmployeeId: session.employee?.id ?? "__missing__" }),
  };
}

function selfScopeList<T>(session: SessionLike, rows: T[], employeeId: (row: T) => string | null) {
  if (hasPermission(session.role, "incident:manage")) return rows;
  return rows.filter((row) => employeeId(row) === session.employee?.id);
}

function settingsAuditMetadata(before: CompanyIncidentSettings, after: CompanyIncidentSettings) {
  return {
    changedFields: changedFields(before, after),
    reportingEnabled: after.reportingEnabled,
    severeIncidentNotifyHours: after.severeIncidentNotifyHours,
    investigationTargetDays: after.investigationTargetDays,
    harassmentPolicyVersion: after.harassmentPolicyVersion,
    safetyPolicyVersion: after.safetyPolicyVersion,
    authorityReportRequired: after.authorityReportRequired,
    verificationStatus: after.verificationStatus,
  };
}

function incidentMetadata(input: NormalizedIncidentInput) {
  return {
    incidentType: input.incidentType,
    severity: input.severity,
    summaryHash: stableHash(input.summary),
    locationHash: input.location ? stableHash(input.location) : null,
    authorityReportNeeded: input.authorityReportNeeded,
    authorityReportDueAt: input.authorityReportDueAt?.toISOString() ?? null,
    investigationDueAt: input.investigationDueAt.toISOString(),
    confidential: input.confidential,
    rawIncidentSummaryIncluded: false,
  };
}

function incidentAuditPayload(incident: WorkplaceIncidentView) {
  return {
    incidentType: incident.incidentType,
    severity: incident.severity,
    status: incident.status,
    authorityReportNeeded: incident.authorityReportNeeded,
    authorityReported: Boolean(incident.authorityReportedAt),
    summaryHash: stableHash(incident.summary),
  };
}

function normalizeType(value: unknown): IncidentType {
  if (
    value === "occupational_accident" ||
    value === "near_miss" ||
    value === "safety_hazard" ||
    value === "harassment" ||
    value === "workplace_violence"
  ) return value;
  return "safety_hazard";
}

function normalizeSeverity(value: unknown): IncidentSeverity {
  if (value === "low" || value === "medium" || value === "high" || value === "severe") return value;
  return "medium";
}

function normalizeStatus(value: unknown): IncidentStatus {
  if (
    value === "submitted" ||
    value === "in_review" ||
    value === "authority_reported" ||
    value === "corrective_action" ||
    value === "closed" ||
    value === "rejected"
  ) return value;
  return "submitted";
}

function getDemoState() {
  if (!globalForIncidents.hrOneIncidentDemoState) resetIncidentDemoState();
  return globalForIncidents.hrOneIncidentDemoState!;
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function changedFields(before: CompanyIncidentSettings, after: CompanyIncidentSettings) {
  return Object.keys(after).filter((key) => {
    const typedKey = key as keyof CompanyIncidentSettings;
    return JSON.stringify(before[typedKey]) !== JSON.stringify(after[typedKey]);
  });
}
