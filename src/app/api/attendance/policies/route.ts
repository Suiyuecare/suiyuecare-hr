import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { saveAttendancePolicySettings } from "@/server/attendance/policies";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await saveAttendancePolicySettings(await requireTenantSession({ permission: "settings:write" }), {
      id: readString(formData.get("id")) || null,
      name: readString(formData.get("name")),
      status: readString(formData.get("status")) === "inactive" ? "inactive" : "active",
      regularDailyMinutes: readNumber(formData.get("regularDailyMinutes")) ?? 0,
      overtimeWarningDailyMinutes: readNumber(formData.get("overtimeWarningDailyMinutes")) ?? 0,
      clockInGraceMinutes: readNumber(formData.get("clockInGraceMinutes")) ?? 0,
      clockOutGraceMinutes: readNumber(formData.get("clockOutGraceMinutes")) ?? 0,
      requireOvertimeApproval: formData.get("requireOvertimeApproval") === "on",
      requirePunchCorrectionApproval: formData.get("requirePunchCorrectionApproval") === "on",
      allowMobilePunch: formData.get("allowMobilePunch") === "on",
      effectiveFrom: parseDate(formData.get("effectiveFrom")),
    });
    return NextResponse.redirect(new URL("/hr/attendance-policies", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save attendance policy.";
    return NextResponse.redirect(
      new URL(`/hr/attendance-policies?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  return raw ? new Date(`${raw}T00:00:00+08:00`) : new Date(Number.NaN);
}
