import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updatePayrollPaymentSecuritySettings } from "@/server/payroll/payment-security";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const session = await requireTenantSession({ permission: "payroll:manage" });
    await updatePayrollPaymentSecuritySettings(session, {
      tokenVaultProvider: readString(formData.get("tokenVaultProvider")),
      tokenVaultRef: readString(formData.get("tokenVaultRef")),
      kmsKeyRef: readString(formData.get("kmsKeyRef")),
      bankFileFormat: readString(formData.get("bankFileFormat")),
      bankFormatVersion: readString(formData.get("bankFormatVersion")),
      bankFileColumnOrder: readColumnOrder(formData.get("bankFileColumnOrder")),
      bankFormatVerified: formData.get("bankFormatVerified") === "on",
      verificationStatus: readString(formData.get("verificationStatus")) as "unverified" | "verified" | "failed",
      verificationNote: readString(formData.get("verificationNote")),
    });

    return NextResponse.redirect(new URL("/hr/payroll-payment-security", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update payment security settings.";
    return NextResponse.redirect(
      new URL(`/hr/payroll-payment-security?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readColumnOrder(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean) as Array<
      | "employee_no"
      | "employee_name"
      | "bank_code"
      | "branch_code"
      | "account_token_ref"
      | "amount"
      | "currency"
      | "memo"
    >;
}
