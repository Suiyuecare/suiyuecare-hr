import type { PunchSource } from "@/server/workflows/types";

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseText(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

