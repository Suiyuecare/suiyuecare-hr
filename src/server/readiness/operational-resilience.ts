import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type OperationalResilienceSettings = {
  backupProvider: string;
  backupRegion: string | null;
  backupSchedule: "hourly" | "daily" | "weekly";
  backupRetentionDays: number;
  backupEncryptionKeyRef: string | null;
  backupEnabled: boolean;
  lastBackupCompletedAt: Date | null;
  restoreDrillTestedAt: Date | null;
  restoreDrillStatus: "not_tested" | "failed" | "passed";
  restoreDrillTicket: string | null;
  recoveryTimeObjectiveHours: number;
  recoveryPointObjectiveHours: number;
  verificationStatus: "unverified" | "verified";
  verificationNote: string | null;
};

export type OperationalResilienceReadiness = {
  ready: boolean;
  detail: string;
  missing: string[];
  settings: OperationalResilienceSettings;
};

const maximumRestoreDrillAgeDays = 90;
const minimumBackupRetentionDays = 30;

const defaultSettings: OperationalResilienceSettings = {
  backupProvider: "not_configured",
  backupRegion: null,
  backupSchedule: "daily",
  backupRetentionDays: 0,
  backupEncryptionKeyRef: null,
  backupEnabled: false,
  lastBackupCompletedAt: null,
  restoreDrillTestedAt: null,
  restoreDrillStatus: "not_tested",
  restoreDrillTicket: null,
  recoveryTimeObjectiveHours: 24,
  recoveryPointObjectiveHours: 24,
  verificationStatus: "unverified",
  verificationNote: null,
};

const globalForOperationalResilience = globalThis as unknown as {
  hrOneOperationalResilienceDemoState?: OperationalResilienceSettings;
};

export function resetOperationalResilienceDemoState() {
  globalForOperationalResilience.hrOneOperationalResilienceDemoState = { ...defaultSettings };
}

export async function getOperationalResilienceSettings(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    try {
      const row = await getDb().companyOperationalResilienceSetting.findUnique({
        where: { companyId: session.companyId! },
      });
      return row ? mapSettings(row) : defaultSettings;
    } catch {
      return getDemoState();
    }
  }
  return getDemoState();
}

export async function getOperationalResilienceReadiness(session: SessionLike) {
  return evaluateOperationalResilienceReadiness(await getOperationalResilienceSettings(session));
}

export async function updateOperationalResilienceSettings(
  session: SessionLike,
  input: Partial<OperationalResilienceSettings>,
) {
  assertPermission(session.role, "settings:write");
  const before = await getOperationalResilienceSettings(session);
  const after = normalizeSettings(input, before);

  if (canUseDatabase(session)) {
    try {
      const db = getDb();
      return await db.$transaction(async (tx) => {
        const existing = await tx.companyOperationalResilienceSetting.findUnique({
          where: { companyId: session.companyId! },
        });
        const saved = await tx.companyOperationalResilienceSetting.upsert({
          where: { companyId: session.companyId! },
          create: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            updatedByUserId: session.user?.id,
            ...dbData(after),
          },
          update: {
            updatedByUserId: session.user?.id,
            ...dbData(after),
          },
        });
        await writeAuditLog(tx, {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          actorUserId: session.user?.id,
          actorEmployeeId: session.employee?.id,
          action: existing ? "update" : "create",
          entityType: "operational_resilience_settings",
          entityId: saved.id,
          before,
          after,
          metadata: auditMetadata(after),
        });
        return mapSettings(saved);
      });
    } catch {
      return saveDemoSettings(session, before, after);
    }
  }

  return saveDemoSettings(session, before, after);
}

export function evaluateOperationalResilienceReadiness(
  settings: OperationalResilienceSettings,
  now = new Date(),
): OperationalResilienceReadiness {
  const missing = [
    !settings.backupEnabled ? "enabled backups" : null,
    settings.backupProvider === "not_configured" ? "backup provider" : null,
    settings.backupRetentionDays < minimumBackupRetentionDays ? "30+ day retention" : null,
    !settings.backupEncryptionKeyRef ? "backup encryption key reference" : null,
    !settings.lastBackupCompletedAt ? "last backup completion evidence" : null,
    settings.restoreDrillStatus !== "passed" ? "passed restore drill" : null,
    !settings.restoreDrillTestedAt || daysSince(settings.restoreDrillTestedAt, now) > maximumRestoreDrillAgeDays
      ? "recent restore drill evidence"
      : null,
    !settings.restoreDrillTicket ? "restore drill ticket" : null,
    settings.verificationStatus !== "verified" ? "verified operational resilience status" : null,
  ].filter((item): item is string => Boolean(item));
  return {
    ready: missing.length === 0,
    missing,
    settings,
    detail: missing.length === 0
      ? `${settings.backupProvider}; ${settings.backupRetentionDays} day retention; restore drill passed ${daysSince(settings.restoreDrillTestedAt, now)} day(s) ago.`
      : `Missing ${missing.join(", ")}.`,
  };
}

function getDemoState() {
  if (!globalForOperationalResilience.hrOneOperationalResilienceDemoState) {
    resetOperationalResilienceDemoState();
  }
  return globalForOperationalResilience.hrOneOperationalResilienceDemoState!;
}

function saveDemoSettings(
  session: SessionLike,
  before: OperationalResilienceSettings,
  after: OperationalResilienceSettings,
) {
  globalForOperationalResilience.hrOneOperationalResilienceDemoState = after;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "update",
    entityType: "operational_resilience_settings",
    entityId: "demo-operational-resilience",
    before,
    after,
    metadata: auditMetadata(after),
  });
  return after;
}

function normalizeSettings(
  input: Partial<OperationalResilienceSettings>,
  before: OperationalResilienceSettings,
): OperationalResilienceSettings {
  return {
    backupProvider: cleanText(input.backupProvider) ?? before.backupProvider,
    backupRegion: cleanOptionalText(input.backupRegion) ?? before.backupRegion,
    backupSchedule: normalizeSchedule(input.backupSchedule ?? before.backupSchedule),
    backupRetentionDays: clampInteger(input.backupRetentionDays, before.backupRetentionDays, 0, 3650),
    backupEncryptionKeyRef: cleanOptionalText(input.backupEncryptionKeyRef) ?? before.backupEncryptionKeyRef,
    backupEnabled: input.backupEnabled ?? before.backupEnabled,
    lastBackupCompletedAt: normalizeDate(input.lastBackupCompletedAt, before.lastBackupCompletedAt),
    restoreDrillTestedAt: normalizeDate(input.restoreDrillTestedAt, before.restoreDrillTestedAt),
    restoreDrillStatus: normalizeRestoreStatus(input.restoreDrillStatus ?? before.restoreDrillStatus),
    restoreDrillTicket: cleanOptionalText(input.restoreDrillTicket) ?? before.restoreDrillTicket,
    recoveryTimeObjectiveHours: clampInteger(input.recoveryTimeObjectiveHours, before.recoveryTimeObjectiveHours, 1, 168),
    recoveryPointObjectiveHours: clampInteger(input.recoveryPointObjectiveHours, before.recoveryPointObjectiveHours, 1, 168),
    verificationStatus: input.verificationStatus === "verified" ? "verified" : "unverified",
    verificationNote: cleanOptionalText(input.verificationNote) ?? before.verificationNote,
  };
}

function mapSettings(row: {
  backupProvider: string;
  backupRegion: string | null;
  backupSchedule: string;
  backupRetentionDays: number;
  backupEncryptionKeyRef: string | null;
  backupEnabled: boolean;
  lastBackupCompletedAt: Date | null;
  restoreDrillTestedAt: Date | null;
  restoreDrillStatus: string;
  restoreDrillTicket: string | null;
  recoveryTimeObjectiveHours: number;
  recoveryPointObjectiveHours: number;
  verificationStatus: string;
  verificationNote: string | null;
}): OperationalResilienceSettings {
  return {
    backupProvider: row.backupProvider,
    backupRegion: row.backupRegion,
    backupSchedule: normalizeSchedule(row.backupSchedule),
    backupRetentionDays: row.backupRetentionDays,
    backupEncryptionKeyRef: row.backupEncryptionKeyRef,
    backupEnabled: row.backupEnabled,
    lastBackupCompletedAt: row.lastBackupCompletedAt,
    restoreDrillTestedAt: row.restoreDrillTestedAt,
    restoreDrillStatus: normalizeRestoreStatus(row.restoreDrillStatus),
    restoreDrillTicket: row.restoreDrillTicket,
    recoveryTimeObjectiveHours: row.recoveryTimeObjectiveHours,
    recoveryPointObjectiveHours: row.recoveryPointObjectiveHours,
    verificationStatus: row.verificationStatus === "verified" ? "verified" : "unverified",
    verificationNote: row.verificationNote,
  };
}

function dbData(settings: OperationalResilienceSettings) {
  return {
    backupProvider: settings.backupProvider,
    backupRegion: settings.backupRegion,
    backupSchedule: settings.backupSchedule,
    backupRetentionDays: settings.backupRetentionDays,
    backupEncryptionKeyRef: settings.backupEncryptionKeyRef,
    backupEnabled: settings.backupEnabled,
    lastBackupCompletedAt: settings.lastBackupCompletedAt,
    restoreDrillTestedAt: settings.restoreDrillTestedAt,
    restoreDrillStatus: settings.restoreDrillStatus,
    restoreDrillTicket: settings.restoreDrillTicket,
    recoveryTimeObjectiveHours: settings.recoveryTimeObjectiveHours,
    recoveryPointObjectiveHours: settings.recoveryPointObjectiveHours,
    verificationStatus: settings.verificationStatus,
    verificationNote: settings.verificationNote,
  };
}

function auditMetadata(settings: OperationalResilienceSettings) {
  return {
    backupProvider: settings.backupProvider,
    backupSchedule: settings.backupSchedule,
    backupRetentionDays: settings.backupRetentionDays,
    backupEnabled: settings.backupEnabled,
    hasEncryptionKeyRef: Boolean(settings.backupEncryptionKeyRef),
    hasRestoreDrillTicket: Boolean(settings.restoreDrillTicket),
    restoreDrillStatus: settings.restoreDrillStatus,
    verificationStatus: settings.verificationStatus,
    recoveryTimeObjectiveHours: settings.recoveryTimeObjectiveHours,
    recoveryPointObjectiveHours: settings.recoveryPointObjectiveHours,
  };
}

function normalizeSchedule(value: string) {
  if (value === "hourly" || value === "weekly") return value;
  return "daily";
}

function normalizeRestoreStatus(value: string) {
  if (value === "passed" || value === "failed") return value;
  return "not_tested";
}

function cleanText(value: string | null | undefined) {
  const text = cleanOptionalText(value);
  return text && text.length > 0 ? text.slice(0, 120) : null;
}

function cleanOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : null;
}

function normalizeDate(value: Date | null | undefined, fallback: Date | null) {
  if (!value) return fallback;
  return Number.isNaN(value.getTime()) ? fallback : value;
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function daysSince(value: Date | null, now: Date) {
  if (!value) return Number.POSITIVE_INFINITY;
  const startNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startValue = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.floor((startNow - startValue) / 86_400_000);
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
