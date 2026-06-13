import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateStatutoryInsuranceRecord } from "@/server/insurance/statutory";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await updateStatutoryInsuranceRecord(await requireTenantSession({ permission: "payroll:manage" }), {
      employeeId: readString(formData.get("employeeId")),
      insuranceType: readString(formData.get("insuranceType")),
      status: readString(formData.get("status")),
      effectiveDate: readDate(formData.get("effectiveDate")),
      evidenceRef: readString(formData.get("evidenceRef")),
      exemptionReason: readString(formData.get("exemptionReason")),
      notes: readString(formData.get("notes")),
    });
    return NextResponse.redirect(new URL("/hr/insurance", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update statutory insurance.";
    return NextResponse.redirect(new URL(`/hr/insurance?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readDate(value: FormDataEntryValue | null) {
  const text = readString(value);
  return text ? new Date(`${text}T00:00:00.000Z`) : null;
}
