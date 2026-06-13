import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

export const supportAccessScopes = [
  "technical_support",
  "billing_support",
  "data_migration",
  "incident_response",
] as const;

export type SupportAccessScope = (typeof supportAccessScopes)[number];
export type SupportAccessDataLevel = "metadata_only" | "customer_approved_records";
export type SupportAccessStatus = "approved" | "revoked" | "expired";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type SupportAccessGrant = {
  id: string;
  supportPrincipalEmail: string;
  supportPrincipalName: string | null;
  ticketId: string;
  reason: string;
  scopes: SupportAccessScope[];
  dataAccessLevel: SupportAccessDataLevel;
  status: SupportAccessStatus;
  approvedByUserId: string | null;
  approvedAt: Date;
  expiresAt: Date;
  revokedByUserId: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  lastUsedAt: Date | null;
};

export type SupportAccessGrantInput = {
  supportPrincipalEmail: string;
  supportPrincipalName?: string | null;
  ticketId: string;
  reason: string;
  scopes: SupportAccessScope[];
  dataAccessLevel?: SupportAccessDataLevel;
  expiresAt: Date;
};

const maxGrantDurationMs = 72 * 60 * 60 * 1000;

type SupportAccessDemoState = {
  grants: SupportAccessGrant[];
};

const globalForSupportAccess = globalThis as unknown as {
  hrOneSupportAccessDemoState?: SupportAccessDemoState;
};

export async function listSupportAccessGrants(session: SessionLike) {
  assertOwner(session);
  if (canUseDatabase(session)) {
    try {
      const records = await getDb().supportAccessGrant.findMany({
        where: { tenantId: session.tenantId!, companyId: session.companyId! },
        orderBy: { createdAt: "desc" },
      });
      return records.map(readRecord);
    } catch {
      return getDemoState().grants;
    }
  }
  return getDemoState().grants;
}

export async function getSupportAccessGovernance(session: SessionLike, now = new Date()) {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    try {
      const db = getDb();
      const [activeApprovedCount, activeUnapprovedCount, expiredStillApprovedCount] = await Promise.all([
        db.supportAccessGrant.count({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            status: "approved",
            expiresAt: { gt: now },
          },
        }),
        db.supportAccessGrant.count({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            status: { notIn: ["approved", "revoked", "expired"] },
            expiresAt: { gt: now },
          },
        }),
        db.supportAccessGrant.count({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            status: "approved",
            expiresAt: { lte: now },
          },
        }),
      ]);
      return { activeApprovedCount, activeUnapprovedCount, expiredStillApprovedCount };
    } catch {
      return demoSupportAccessGovernance(now);
    }
  }
  return demoSupportAccessGovernance(now);
}

export async function approveSupportAccessGrant(
  session: SessionLike,
  input: SupportAccessGrantInput,
  now = new Date(),
) {
  assertOwner(session);
  const normalized = normalizeGrantInput(input, now);

  if (canUseDatabase(session)) {
    try {
      const db = getDb();
      const record = await db.$transaction(async (tx) => {
        const created = await tx.supportAccessGrant.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            supportPrincipalEmail: normalized.supportPrincipalEmail,
            supportPrincipalName: normalized.supportPrincipalName,
            ticketId: normalized.ticketId,
            reason: normalized.reason,
            scopeJson: normalized.scopes as Prisma.InputJsonValue,
            dataAccessLevel: normalized.dataAccessLevel,
            status: "approved",
            approvedByUserId: session.user?.id,
            approvedAt: now,
            expiresAt: normalized.expiresAt,
          },
        });
        await writeAuditLog(tx, {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          actorUserId: session.user?.id,
          actorEmployeeId: session.employee?.id,
          action: "approve",
          entityType: "support_access_grant",
          entityId: created.id,
          after: {
            ...normalized,
            supportPrincipalEmailHash: stableHash(normalized.supportPrincipalEmail),
            supportPrincipalEmail: undefined,
          },
          metadata: auditMetadata(normalized),
        });
        return created;
      });
      return readRecord(record);
    } catch {
      return approveDemoGrant(session, normalized, now);
    }
  }

  return approveDemoGrant(session, normalized, now);
}

export async function revokeSupportAccessGrant(
  session: SessionLike,
  grantId: string,
  revokeReason: string,
  now = new Date(),
) {
  assertOwner(session);
  const reason = revokeReason.trim();
  if (reason.length < 8) {
    throw new Error("Support access revoke reason must be at least 8 characters.");
  }

  if (canUseDatabase(session)) {
    try {
      const db = getDb();
      const updated = await db.$transaction(async (tx) => {
        const before = await tx.supportAccessGrant.findFirstOrThrow({
          where: { id: grantId, tenantId: session.tenantId!, companyId: session.companyId! },
        });
        const record = await tx.supportAccessGrant.update({
          where: { id: before.id },
          data: {
            status: "revoked",
            revokedByUserId: session.user?.id,
            revokedAt: now,
            revokeReason: reason,
          },
        });
        await writeAuditLog(tx, {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          actorUserId: session.user?.id,
          actorEmployeeId: session.employee?.id,
          action: "update",
          entityType: "support_access_grant",
          entityId: record.id,
          before,
          after: { status: "revoked", revokedAt: now },
          metadata: {
            revokeReasonHash: stableHash(reason),
            previousStatus: before.status,
          },
        });
        return record;
      });
      return readRecord(updated);
    } catch {
      return revokeDemoGrant(session, grantId, reason, now);
    }
  }

  return revokeDemoGrant(session, grantId, reason, now);
}

export function canUseSupportAccess(
  grant: SupportAccessGrant,
  scope: SupportAccessScope,
  now = new Date(),
) {
  return grant.status === "approved" && grant.expiresAt > now && grant.scopes.includes(scope);
}

export function summarizeSupportAccessGovernance(input: {
  activeApprovedCount: number;
  activeUnapprovedCount: number;
  expiredStillApprovedCount: number;
}) {
  const passed = input.activeUnapprovedCount === 0 && input.expiredStillApprovedCount === 0;
  return {
    passed,
    detail: passed
      ? `${input.activeApprovedCount} active approved support grant(s); no unapproved or expired active access.`
      : `${input.activeUnapprovedCount} unapproved active grant(s), ${input.expiredStillApprovedCount} expired grant(s) still approved.`,
  };
}

export function resetSupportAccessDemoState() {
  globalForSupportAccess.hrOneSupportAccessDemoState = { grants: [] };
}

function approveDemoGrant(
  session: SessionLike,
  normalized: ReturnType<typeof normalizeGrantInput>,
  now: Date,
) {
  const grant: SupportAccessGrant = {
    id: crypto.randomUUID(),
    ...normalized,
    status: "approved",
    approvedByUserId: session.user?.id ?? null,
    approvedAt: now,
    revokedByUserId: null,
    revokedAt: null,
    revokeReason: null,
    lastUsedAt: null,
  };
  getDemoState().grants.unshift(grant);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "approve",
    entityType: "support_access_grant",
    entityId: grant.id,
    after: {
      ...normalized,
      supportPrincipalEmailHash: stableHash(normalized.supportPrincipalEmail),
      supportPrincipalEmail: undefined,
    },
    metadata: auditMetadata(normalized),
  });
  return grant;
}

function demoSupportAccessGovernance(now: Date) {
  const grants = getDemoState().grants;
  return {
    activeApprovedCount: grants.filter((grant) => grant.status === "approved" && grant.expiresAt > now).length,
    activeUnapprovedCount: grants.filter((grant) =>
      grant.status !== "approved" && grant.status !== "revoked" && grant.status !== "expired" && grant.expiresAt > now
    ).length,
    expiredStillApprovedCount: grants.filter((grant) => grant.status === "approved" && grant.expiresAt <= now).length,
  };
}

function revokeDemoGrant(session: SessionLike, grantId: string, revokeReason: string, now: Date) {
  const state = getDemoState();
  const index = state.grants.findIndex((grant) => grant.id === grantId);
  if (index < 0) throw new Error("Support access grant not found.");
  const before = state.grants[index];
  const updated: SupportAccessGrant = {
    ...before,
    status: "revoked",
    revokedByUserId: session.user?.id ?? null,
    revokedAt: now,
    revokeReason,
  };
  state.grants[index] = updated;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "support_access_grant",
    entityId: grantId,
    before,
    after: { status: "revoked", revokedAt: now },
    metadata: {
      revokeReasonHash: stableHash(revokeReason),
      previousStatus: before.status,
    },
  });
  return updated;
}

function normalizeGrantInput(input: SupportAccessGrantInput, now: Date) {
  const email = input.supportPrincipalEmail.trim().toLowerCase();
  const ticketId = input.ticketId.trim();
  const reason = input.reason.trim();
  const expiresAt = new Date(input.expiresAt);
  const dataAccessLevel = input.dataAccessLevel ?? "metadata_only";
  const scopes = [...new Set(input.scopes)];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Support principal email is invalid.");
  }
  if (ticketId.length < 3) {
    throw new Error("Support access ticket ID is required.");
  }
  if (reason.length < 12) {
    throw new Error("Support access reason must be at least 12 characters.");
  }
  if (scopes.length === 0 || scopes.some((scope) => !supportAccessScopes.includes(scope))) {
    throw new Error("Support access scope is invalid.");
  }
  if (dataAccessLevel !== "metadata_only" && dataAccessLevel !== "customer_approved_records") {
    throw new Error("Support access data level is invalid.");
  }
  if (expiresAt <= now) {
    throw new Error("Support access expiry must be in the future.");
  }
  if (expiresAt.getTime() - now.getTime() > maxGrantDurationMs) {
    throw new Error("Support access cannot exceed 72 hours.");
  }

  return {
    supportPrincipalEmail: email,
    supportPrincipalName: input.supportPrincipalName?.trim() || null,
    ticketId,
    reason,
    scopes,
    dataAccessLevel,
    expiresAt,
  };
}

function readRecord(record: {
  id: string;
  supportPrincipalEmail: string;
  supportPrincipalName: string | null;
  ticketId: string;
  reason: string;
  scopeJson: Prisma.JsonValue;
  dataAccessLevel: string;
  status: string;
  approvedByUserId: string | null;
  approvedAt: Date;
  expiresAt: Date;
  revokedByUserId: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  lastUsedAt: Date | null;
}): SupportAccessGrant {
  return {
    id: record.id,
    supportPrincipalEmail: record.supportPrincipalEmail,
    supportPrincipalName: record.supportPrincipalName,
    ticketId: record.ticketId,
    reason: record.reason,
    scopes: readScopes(record.scopeJson),
    dataAccessLevel: record.dataAccessLevel === "customer_approved_records"
      ? "customer_approved_records"
      : "metadata_only",
    status: record.status === "revoked" || record.status === "expired" ? record.status : "approved",
    approvedByUserId: record.approvedByUserId,
    approvedAt: record.approvedAt,
    expiresAt: record.expiresAt,
    revokedByUserId: record.revokedByUserId,
    revokedAt: record.revokedAt,
    revokeReason: record.revokeReason,
    lastUsedAt: record.lastUsedAt,
  };
}

function readScopes(value: Prisma.JsonValue): SupportAccessScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter((scope): scope is SupportAccessScope =>
    typeof scope === "string" && supportAccessScopes.includes(scope as SupportAccessScope),
  );
}

function auditMetadata(input: ReturnType<typeof normalizeGrantInput>) {
  return {
    supportPrincipalEmailHash: stableHash(input.supportPrincipalEmail),
    ticketIdHash: stableHash(input.ticketId),
    scopeCount: input.scopes.length,
    scopes: input.scopes,
    dataAccessLevel: input.dataAccessLevel,
    expiresAt: input.expiresAt.toISOString(),
  };
}

function getDemoState() {
  if (!globalForSupportAccess.hrOneSupportAccessDemoState) {
    resetSupportAccessDemoState();
  }
  return globalForSupportAccess.hrOneSupportAccessDemoState!;
}

function assertOwner(session: SessionLike) {
  if (session.role !== "owner") {
    throw new Error("Only owner can manage support access.");
  }
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
