import type { Prisma } from "@prisma/client";
import { stableHash } from "@/server/audit/redaction";
import type { AttachmentMetadata, FormField } from "./types";

export type AttachmentInput = Partial<AttachmentMetadata>;

const allowedScanStatuses = new Set<AttachmentMetadata["scanStatus"]>([
  "not_required",
  "pending",
  "clean",
  "blocked",
]);

export function normalizeAttachmentMetadata(input: AttachmentInput): AttachmentMetadata | null {
  const fileName = sanitizeText(input.fileName);
  const storageKey = sanitizeNullableText(input.storageKey);
  if (!fileName && !storageKey) {
    return null;
  }

  const mimeType = sanitizeText(input.mimeType) || "application/octet-stream";
  const fileSizeBytes = Number.isFinite(input.fileSizeBytes)
    ? Math.max(0, Math.round(Number(input.fileSizeBytes)))
    : 0;
  const scanStatus = allowedScanStatuses.has(input.scanStatus as AttachmentMetadata["scanStatus"])
    ? (input.scanStatus as AttachmentMetadata["scanStatus"])
    : "pending";

  return {
    fileName: fileName || "attached-evidence",
    mimeType,
    fileSizeBytes,
    storageKey,
    scanStatus,
  };
}

export function readAttachmentMetadata(value: Prisma.JsonValue | null | undefined): AttachmentMetadata[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeAttachmentMetadata(readAttachmentObject(item)))
    .filter((item): item is AttachmentMetadata => Boolean(item));
}

export function flattenFormAttachments(
  fields: FormField[],
  attachmentsByField: Record<string, AttachmentMetadata[] | undefined> | undefined,
) {
  if (!attachmentsByField) {
    return [];
  }

  return fields
    .filter((field) => field.type === "file")
    .flatMap((field) => attachmentsByField[field.id] ?? []);
}

export function summarizeAttachmentsForDisplay(attachments: AttachmentMetadata[]) {
  if (attachments.length === 0) {
    return "No attachment evidence";
  }

  const blocked = attachments.filter((item) => item.scanStatus === "blocked").length;
  const pending = attachments.filter((item) => item.scanStatus === "pending").length;
  if (blocked > 0) {
    return `${attachments.length} attachment reference(s) · ${blocked} blocked`;
  }
  if (pending > 0) {
    return `${attachments.length} attachment reference(s) · ${pending} pending scan`;
  }
  return `${attachments.length} attachment reference(s)`;
}

export function summarizeAttachmentsForAudit(attachments: AttachmentMetadata[]) {
  return {
    attachmentCount: attachments.length,
    attachmentHashes: attachments.map((item) =>
      stableHash({
        fileName: item.fileName,
        storageKey: item.storageKey,
        mimeType: item.mimeType,
        fileSizeBytes: item.fileSizeBytes,
      }),
    ),
    scanStatuses: attachments.map((item) => item.scanStatus),
    rawAttachmentMetadataStored: false,
  };
}

function readAttachmentObject(value: Prisma.JsonValue): AttachmentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, Prisma.JsonValue>;
  return {
    fileName: readString(record.fileName),
    mimeType: readString(record.mimeType),
    fileSizeBytes: readNumber(record.fileSizeBytes),
    storageKey: readNullableString(record.storageKey),
    scanStatus: readString(record.scanStatus) as AttachmentMetadata["scanStatus"],
  };
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 255) : "";
}

function sanitizeNullableText(value: unknown) {
  const text = sanitizeText(value);
  return text || null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
