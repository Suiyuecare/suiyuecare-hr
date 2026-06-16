import type { Prisma } from "@prisma/client";
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

export type PrivacyVerificationStatus = "unverified" | "verified" | "failed";
export type DataSubjectRequestType = "access" | "correction" | "export" | "deletion" | "restriction";
export type DataSubjectRequestStatus = "submitted" | "in_review" | "fulfilled" | "rejected";

export type CompanyPrivacySettings = {
  consentVersion: string;
  consentTitle: string;
  consentBody: string;
  collectionPurpose: string;
  requiresEmployeeAcknowledgement: boolean;
  dataRetentionYears: number;
  dataSubjectRequestResponseDays: number;
  deletionReviewRequired: boolean;
  crossBorderTransferEnabled: boolean;
  subprocessors: string[];
  verificationStatus: PrivacyVerificationStatus;
  lastReviewedAt: Date | null;
};

export type EmployeePrivacyConsentView = {
  id: string;
  employeeId: string;
  employeeName: string;
  consentVersion: string;
  consentTitle: string;
  policyHash: string;
  source: string;
  acceptedAt: Date;
};

export type DataSubjectRequestView = {
  id: string;
  employeeId: string;
  employeeName: string;
  requestType: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  summary: string;
  resolutionNote: string | null;
  dueAt: Date;
  completedAt: Date | null;
  createdAt: Date;
};

export type PrivacyReadiness = {
  ready: boolean;
  acknowledgedCount: number;
  requiredEmployeeCount: number;
  openRequestCount: number;
  overdueRequestCount: number;
  missing: string[];
  detail: string;
};

export type PrivacyWorkspace = {
  settings: CompanyPrivacySettings;
  consents: EmployeePrivacyConsentView[];
  requests: DataSubjectRequestView[];
  readiness: PrivacyReadiness;
};

const defaultPrivacySettings: CompanyPrivacySettings = {
  consentVersion: "2026.01",
  consentTitle: "Employee personal data collection notice",
  consentBody:
    "HR One processes employee personal data for employment administration, attendance, leave, payroll, benefits, legal compliance, audit evidence, and employee self-service. Sensitive decisions remain human-reviewed.",
  collectionPurpose:
    "Employment administration, attendance and leave management, payroll preparation, statutory compliance, internal audit, and employee service delivery.",
  requiresEmployeeAcknowledgement: true,
  dataRetentionYears: 7,
  dataSubjectRequestResponseDays: 30,
  deletionReviewRequired: true,
  crossBorderTransferEnabled: false,
  subprocessors: [],
  verificationStatus: "unverified",
  lastReviewedAt: null,
};

const fallbackEmployees = getFallbackCompanyOverview().company.employees.map((employee) => ({
  id: employee.id,
  displayName: employee.displayName,
}));

type PrivacyDemoState = {
  settings: CompanyPrivacySettings;
  consents: EmployeePrivacyConsentView[];
  requests: DataSubjectRequestView[];
};

const globalForPrivacy = globalThis as unknown as {
  hrOnePrivacyDemoState?: PrivacyDemoState;
};

export async function getPrivacyWorkspace(session: SessionLike): Promise<PrivacyWorkspace> {
  assertPrivacyRead(session);
  if (canUseDatabase(session)) {
    try {
      return getDbPrivacyWorkspace(session as SessionLike & { tenantId: string; companyId: string });
    } catch {
      return getDemoPrivacyWorkspace(session);
    }
  }
  return getDemoPrivacyWorkspace(session);
}

export async function updatePrivacySettings(session: SessionLike, input: Partial<CompanyPrivacySettings>) {
  assertPermission(session.role, "privacy:manage");
  const before = (await getPrivacyWorkspace({ ...session, role: "owner" })).settings;
  const normalized = normalizeSettings(input, before);

  if (canUseDatabase(session)) {
    try {
      return updateDbPrivacySettings(session as SessionLike & { tenantId: string; companyId: string }, before, normalized);
    } catch {
      return updateDemoPrivacySettings(session, before, normalized);
    }
  }
  return updateDemoPrivacySettings(session, before, normalized);
}

export async function recordEmployeePrivacyConsent(session: SessionLike) {
  assertPermission(session.role, "privacy:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  const settings = (await getPrivacyWorkspace({ ...session, role: "employee" })).settings;
  const policyHash = privacyPolicyHash(settings);

  if (canUseDatabase(session)) {
    try {
      return recordDbConsent(session as SessionLike & { tenantId: string; companyId: string }, settings, policyHash);
    } catch {
      return recordDemoConsent(session, settings, policyHash);
    }
  }
  return recordDemoConsent(session, settings, policyHash);
}

export async function createDataSubjectRequest(
  session: SessionLike,
  input: { requestType: DataSubjectRequestType; summary: string },
) {
  assertPermission(session.role, "privacy:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  const settings = (await getPrivacyWorkspace({ ...session, role: "employee" })).settings;
  const normalized = {
    requestType: normalizeRequestType(input.requestType),
    summary: cleanText(input.summary, 500),
    dueAt: addDays(new Date(), settings.dataSubjectRequestResponseDays),
  };
  if (!normalized.summary) throw new Error("Request summary is required.");

  if (canUseDatabase(session)) {
    try {
      return createDbDataSubjectRequest(session as SessionLike & { tenantId: string; companyId: string }, normalized);
    } catch {
      return createDemoDataSubjectRequest(session, normalized);
    }
  }
  return createDemoDataSubjectRequest(session, normalized);
}

export async function resolveDataSubjectRequest(
  session: SessionLike,
  input: { requestId: string; status: DataSubjectRequestStatus; resolutionNote?: string | null },
) {
  assertPermission(session.role, "privacy:manage");
  const status = normalizeRequestStatus(input.status);
  if (status === "submitted") throw new Error("Resolved status must move the request forward.");
  const resolutionNote = cleanText(input.resolutionNote, 500) || null;

  if (canUseDatabase(session)) {
    try {
      return resolveDbDataSubjectRequest(session as SessionLike & { tenantId: string; companyId: string }, {
        requestId: input.requestId,
        status,
        resolutionNote,
      });
    } catch {
      return resolveDemoDataSubjectRequest(session, { requestId: input.requestId, status, resolutionNote });
    }
  }
  return resolveDemoDataSubjectRequest(session, { requestId: input.requestId, status, resolutionNote });
}

export function evaluatePrivacyReadiness(input: {
  settings: CompanyPrivacySettings;
  consents: EmployeePrivacyConsentView[];
  requests: DataSubjectRequestView[];
  employeeCount: number;
  now?: Date;
}): PrivacyReadiness {
  const now = input.now ?? new Date();
  const acknowledgedEmployees = new Set(
    input.consents
      .filter((consent) => consent.consentVersion === input.settings.consentVersion)
      .map((consent) => consent.employeeId),
  );
  const openRequests = input.requests.filter((request) => request.status === "submitted" || request.status === "in_review");
  const overdueRequests = openRequests.filter((request) => request.dueAt.getTime() < now.getTime());
  const missing = [
    input.settings.verificationStatus !== "verified" ? "privacy notice legal/HR review" : null,
    input.settings.requiresEmployeeAcknowledgement && acknowledgedEmployees.size < input.employeeCount
      ? "current employee acknowledgement coverage"
      : null,
    input.settings.dataRetentionYears < 5 ? "minimum HR record retention posture" : null,
    input.settings.dataSubjectRequestResponseDays > 30 ? "30-day personal data request response target" : null,
    overdueRequests.length > 0 ? "overdue data subject requests" : null,
    !input.settings.deletionReviewRequired ? "human review before deletion or anonymization" : null,
  ].filter(Boolean) as string[];

  return {
    ready: missing.length === 0,
    acknowledgedCount: acknowledgedEmployees.size,
    requiredEmployeeCount: input.employeeCount,
    openRequestCount: openRequests.length,
    overdueRequestCount: overdueRequests.length,
    missing,
    detail: `${acknowledgedEmployees.size}/${input.employeeCount} current acknowledgement(s); ${openRequests.length} open request(s); ${overdueRequests.length} overdue; review ${input.settings.verificationStatus}.`,
  };
}

export function resetPrivacyDemoState() {
  const settings = {
    ...cloneSettings(defaultPrivacySettings),
    verificationStatus: "verified" as const,
    lastReviewedAt: new Date("2026-06-01T00:00:00.000Z"),
  };
  const policyHash = privacyPolicyHash(settings);
  globalForPrivacy.hrOnePrivacyDemoState = {
    settings,
    consents: fallbackEmployees.map((employee, index) => ({
      id: `demo-privacy-consent-${index + 1}`,
      employeeId: employee.id,
      employeeName: employee.displayName,
      consentVersion: settings.consentVersion,
      consentTitle: settings.consentTitle,
      policyHash,
      source: "seed",
      acceptedAt: new Date("2026-06-01T01:00:00.000Z"),
    })),
    requests: [],
  };
}

export function privacyPolicyHash(settings: CompanyPrivacySettings) {
  return stableHash({
    version: settings.consentVersion,
    title: settings.consentTitle,
    body: settings.consentBody,
    purpose: settings.collectionPurpose,
    retentionYears: settings.dataRetentionYears,
    crossBorderTransferEnabled: settings.crossBorderTransferEnabled,
    subprocessors: settings.subprocessors,
  });
}

function assertPrivacyRead(session: SessionLike) {
  if (hasPermission(session.role, "privacy:manage") || hasPermission(session.role, "privacy:self")) return;
  throw new Error(`Role ${session.role} cannot privacy:read`);
}

async function getDbPrivacyWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const db = getDb();
  const [settingsRecord, employeeRows, consentRows, requestRows] = await Promise.all([
    db.companyPrivacySetting.findUnique({ where: { companyId: session.companyId } }),
    db.employee.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId, employmentStatus: "active" },
      select: { id: true, displayName: true },
      orderBy: { employeeNo: "asc" },
    }),
    db.employeePrivacyConsent.findMany({
      where: selfScopedWhere(session),
      include: { employee: { select: { displayName: true } } },
      orderBy: { acceptedAt: "desc" },
    }),
    db.dataSubjectRequest.findMany({
      where: selfScopedWhere(session),
      include: { employee: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const settings = settingsRecord ? readSettingsRecord(settingsRecord) : defaultPrivacySettings;
  const consents = consentRows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.displayName,
    consentVersion: row.consentVersion,
    consentTitle: row.consentTitle,
    policyHash: row.policyHash,
    source: row.source,
    acceptedAt: row.acceptedAt,
  }));
  const requests = requestRows.map(readRequestRecord);
  return {
    settings,
    consents,
    requests,
    readiness: evaluatePrivacyReadiness({
      settings,
      consents,
      requests,
      employeeCount: employeeRows.length,
    }),
  };
}

async function updateDbPrivacySettings(
  session: SessionLike & { tenantId: string; companyId: string },
  before: CompanyPrivacySettings,
  after: CompanyPrivacySettings,
) {
  const record = await getDb().$transaction(async (tx) => {
    const updated = await tx.companyPrivacySetting.upsert({
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
      entityType: "privacy_settings",
      entityId: updated.id,
      before,
      after,
      metadata: privacySettingsAuditMetadata(before, after),
    });
    return updated;
  });
  return readSettingsRecord(record);
}

async function recordDbConsent(
  session: SessionLike & { tenantId: string; companyId: string },
  settings: CompanyPrivacySettings,
  policyHash: string,
) {
  const employeeId = session.employee!.id;
  const consent = await getDb().$transaction(async (tx) => {
    const record = await tx.employeePrivacyConsent.upsert({
      where: { employeeId_consentVersion: { employeeId, consentVersion: settings.consentVersion } },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId,
        consentVersion: settings.consentVersion,
        consentTitle: settings.consentTitle,
        policyHash,
        source: "self_service",
        acceptedByUserId: session.user?.id,
      },
      update: {
        policyHash,
        source: "self_service",
        acceptedByUserId: session.user?.id,
        acceptedAt: new Date(),
      },
      include: { employee: { select: { displayName: true } } },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: employeeId,
      action: "create",
      entityType: "employee_privacy_consent",
      entityId: record.id,
      after: { consentVersion: record.consentVersion, policyHash: record.policyHash, source: record.source },
      metadata: {
        consentVersion: record.consentVersion,
        policyHash: record.policyHash,
        employeeId,
        rawPolicyBodyIncluded: false,
      },
    });
    return record;
  });
  return {
    id: consent.id,
    employeeId,
    employeeName: consent.employee.displayName,
    consentVersion: consent.consentVersion,
    consentTitle: consent.consentTitle,
    policyHash: consent.policyHash,
    source: consent.source,
    acceptedAt: consent.acceptedAt,
  };
}

async function createDbDataSubjectRequest(
  session: SessionLike & { tenantId: string; companyId: string },
  input: { requestType: DataSubjectRequestType; summary: string; dueAt: Date },
) {
  const employeeId = session.employee!.id;
  const request = await getDb().$transaction(async (tx) => {
    const record = await tx.dataSubjectRequest.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId,
        requestType: input.requestType,
        summary: input.summary,
        requestedByUserId: session.user?.id,
        dueAt: input.dueAt,
        metadataJson: {
          summaryHash: stableHash(input.summary),
          rawSummaryIncludedInAudit: false,
        },
      },
      include: { employee: { select: { displayName: true } } },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: employeeId,
      action: "create",
      entityType: "data_subject_request",
      entityId: record.id,
      after: { requestType: record.requestType, status: record.status, dueAt: record.dueAt },
      metadata: requestAuditMetadata(record.requestType, record.status, record.dueAt, input.summary),
    });
    return record;
  });
  return readRequestRecord(request);
}

async function resolveDbDataSubjectRequest(
  session: SessionLike & { tenantId: string; companyId: string },
  input: { requestId: string; status: DataSubjectRequestStatus; resolutionNote: string | null },
) {
  const request = await getDb().$transaction(async (tx) => {
    const before = await tx.dataSubjectRequest.findFirstOrThrow({
      where: { id: input.requestId, tenantId: session.tenantId, companyId: session.companyId },
    });
    const updated = await tx.dataSubjectRequest.update({
      where: { id: before.id },
      data: {
        status: input.status,
        resolutionNote: input.resolutionNote,
        assignedToUserId: session.user?.id,
        completedAt: input.status === "fulfilled" || input.status === "rejected" ? new Date() : null,
      },
      include: { employee: { select: { displayName: true } } },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: input.status === "rejected" ? "reject" : "update",
      entityType: "data_subject_request",
      entityId: updated.id,
      before: { status: before.status },
      after: { status: updated.status, completedAt: updated.completedAt },
      metadata: {
        requestType: updated.requestType,
        status: updated.status,
        responseWithinDueDate: updated.completedAt ? updated.completedAt.getTime() <= updated.dueAt.getTime() : null,
        resolutionNoteHash: input.resolutionNote ? stableHash(input.resolutionNote) : null,
        rawResolutionNoteIncluded: false,
      },
    });
    return updated;
  });
  return readRequestRecord(request);
}

function getDemoPrivacyWorkspace(session: SessionLike): PrivacyWorkspace {
  const state = getDemoState();
  const consents = selfScopeList(session, state.consents, (item) => item.employeeId);
  const requests = selfScopeList(session, state.requests, (item) => item.employeeId);
  return {
    settings: state.settings,
    consents,
    requests,
    readiness: evaluatePrivacyReadiness({
      settings: state.settings,
      consents: state.consents,
      requests: state.requests,
      employeeCount: fallbackEmployees.length,
    }),
  };
}

function updateDemoPrivacySettings(
  session: SessionLike,
  before: CompanyPrivacySettings,
  after: CompanyPrivacySettings,
) {
  getDemoState().settings = cloneSettings(after);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "privacy_settings",
    entityId: "demo-privacy-settings",
    before,
    after,
    metadata: privacySettingsAuditMetadata(before, after),
  });
  return after;
}

function recordDemoConsent(session: SessionLike, settings: CompanyPrivacySettings, policyHash: string) {
  const state = getDemoState();
  const employeeId = session.employee!.id;
  const existingIndex = state.consents.findIndex(
    (item) => item.employeeId === employeeId && item.consentVersion === settings.consentVersion,
  );
  const consent: EmployeePrivacyConsentView = {
    id: existingIndex >= 0 ? state.consents[existingIndex].id : crypto.randomUUID(),
    employeeId,
    employeeName: session.employee!.displayName,
    consentVersion: settings.consentVersion,
    consentTitle: settings.consentTitle,
    policyHash,
    source: "self_service",
    acceptedAt: new Date(),
  };
  if (existingIndex >= 0) state.consents[existingIndex] = consent;
  else state.consents.unshift(consent);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: employeeId,
    actorName: session.employee?.displayName,
    action: "create",
    entityType: "employee_privacy_consent",
    entityId: consent.id,
    after: { consentVersion: consent.consentVersion, policyHash: consent.policyHash, source: consent.source },
    metadata: {
      consentVersion: consent.consentVersion,
      policyHash,
      employeeId,
      rawPolicyBodyIncluded: false,
    },
  });
  return consent;
}

function createDemoDataSubjectRequest(
  session: SessionLike,
  input: { requestType: DataSubjectRequestType; summary: string; dueAt: Date },
) {
  const request: DataSubjectRequestView = {
    id: crypto.randomUUID(),
    employeeId: session.employee!.id,
    employeeName: session.employee!.displayName,
    requestType: input.requestType,
    status: "submitted",
    summary: input.summary,
    resolutionNote: null,
    dueAt: input.dueAt,
    completedAt: null,
    createdAt: new Date(),
  };
  getDemoState().requests.unshift(request);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName,
    action: "create",
    entityType: "data_subject_request",
    entityId: request.id,
    after: { requestType: request.requestType, status: request.status, dueAt: request.dueAt },
    metadata: requestAuditMetadata(request.requestType, request.status, request.dueAt, request.summary),
  });
  return request;
}

function resolveDemoDataSubjectRequest(
  session: SessionLike,
  input: { requestId: string; status: DataSubjectRequestStatus; resolutionNote: string | null },
) {
  const state = getDemoState();
  const index = state.requests.findIndex((request) => request.id === input.requestId);
  if (index < 0) throw new Error("Data subject request not found.");
  const before = state.requests[index];
  const updated = {
    ...before,
    status: input.status,
    resolutionNote: input.resolutionNote,
    completedAt: input.status === "fulfilled" || input.status === "rejected" ? new Date() : null,
  };
  state.requests[index] = updated;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: input.status === "rejected" ? "reject" : "update",
    entityType: "data_subject_request",
    entityId: updated.id,
    before: { status: before.status },
    after: { status: updated.status, completedAt: updated.completedAt },
    metadata: {
      requestType: updated.requestType,
      status: updated.status,
      responseWithinDueDate: updated.completedAt ? updated.completedAt.getTime() <= updated.dueAt.getTime() : null,
      resolutionNoteHash: input.resolutionNote ? stableHash(input.resolutionNote) : null,
      rawResolutionNoteIncluded: false,
    },
  });
  return updated;
}

function readSettingsRecord(record: {
  consentVersion: string;
  consentTitle: string;
  consentBody: string;
  collectionPurpose: string;
  requiresEmployeeAcknowledgement: boolean;
  dataRetentionYears: number;
  dataSubjectRequestResponseDays: number;
  deletionReviewRequired: boolean;
  crossBorderTransferEnabled: boolean;
  subprocessorsJson: Prisma.JsonValue;
  verificationStatus: string;
  lastReviewedAt: Date | null;
}): CompanyPrivacySettings {
  return {
    consentVersion: record.consentVersion,
    consentTitle: record.consentTitle,
    consentBody: record.consentBody,
    collectionPurpose: record.collectionPurpose,
    requiresEmployeeAcknowledgement: record.requiresEmployeeAcknowledgement,
    dataRetentionYears: record.dataRetentionYears,
    dataSubjectRequestResponseDays: record.dataSubjectRequestResponseDays,
    deletionReviewRequired: record.deletionReviewRequired,
    crossBorderTransferEnabled: record.crossBorderTransferEnabled,
    subprocessors: Array.isArray(record.subprocessorsJson) ? record.subprocessorsJson.map(String) : [],
    verificationStatus: normalizeVerificationStatus(record.verificationStatus, "unverified"),
    lastReviewedAt: record.lastReviewedAt,
  };
}

function writeSettingsRecord(settings: CompanyPrivacySettings) {
  return {
    consentVersion: settings.consentVersion,
    consentTitle: settings.consentTitle,
    consentBody: settings.consentBody,
    collectionPurpose: settings.collectionPurpose,
    requiresEmployeeAcknowledgement: settings.requiresEmployeeAcknowledgement,
    dataRetentionYears: settings.dataRetentionYears,
    dataSubjectRequestResponseDays: settings.dataSubjectRequestResponseDays,
    deletionReviewRequired: settings.deletionReviewRequired,
    crossBorderTransferEnabled: settings.crossBorderTransferEnabled,
    subprocessorsJson: settings.subprocessors as Prisma.InputJsonValue,
    verificationStatus: settings.verificationStatus,
    lastReviewedAt: settings.verificationStatus === "verified" ? settings.lastReviewedAt ?? new Date() : null,
  };
}

function readRequestRecord(record: {
  id: string;
  employeeId: string;
  employee: { displayName: string };
  requestType: string;
  status: string;
  summary: string;
  resolutionNote: string | null;
  dueAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}): DataSubjectRequestView {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employee.displayName,
    requestType: normalizeRequestType(record.requestType),
    status: normalizeRequestStatus(record.status),
    summary: record.summary,
    resolutionNote: record.resolutionNote,
    dueAt: record.dueAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
  };
}

function normalizeSettings(
  input: Partial<CompanyPrivacySettings>,
  before: CompanyPrivacySettings,
): CompanyPrivacySettings {
  return {
    consentVersion: cleanText(input.consentVersion, 40) || before.consentVersion,
    consentTitle: cleanText(input.consentTitle, 120) || before.consentTitle,
    consentBody: cleanText(input.consentBody, 2000) || before.consentBody,
    collectionPurpose: cleanText(input.collectionPurpose, 1000) || before.collectionPurpose,
    requiresEmployeeAcknowledgement: input.requiresEmployeeAcknowledgement ?? before.requiresEmployeeAcknowledgement,
    dataRetentionYears: clampInteger(input.dataRetentionYears, before.dataRetentionYears, 5, 30),
    dataSubjectRequestResponseDays: clampInteger(
      input.dataSubjectRequestResponseDays,
      before.dataSubjectRequestResponseDays,
      1,
      30,
    ),
    deletionReviewRequired: input.deletionReviewRequired ?? before.deletionReviewRequired,
    crossBorderTransferEnabled: input.crossBorderTransferEnabled ?? before.crossBorderTransferEnabled,
    subprocessors: normalizeSubprocessors(input.subprocessors ?? before.subprocessors),
    verificationStatus: normalizeVerificationStatus(input.verificationStatus, before.verificationStatus),
    lastReviewedAt: normalizeVerificationStatus(input.verificationStatus, before.verificationStatus) === "verified"
      ? input.lastReviewedAt ?? before.lastReviewedAt ?? new Date()
      : null,
  };
}

function privacySettingsAuditMetadata(before: CompanyPrivacySettings, after: CompanyPrivacySettings) {
  return {
    changedFields: changedFields(before, after),
    consentVersion: after.consentVersion,
    policyHash: privacyPolicyHash(after),
    requiresEmployeeAcknowledgement: after.requiresEmployeeAcknowledgement,
    dataRetentionYears: after.dataRetentionYears,
    dataSubjectRequestResponseDays: after.dataSubjectRequestResponseDays,
    crossBorderTransferEnabled: after.crossBorderTransferEnabled,
    verificationStatus: after.verificationStatus,
    rawPolicyBodyIncluded: false,
  };
}

function requestAuditMetadata(
  requestType: string,
  status: string,
  dueAt: Date,
  summary: string,
) {
  return {
    requestType,
    status,
    dueAt: dueAt.toISOString(),
    summaryHash: stableHash(summary),
    rawSummaryIncluded: false,
  };
}

function selfScopedWhere(session: SessionLike & { tenantId: string; companyId: string }) {
  return {
    tenantId: session.tenantId,
    companyId: session.companyId,
    ...(hasPermission(session.role, "privacy:manage") ? {} : { employeeId: session.employee?.id ?? "__missing__" }),
  };
}

function selfScopeList<T>(session: SessionLike, rows: T[], employeeId: (row: T) => string) {
  if (hasPermission(session.role, "privacy:manage")) return rows;
  return rows.filter((row) => employeeId(row) === session.employee?.id);
}

function getDemoState() {
  if (!globalForPrivacy.hrOnePrivacyDemoState) resetPrivacyDemoState();
  return globalForPrivacy.hrOnePrivacyDemoState!;
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}

function normalizeVerificationStatus(value: unknown, fallback: PrivacyVerificationStatus): PrivacyVerificationStatus {
  return value === "verified" || value === "failed" || value === "unverified" ? value : fallback;
}

function normalizeRequestType(value: unknown): DataSubjectRequestType {
  if (value === "access" || value === "correction" || value === "export" || value === "deletion" || value === "restriction") {
    return value;
  }
  return "access";
}

function normalizeRequestStatus(value: unknown): DataSubjectRequestStatus {
  if (value === "submitted" || value === "in_review" || value === "fulfilled" || value === "rejected") return value;
  return "submitted";
}

function normalizeSubprocessors(values: string[]) {
  return [...new Set(values.map((value) => cleanText(value, 80)).filter(Boolean))].slice(0, 20);
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

function cloneSettings(settings: CompanyPrivacySettings): CompanyPrivacySettings {
  return {
    ...settings,
    subprocessors: [...settings.subprocessors],
    lastReviewedAt: settings.lastReviewedAt ? new Date(settings.lastReviewedAt) : null,
  };
}

function changedFields(before: CompanyPrivacySettings, after: CompanyPrivacySettings) {
  return Object.keys(after).filter((key) => {
    const typedKey = key as keyof CompanyPrivacySettings;
    return JSON.stringify(before[typedKey]) !== JSON.stringify(after[typedKey]);
  });
}
