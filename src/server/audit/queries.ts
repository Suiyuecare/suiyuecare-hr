import { Prisma } from "@prisma/client";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getAuditDemoState, type DemoAuditLogEntry } from "./demo-store";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
};

export type AuditLogView = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  beforeHash: string | null;
  afterHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export async function getAuditLogs(session: SessionLike, limit = 25): Promise<AuditLogView[]> {
  assertPermission(session.role, "audit:read");
  if (!canUseDatabase(session)) {
    return getAuditDemoState().logs.slice(0, limit).map(mapDemoAuditLog);
  }

  try {
    const logs = await getDb().auditLog.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      include: {
        actorUser: true,
        actorEmployee: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actorName: log.actorEmployee?.displayName ?? log.actorUser?.displayName ?? "System",
      beforeHash: log.beforeHash,
      afterHash: log.afterHash,
      metadata: jsonObject(log.metadataJson),
      createdAt: log.createdAt,
    }));
  } catch {
    return getAuditDemoState().logs.slice(0, limit).map(mapDemoAuditLog);
  }
}

function mapDemoAuditLog(log: DemoAuditLogEntry): AuditLogView {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    actorName: log.actorName,
    beforeHash: log.beforeHash,
    afterHash: log.afterHash,
    metadata: log.metadataJson,
    createdAt: log.createdAt,
  };
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
