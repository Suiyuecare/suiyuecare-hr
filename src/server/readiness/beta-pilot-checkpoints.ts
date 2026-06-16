import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { getAuditLogs } from "@/server/audit/queries";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

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

export type RecordBetaPilotCheckpointInput = {
  checkpointId: string;
  status: string;
  evidenceType: string;
  evidenceRef?: string | null;
  reviewerNote?: string | null;
  nextStep?: string | null;
};

const checkpointEntityType = "beta_pilot_checkpoint";

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
  const after: BetaPilotCheckpointEvidence = {
    checkpointId,
    status,
    evidenceType,
    evidenceRefHash,
    reviewerNoteHash,
    nextStepHash,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    recordedAt: new Date(),
  };
  const metadata = {
    source: "beta_pilot_runbook",
    checkpointId,
    checkpointStatus: status,
    evidenceType,
    evidenceRefHash,
    reviewerNoteHash,
    nextStepHash,
    hasEvidenceRef: Boolean(evidenceRefHash),
    hasReviewerNote: Boolean(reviewerNoteHash),
    hasNextStep: Boolean(nextStepHash),
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
        entityId: checkpointId,
        after,
        metadata,
      });
      return after;
    } catch {
      return recordDemoCheckpoint(session, checkpointId, after, metadata);
    }
  }

  return recordDemoCheckpoint(session, checkpointId, after, metadata);
}

function recordDemoCheckpoint(
  session: SessionLike,
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

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
