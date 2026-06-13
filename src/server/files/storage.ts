import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, hasPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type FileStorageProvider = "demo_object_storage" | "s3" | "r2" | "gcs" | "azure_blob" | "custom";

export type FileStorageSettings = {
  provider: FileStorageProvider;
  bucketName: string;
  region: string | null;
  basePrefix: string;
  kmsKeyRef: string | null;
  malwareScanningRequired: boolean;
  signedUrlTtlMinutes: number;
  maxFileSizeMb: number;
  allowedMimeTypes: string[];
  retentionDays: number;
  verificationStatus: "unverified" | "verified" | "failed";
  lastVerifiedAt: Date | null;
  verificationNote: string | null;
};

export type FileStorageSettingsInput = Partial<FileStorageSettings>;

export type ObjectReservationInput = {
  employeeId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  category: string;
};

export type ObjectReservation = {
  storageKey: string;
  storageProvider: FileStorageProvider;
  storageBucket: string;
  objectKey: string;
  checksumSha256: string | null;
  malwareScanStatus: "pending" | "not_required";
  encryptionMode: "provider_managed" | "kms";
  retentionUntil: Date;
  downloadAuditRequired: boolean;
};

type FileStorageDemoState = {
  settings: FileStorageSettings;
};

export const defaultFileStorageSettings: FileStorageSettings = {
  provider: "demo_object_storage",
  bucketName: "hr-one-demo-vault",
  region: "tw-demo",
  basePrefix: "hr-one",
  kmsKeyRef: null,
  malwareScanningRequired: true,
  signedUrlTtlMinutes: 10,
  maxFileSizeMb: 25,
  allowedMimeTypes: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/csv",
  ],
  retentionDays: 2555,
  verificationStatus: "unverified",
  lastVerifiedAt: null,
  verificationNote: null,
};

const globalForFileStorage = globalThis as unknown as {
  hrOneFileStorageDemoState?: FileStorageDemoState;
};

export async function getFileStorageSettings(session: SessionLike) {
  assertReadableStorageSettings(session.role);
  if (canUseDatabase(session)) {
    try {
      const record = await getDb().companyFileStorageSetting.findUnique({
        where: { companyId: session.companyId },
      });
      return record ? readRecord(record) : defaultFileStorageSettings;
    } catch {
      return getDemoState().settings;
    }
  }
  return getDemoState().settings;
}

export async function updateFileStorageSettings(session: SessionLike, input: FileStorageSettingsInput) {
  assertPermission(session.role, "settings:write");
  const before = await getFileStorageSettings(session);
  const normalized = normalizeSettings(input, before);

  if (canUseDatabase(session)) {
    try {
      return updateDbSettings(session, before, normalized);
    } catch {
      return updateDemoSettings(session, before, normalized);
    }
  }
  return updateDemoSettings(session, before, normalized);
}

export async function reserveObjectForUpload(
  session: SessionLike,
  input: ObjectReservationInput,
): Promise<ObjectReservation> {
  const settings = await getFileStorageSettings(session);
  const fileSizeLimit = settings.maxFileSizeMb * 1024 * 1024;
  if (input.fileSizeBytes > fileSizeLimit) {
    throw new Error(`File exceeds configured ${settings.maxFileSizeMb} MB storage limit.`);
  }
  if (!settings.allowedMimeTypes.includes(input.mimeType)) {
    throw new Error("File type is not allowed by company storage policy.");
  }

  const safeFileName = cleanPathSegment(input.fileName) || "document";
  const objectId = crypto.randomUUID();
  const objectKey = [
    settings.basePrefix || "hr-one",
    session.tenantId ?? "demo-tenant",
    session.companyId ?? "demo-company",
    "employees",
    cleanPathSegment(input.employeeId),
    cleanPathSegment(input.category) || "document",
    objectId,
    safeFileName,
  ].join("/");
  const storageBucket = settings.bucketName;
  const storageKey = `${settings.provider}://${storageBucket}/${objectKey}`;
  const retentionUntil = addDays(new Date(), settings.retentionDays);

  return {
    storageKey,
    storageProvider: settings.provider,
    storageBucket,
    objectKey,
    checksumSha256: null,
    malwareScanStatus: settings.malwareScanningRequired ? "pending" : "not_required",
    encryptionMode: settings.kmsKeyRef ? "kms" : "provider_managed",
    retentionUntil,
    downloadAuditRequired: true,
  };
}

export function resetFileStorageDemoState() {
  globalForFileStorage.hrOneFileStorageDemoState = {
    settings: { ...defaultFileStorageSettings, allowedMimeTypes: [...defaultFileStorageSettings.allowedMimeTypes] },
  };
}

function getDemoState() {
  if (!globalForFileStorage.hrOneFileStorageDemoState) {
    resetFileStorageDemoState();
  }
  return globalForFileStorage.hrOneFileStorageDemoState!;
}

async function updateDbSettings(
  session: SessionLike & { tenantId: string; companyId: string },
  before: FileStorageSettings,
  normalized: FileStorageSettings,
) {
  const updated = await getDb().$transaction(async (tx) => {
    const record = await tx.companyFileStorageSetting.upsert({
      where: { companyId: session.companyId },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        ...writeRecord(normalized),
        updatedByUserId: session.user?.id,
      },
      update: {
        ...writeRecord(normalized),
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "file_storage_settings",
      entityId: record.id,
      before,
      after: normalized,
      metadata: auditMetadata(before, normalized),
    });
    return record;
  });
  return readRecord(updated);
}

function updateDemoSettings(
  session: SessionLike,
  before: FileStorageSettings,
  normalized: FileStorageSettings,
) {
  getDemoState().settings = normalized;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "file_storage_settings",
    entityId: "demo-file-storage-settings",
    before,
    after: normalized,
    metadata: auditMetadata(before, normalized),
  });
  return normalized;
}

function auditMetadata(before: FileStorageSettings, after: FileStorageSettings) {
  return {
    changedFields: changedFields(before, after),
    objectBytesIncluded: false,
    malwareScanningRequired: after.malwareScanningRequired,
    providerChanged: before.provider !== after.provider,
    verificationStatus: after.verificationStatus,
  };
}

function normalizeSettings(input: FileStorageSettingsInput, before: FileStorageSettings): FileStorageSettings {
  return {
    provider: normalizeProvider(input.provider, before.provider),
    bucketName: cleanStorageName(input.bucketName, before.bucketName),
    region: input.region === undefined ? before.region : cleanOptional(input.region),
    basePrefix: cleanPrefix(input.basePrefix, before.basePrefix),
    kmsKeyRef: input.kmsKeyRef === undefined ? before.kmsKeyRef : cleanOptional(input.kmsKeyRef),
    malwareScanningRequired: input.malwareScanningRequired ?? before.malwareScanningRequired,
    signedUrlTtlMinutes: clampInteger(input.signedUrlTtlMinutes, before.signedUrlTtlMinutes, 1, 120),
    maxFileSizeMb: clampInteger(input.maxFileSizeMb, before.maxFileSizeMb, 1, 100),
    allowedMimeTypes: normalizeMimeTypes(input.allowedMimeTypes ?? before.allowedMimeTypes),
    retentionDays: clampInteger(input.retentionDays, before.retentionDays, 30, 3650),
    verificationStatus: normalizeVerificationStatus(input.verificationStatus, before.verificationStatus),
    lastVerifiedAt: normalizeVerificationStatus(input.verificationStatus, before.verificationStatus) === "verified"
      ? input.lastVerifiedAt ?? before.lastVerifiedAt ?? new Date()
      : null,
    verificationNote: input.verificationNote === undefined
      ? before.verificationNote
      : cleanOptional(input.verificationNote),
  };
}

function readRecord(record: {
  provider: string;
  bucketName: string;
  region: string | null;
  basePrefix: string;
  kmsKeyRef: string | null;
  malwareScanningRequired: boolean;
  signedUrlTtlMinutes: number;
  maxFileSizeMb: number;
  allowedMimeTypesJson: Prisma.JsonValue;
  retentionDays: number;
  verificationStatus: string;
  lastVerifiedAt: Date | null;
  verificationNote: string | null;
}): FileStorageSettings {
  return {
    provider: normalizeProvider(record.provider, "demo_object_storage"),
    bucketName: record.bucketName,
    region: record.region,
    basePrefix: record.basePrefix,
    kmsKeyRef: record.kmsKeyRef,
    malwareScanningRequired: record.malwareScanningRequired,
    signedUrlTtlMinutes: record.signedUrlTtlMinutes,
    maxFileSizeMb: record.maxFileSizeMb,
    allowedMimeTypes: Array.isArray(record.allowedMimeTypesJson)
      ? record.allowedMimeTypesJson.map(String)
      : defaultFileStorageSettings.allowedMimeTypes,
    retentionDays: record.retentionDays,
    verificationStatus: normalizeVerificationStatus(record.verificationStatus, "unverified"),
    lastVerifiedAt: record.lastVerifiedAt,
    verificationNote: record.verificationNote,
  };
}

function writeRecord(settings: FileStorageSettings) {
  return {
    provider: settings.provider,
    bucketName: settings.bucketName,
    region: settings.region,
    basePrefix: settings.basePrefix,
    kmsKeyRef: settings.kmsKeyRef,
    malwareScanningRequired: settings.malwareScanningRequired,
    signedUrlTtlMinutes: settings.signedUrlTtlMinutes,
    maxFileSizeMb: settings.maxFileSizeMb,
    allowedMimeTypesJson: settings.allowedMimeTypes as Prisma.InputJsonValue,
    retentionDays: settings.retentionDays,
    verificationStatus: settings.verificationStatus,
    lastVerifiedAt: settings.lastVerifiedAt,
    verificationNote: settings.verificationNote,
  };
}

export function isProductionStorageVerified(settings: FileStorageSettings) {
  return (
    settings.provider !== "demo_object_storage" &&
    Boolean(settings.kmsKeyRef) &&
    settings.malwareScanningRequired &&
    settings.verificationStatus === "verified" &&
    Boolean(settings.lastVerifiedAt)
  );
}

function normalizeProvider(value: unknown, fallback: FileStorageProvider): FileStorageProvider {
  const providers: FileStorageProvider[] = ["demo_object_storage", "s3", "r2", "gcs", "azure_blob", "custom"];
  return providers.includes(value as FileStorageProvider) ? value as FileStorageProvider : fallback;
}

function normalizeMimeTypes(values: string[]) {
  const normalized = values
    .flatMap((value) => value.split(/[\s,]+/))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(value));
  return [...new Set(normalized)].slice(0, 30);
}

function cleanStorageName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80);
  return cleaned || fallback;
}

function cleanPrefix(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .trim()
    .split("/")
    .map(cleanPathSegment)
    .filter(Boolean)
    .join("/")
    .slice(0, 120);
  return cleaned || fallback;
}

function cleanOptional(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return cleaned || null;
}

function normalizeVerificationStatus(value: unknown, fallback: FileStorageSettings["verificationStatus"]) {
  return value === "verified" || value === "failed" || value === "unverified" ? value : fallback;
}

function cleanPathSegment(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function changedFields(before: FileStorageSettings, after: FileStorageSettings) {
  return (Object.keys(after) as Array<keyof FileStorageSettings>).filter((key) =>
    JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function assertReadableStorageSettings(role: RoleKey) {
  if (!hasPermission(role, "settings:read") && !hasPermission(role, "employee:write")) {
    throw new Error(`Role ${role} cannot read file storage settings`);
  }
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
