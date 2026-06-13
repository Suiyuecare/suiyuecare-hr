import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { saveLaborRosterProfile, type LaborRosterVerificationStatus } from "@/server/employees/labor-roster";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await saveLaborRosterProfile(await requireTenantSession({ permission: "labor_roster:manage" }), {
      employeeId: readString(formData.get("employeeId")),
      legalName: readString(formData.get("legalName")),
      nationalId: readString(formData.get("nationalId")),
      birthDate: parseOptionalDate(formData.get("birthDate")),
      gender: readString(formData.get("gender")),
      nationality: readString(formData.get("nationality")) || "TW",
      registeredAddress: readString(formData.get("registeredAddress")),
      emergencyContact: readString(formData.get("emergencyContact")),
      educationSummary: readString(formData.get("educationSummary")) || null,
      workExperienceSummary: readString(formData.get("workExperienceSummary")) || null,
      rosterSourceRef: readString(formData.get("rosterSourceRef")) || null,
      verificationStatus: readVerificationStatus(formData.get("verificationStatus")),
    });
    return NextResponse.redirect(new URL("/hr/labor-roster", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update labor roster.";
    return NextResponse.redirect(
      new URL(`/hr/labor-roster?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid birth date.");
  return date;
}

function readVerificationStatus(value: FormDataEntryValue | null): LaborRosterVerificationStatus {
  const raw = readString(value);
  if (raw === "verified" || raw === "needs_review" || raw === "unverified") return raw;
  return "unverified";
}
