import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateWorktimeAgreementSettings } from "@/server/attendance/worktime-agreements";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const session = await requireTenantSession({ permission: "employee:write" });
    await updateWorktimeAgreementSettings(session, {
      approvalType: readString(formData.get("approvalType")),
      approvalOnFile: formData.get("approvalOnFile") === "on",
      evidenceRef: readString(formData.get("evidenceRef")),
      effectiveFrom: readString(formData.get("effectiveFrom")),
      effectiveTo: readString(formData.get("effectiveTo")),
      monthlyOvertimeLimitMinutes: readHoursAsMinutes(formData.get("monthlyOvertimeLimitHours")),
      threeMonthOvertimeLimitMinutes: readHoursAsMinutes(formData.get("threeMonthOvertimeLimitHours")),
      localAuthorityReportRequired: formData.get("localAuthorityReportRequired") === "on",
      localAuthorityReportFiled: formData.get("localAuthorityReportFiled") === "on",
      verificationStatus: readString(formData.get("verificationStatus")),
      verificationNote: readString(formData.get("verificationNote")),
    });

    return NextResponse.redirect(new URL("/hr/worktime-agreements", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update worktime agreement settings.";
    return NextResponse.redirect(
      new URL(`/hr/worktime-agreements?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}

function readHoursAsMinutes(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 60) : undefined;
}
