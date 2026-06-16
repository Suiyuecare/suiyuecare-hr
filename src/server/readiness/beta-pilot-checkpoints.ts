import { writeAuditLog } from "@/server/audit/audit";
import { getAuditDemoState, writeDemoAuditLog } from "@/server/audit/demo-store";
import { getAuditLogs } from "@/server/audit/queries";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type ActorSessionLike = {
  role?: string;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export const betaPilotCheckpointIds = [
  "preflight",
  "day_1",
  "day_3",
  "day_7",
  "day_14",
] as const;

export const betaPilotCheckpointStatuses = [
  "not_started",
  "in_progress",
  "verified",
  "blocked",
] as const;

export const betaPilotEvidenceTypes = [
  "smoke_test",
  "announcement_receipt",
  "approval_flow",
  "payroll_rehearsal",
  "payslip_access",
  "access_review",
  "audit_export",
  "backup_restore",
] as const;

export type BetaPilotCheckpointId = (typeof betaPilotCheckpointIds)[number];
export type BetaPilotCheckpointStatus = (typeof betaPilotCheckpointStatuses)[number];
export type BetaPilotEvidenceType = (typeof betaPilotEvidenceTypes)[number];

export type BetaPilotCheckpointEvidence = {
  checkpointId: BetaPilotCheckpointId;
  status: BetaPilotCheckpointStatus;
  evidenceType: BetaPilotEvidenceType;
  evidenceRefHash: string | null;
  reviewerNoteHash: string | null;
  nextStepHash: string | null;
  actorName: string;
  recordedAt: Date;
};

export type BetaPilotCheckpointCoverage = {
  checkpointId: BetaPilotCheckpointId;
  latestStatus: BetaPilotCheckpointStatus;
  evidenceTypes: BetaPilotEvidenceType[];
  recordedCount: number;
  latestRecordedAt: Date | null;
};

export type RecordBetaPilotCheckpointInput = {
  checkpointId: string;
  status: string;
  evidenceType: string;
  evidenceRef?: string | null;
  reviewerNote?: string | null;
  nextStep?: string | null;
};

const checkpointEntityType = "beta_pilot_checkpoint";

export async function recordBetaPilotAutomatedEvidence(
  session: ActorSessionLike,
  input: {
    checkpointId: BetaPilotCheckpointId;
    evidenceType: BetaPilotEvidenceType;
    evidenceRef: string;
    requiredEvidenceTypes?: BetaPilotEvidenceType[];
    statusOverride?: BetaPilotCheckpointStatus;
    metadata?: Record<string, unknown>;
  },
) {
  const requiredEvidenceTypes = input.requiredEvidenceTypes ?? [input.evidenceType];
  const existingEvidenceTypes = await getRecordedEvidenceTypes(session, input.checkpointId);
  const fulfilledEvidenceTypes = [...new Set([...existingEvidenceTypes, input.evidenceType])]
    .filter((evidenceType) => requiredEvidenceTypes.includes(evidenceType));
  const missingEvidenceTypes = requiredEvidenceTypes
    .filter((evidenceType) => !fulfilledEvidenceTypes.includes(evidenceType));
  const status: BetaPilotCheckpointStatus = input.statusOverride ??
    (missingEvidenceTypes.length === 0 ? "verified" : "in_progress");
  return writeCheckpointEvidence(session, {
    checkpointId: input.checkpointId,
    status,
    evidenceType: input.evidenceType,
    evidenceRefHash: hashOptionalText(input.evidenceRef),
    reviewerNoteHash: null,
    nextStepHash: null,
    source: "beta_pilot_automated_evidence",
    metadata: {
      automated: true,
      requiredEvidenceTypes,
      fulfilledEvidenceTypes,
      missingEvidenceTypes,
      ...(input.metadata ?? {}),
    },
  });
}

export async function getBetaPilotCheckpointEvidence(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  const latestByCheckpoint = new Map<BetaPilotCheckpointId, BetaPilotCheckpointEvidence>();
  const logs = await getAuditLogs(session, 200);
  for (const log of logs) {
    if (log.entityType !== checkpointEntityType) continue;
    const checkpointId = normalizeCheckpointId(log.metadata.checkpointId);
    if (!checkpointId || latestByCheckpoint.has(checkpointId)) continue;
    latestByCheckpoint.set(checkpointId, {
      checkpointId,
      status: normalizeStatus(log.metadata.checkpointStatus),
      evidenceType: normalizeEvidenceType(log.metadata.evidenceType),
      evidenceRefHash: readNullableString(log.metadata.evidenceRefHash),
      reviewerNoteHash: readNullableString(log.metadata.reviewerNoteHash),
      nextStepHash: readNullableString(log.metadata.nextStepHash),
      actorName: log.actorName,
      recordedAt: log.createdAt,
    });
  }
  return betaPilotCheckpointIds.map((checkpointId) => latestByCheckpoint.get(checkpointId) ?? null);
}

export async function getBetaPilotCheckpointCoverage(session: SessionLike): Promise<BetaPilotCheckpointCoverage[]> {
  assertPermission(session.role, "settings:read");
  const logs = await readCheckpointAuditLogs(session);
  const coverageByCheckpoint = new Map<BetaPilotCheckpointId, {
    latestStatus: BetaPilotCheckpointStatus;
    evidenceTypes: Set<BetaPilotEvidenceType>;
    recordedCount: number;
    latestRecordedAt: Date | null;
  }>();

  for (const checkpointId of betaPilotCheckpointIds) {
    coverageByCheckpoint.set(checkpointId, {
      latestStatus: "not_started",
      evidenceTypes: new Set(),
      recordedCount: 0,
      latestRecordedAt: null,
    });
  }

  for (const log of logs) {
    const metadata = readMetadata(log.metadataJson);
    const checkpointId = normalizeCheckpointId(metadata.checkpointId ?? log.entityId);
    if (!checkpointId) continue;
    const coverage = coverageByCheckpoint.get(checkpointId);
    if (!coverage) continue;
    coverage.recordedCount += 1;
    coverage.evidenceTypes.add(normalizeEvidenceType(metadata.evidenceType));
    if (!coverage.latestRecordedAt || log.createdAt > coverage.latestRecordedAt) {
      coverage.latestRecordedAt = log.createdAt;
      coverage.latestStatus = normalizeStatus(metadata.checkpointStatus);
    }
  }

  return betaPilotCheckpointIds.map((checkpointId) => {
    const coverage = coverageByCheckpoint.get(checkpointId)!;
    return {
      checkpointId,
      latestStatus: coverage.latestStatus,
      evidenceTypes: [...coverage.evidenceTypes].sort(),
      recordedCount: coverage.recordedCount,
      latestRecordedAt: coverage.latestRecordedAt,
    };
  });
}

export async function recordBetaPilotCheckpoint(
  session: SessionLike,
  input: RecordBetaPilotCheckpointInput,
) {
  assertPermission(session.role, "pilot:manage");
  const checkpointId = normalizeCheckpointId(input.checkpointId);
  if (!checkpointId) throw new Error("Unknown beta pilot checkpoint.");
  const status = normalizeStatus(input.status);
  const evidenceType = normalizeEvidenceType(input.evidenceType);
  const evidenceRefHash = hashOptionalText(input.evidenceRef);
  const reviewerNoteHash = hashOptionalText(input.reviewerNote);
  const nextStepHash = hashOptionalText(input.nextStep);
  return writeCheckpointEvidence(session, {
    checkpointId,
    status,
    evidenceType,
    evidenceRefHash,
    reviewerNoteHash,
    nextStepHash,
    source: "beta_pilot_runbook",
    metadata: {},
  });
}

async function readCheckpointAuditLogs(session: SessionLike) {
  if (canUseDatabase(session)) {
    try {
      const logs = await getDb().auditLog.findMany({
        where: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          entityType: checkpointEntityType,
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return logs.map((log) => ({
        entityId: log.entityId,
        metadataJson: log.metadataJson,
        createdAt: log.createdAt,
      }));
    } catch {
      return readDemoCheckpointAuditLogs(session);
    }
  }
  return readDemoCheckpointAuditLogs(session);
}

function readDemoCheckpointAuditLogs(session: SessionLike) {
  return getAuditDemoState().logs
    .filter((log) =>
      log.tenantId === (session.tenantId ?? "demo-tenant") &&
      log.companyId === (session.companyId ?? "demo-company") &&
      log.entityType === checkpointEntityType,
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 500)
    .map((log) => ({
      entityId: log.entityId,
      metadataJson: log.metadataJson,
      createdAt: log.createdAt,
    }));
}

async function writeCheckpointEvidence(
  session: ActorSessionLike,
  input: {
    checkpointId: BetaPilotCheckpointId;
    status: BetaPilotCheckpointStatus;
    evidenceType: BetaPilotEvidenceType;
    evidenceRefHash: string | null;
    reviewerNoteHash: string | null;
    nextStepHash: string | null;
    source: "beta_pilot_runbook" | "beta_pilot_automated_evidence";
    metadata: Record<string, unknown>;
  },
) {
  const after: BetaPilotCheckpointEvidence = {
    checkpointId: input.checkpointId,
    status: input.status,
    evidenceType: input.evidenceType,
    evidenceRefHash: input.evidenceRefHash,
    reviewerNoteHash: input.reviewerNoteHash,
    nextStepHash: input.nextStepHash,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    recordedAt: new Date(),
  };
  const metadata = {
    source: input.source,
    checkpointId: input.checkpointId,
    checkpointStatus: input.status,
    evidenceType: input.evidenceType,
    evidenceRefHash: input.evidenceRefHash,
    reviewerNoteHash: input.reviewerNoteHash,
    nextStepHash: input.nextStepHash,
    hasEvidenceRef: Boolean(input.evidenceRefHash),
    hasReviewerNote: Boolean(input.reviewerNoteHash),
    hasNextStep: Boolean(input.nextStepHash),
    ...input.metadata,
  };

  if (canUseDatabase(session)) {
    try {
      await writeAuditLog(getDb(), {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        actorUserId: session.user?.id,
        actorEmployeeId: session.employee?.id,
        action: "update",
        entityType: checkpointEntityType,
        entityId: input.checkpointId,
        after,
        metadata,
      });
      return after;
    } catch {
      return recordDemoCheckpoint(session, input.checkpointId, after, metadata);
    }
  }

  return recordDemoCheckpoint(session, input.checkpointId, after, metadata);
}

function recordDemoCheckpoint(
  session: ActorSessionLike,
  checkpointId: BetaPilotCheckpointId,
  after: BetaPilotCheckpointEvidence,
  metadata: Record<string, unknown>,
) {
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName,
    action: "update",
    entityType: checkpointEntityType,
    entityId: checkpointId,
    after,
    metadata,
  });
  return after;
}

async function getRecordedEvidenceTypes(
  session: ActorSessionLike,
  checkpointId: BetaPilotCheckpointId,
) {
  const evidenceTypes = new Set<BetaPilotEvidenceType>();
  if (canUseDatabase(session)) {
    try {
      const logs = await getDb().auditLog.findMany({
        where: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          entityType: checkpointEntityType,
          entityId: checkpointId,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      for (const log of logs) {
        const evidenceType = normalizeEvidenceType(readMetadata(log.metadataJson).evidenceType);
        evidenceTypes.add(evidenceType);
      }
      return [...evidenceTypes];
    } catch {
      return getDemoRecordedEvidenceTypes(session, checkpointId);
    }
  }
  return getDemoRecordedEvidenceTypes(session, checkpointId);
}

function getDemoRecordedEvidenceTypes(
  session: ActorSessionLike,
  checkpointId: BetaPilotCheckpointId,
) {
  const evidenceTypes = new Set<BetaPilotEvidenceType>();
  for (const log of getAuditDemoState().logs) {
    if (log.tenantId !== (session.tenantId ?? "demo-tenant")) continue;
    if (log.companyId !== (session.companyId ?? "demo-company")) continue;
    if (log.entityType !== checkpointEntityType || log.entityId !== checkpointId) continue;
    evidenceTypes.add(normalizeEvidenceType(log.metadataJson.evidenceType));
  }
  return [...evidenceTypes];
}

function normalizeCheckpointId(value: unknown): BetaPilotCheckpointId | null {
  return typeof value === "string" && betaPilotCheckpointIds.includes(value as BetaPilotCheckpointId)
    ? value as BetaPilotCheckpointId
    : null;
}

function normalizeStatus(value: unknown): BetaPilotCheckpointStatus {
  return typeof value === "string" && betaPilotCheckpointStatuses.includes(value as BetaPilotCheckpointStatus)
    ? value as BetaPilotCheckpointStatus
    : "not_started";
}

function normalizeEvidenceType(value: unknown): BetaPilotEvidenceType {
  return typeof value === "string" && betaPilotEvidenceTypes.includes(value as BetaPilotEvidenceType)
    ? value as BetaPilotEvidenceType
    : "smoke_test";
}

function hashOptionalText(value: string | null | undefined) {
  const cleaned = cleanText(value);
  return cleaned ? stableHash({ value: cleaned }) : null;
}

function cleanText(value: string | null | undefined) {
  return value?.trim().slice(0, 500) || null;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function canUseDatabase(
  session: ActorSessionLike,
): session is ActorSessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
