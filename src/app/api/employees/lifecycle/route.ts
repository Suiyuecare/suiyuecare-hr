import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { recordLifecycleEvent, type LifecycleEventType } from "@/server/employees/lifecycle";
import type { PensionScheme, TerminationReasonCategory } from "@/server/employees/termination-compliance";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await recordLifecycleEvent(await requireTenantSession({ permission: "employee:write" }), {
      employeeId: readString(formData.get("employeeId")),
      eventType: readEventType(formData.get("eventType")),
      effectiveDate: parseDate(formData.get("effectiveDate")),
      reason: readString(formData.get("reason")),
      nextDepartmentId: readOptionalString(formData.get("nextDepartmentId")),
      nextJobTitle: readOptionalString(formData.get("nextJobTitle")),
      terminationReasonCategory: readTerminationReasonCategory(formData.get("terminationReasonCategory")),
      pensionScheme: readPensionScheme(formData.get("pensionScheme")),
      averageMonthlyWage: parseOptionalNumber(formData.get("averageMonthlyWage")),
    });
    return NextResponse.redirect(new URL("/hr/employee-lifecycle", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record employee lifecycle event.";
    return NextResponse.redirect(
      new URL(`/hr/employee-lifecycle?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: FormDataEntryValue | null) {
  const text = readString(value);
  return text || null;
}

function readEventType(value: FormDataEntryValue | null): LifecycleEventType {
  const text = readString(value);
  if (text === "promotion" || text === "leave" || text === "return" || text === "termination") {
    return text;
  }
  return "transfer";
}

function readTerminationReasonCategory(value: FormDataEntryValue | null): TerminationReasonCategory {
  const text = readString(value);
  if (
    text === "resignation" ||
    text === "layoff" ||
    text === "misconduct" ||
    text === "retirement" ||
    text === "contract_end" ||
    text === "other"
  ) {
    return text;
  }
  return "other";
}

function readPensionScheme(value: FormDataEntryValue | null): PensionScheme {
  return readString(value) === "labor_standards_old" ? "labor_standards_old" : "labor_pension_new";
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const text = readString(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  const date = raw ? new Date(`${raw}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid effective date.");
  }
  return date;
}
