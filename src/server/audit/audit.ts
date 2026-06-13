import type { AuditAction, Prisma, PrismaClient } from "@prisma/client";
import { redactSensitivePayload, stableHash } from "./redaction";

type AuditInput = {
  tenantId: string;
  companyId: string;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

type TxClient = Prisma.TransactionClient | PrismaClient;

export async function writeAuditLog(db: TxClient, input: AuditInput) {
  const metadataJson = redactSensitivePayload(
    input.metadata ?? {},
  ) as Prisma.InputJsonValue;

  return db.auditLog.create({
    data: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      actorUserId: input.actorUserId ?? null,
      actorEmployeeId: input.actorEmployeeId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeHash: input.before ? stableHash(redactSensitivePayload(input.before)) : null,
      afterHash: input.after ? stableHash(redactSensitivePayload(input.after)) : null,
      metadataJson,
    },
  });
}
