import { redactSensitivePayload, stableHash } from "./redaction";

export type DemoAuditAction =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "approve"
  | "reject"
  | "login"
  | "role_switch";

export type DemoAuditLogEntry = {
  id: string;
  tenantId: string;
  companyId: string;
  actorUserId: string | null;
  actorEmployeeId: string | null;
  actorName: string;
  action: DemoAuditAction;
  entityType: string;
  entityId: string;
  beforeHash: string | null;
  afterHash: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};

type AuditDemoState = {
  logs: DemoAuditLogEntry[];
};

const globalForAudit = globalThis as unknown as {
  hrOneAuditDemoState?: AuditDemoState;
};

export function getAuditDemoState() {
  if (!globalForAudit.hrOneAuditDemoState) {
    globalForAudit.hrOneAuditDemoState = {
      logs: [],
    };
  }
  return globalForAudit.hrOneAuditDemoState;
}

export function resetAuditDemoState() {
  globalForAudit.hrOneAuditDemoState = {
    logs: [],
  };
}

export function writeDemoAuditLog(input: {
  tenantId: string;
  companyId: string;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  actorName?: string | null;
  action: DemoAuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const entry: DemoAuditLogEntry = {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId,
    actorUserId: input.actorUserId ?? null,
    actorEmployeeId: input.actorEmployeeId ?? null,
    actorName: input.actorName ?? "System",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeHash: input.before ? stableHash(redactSensitivePayload(input.before)) : null,
    afterHash: input.after ? stableHash(redactSensitivePayload(input.after)) : null,
    metadataJson: redactSensitivePayload(input.metadata ?? {}),
    createdAt: new Date(),
  };
  getAuditDemoState().logs.unshift(entry);
  return entry;
}
