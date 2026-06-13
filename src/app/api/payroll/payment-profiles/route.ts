import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { savePaymentProfile } from "@/server/payroll/payment-profiles";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await savePaymentProfile(await requireTenantSession({ permission: "payroll:manage" }), {
      employeeId: readString(formData.get("employeeId")),
      bankCode: readString(formData.get("bankCode")),
      bankBranchCode: readOptionalString(formData.get("bankBranchCode")),
      accountName: readString(formData.get("accountName")),
      accountNumber: readString(formData.get("accountNumber")),
      effectiveFrom: parseDate(formData.get("effectiveFrom")),
    });
    return NextResponse.redirect(new URL("/hr/payment-profiles", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save payment profile.";
    return NextResponse.redirect(
      new URL(`/hr/payment-profiles?error=${encodeURIComponent(message)}`, request.url),
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

function parseDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  const date = raw ? new Date(`${raw}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid effective date.");
  }
  return date;
}
