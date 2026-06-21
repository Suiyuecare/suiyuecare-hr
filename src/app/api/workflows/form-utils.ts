import type { PunchSource } from "@/server/workflows/types";
import { normalizeAttachmentMetadata, type AttachmentInput } from "@/server/workflows/attachments";

export function parsePunchSource(value: FormDataEntryValue | null): PunchSource {
  return value === "web" || value === "manual" || value === "mobile" ? value : "mobile";
}

export function parseDateTime(
  dateValue: FormDataEntryValue | null,
  timeValue: FormDataEntryValue | null,
) {
  return combineDateAndTime(parseDate(dateValue), parseOptionalTime(timeValue) ?? "09:00");
}

export function parseDate(value: FormDataEntryValue | null) {
  const text = typeof value === "string" && value ? value : todayInputValue();
  return new Date(`${text}T00:00:00`);
}

export function parseOptionalTime(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  return value;
}

export function combineDateAndTime(date: Date, time: string) {
  return new Date(`${toInputDate(date)}T${time}:00`);
}

export function parseNumber(value: FormDataEntryValue | null, fallback: number) {
  if (value === null) {
    return fallback;
  }
  if (typeof value === "string" && !value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseText(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function parseAttachmentMetadata(
  formData: FormData,
  prefix: string,
): ReturnType<typeof normalizeAttachmentMetadata> {
  const input: AttachmentInput = {
    fileName: parseOptionalText(formData.get(`${prefix}FileName`)) ?? undefined,
    mimeType: parseOptionalText(formData.get(`${prefix}MimeType`)) ?? undefined,
    fileSizeBytes: parseNumber(formData.get(`${prefix}FileSizeBytes`), 0),
    storageKey: parseOptionalText(formData.get(`${prefix}StorageKey`)) ?? undefined,
    scanStatus: (parseOptionalText(formData.get(`${prefix}ScanStatus`)) ?? undefined) as AttachmentInput["scanStatus"],
  };
  return normalizeAttachmentMetadata(input);
}

export function parseOptionalText(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseTelemetryStartedAt(value: FormDataEntryValue | null) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayInputValue() {
  return toInputDate(new Date());
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
