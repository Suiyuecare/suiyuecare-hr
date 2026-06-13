import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updatePayrollAccountingSettings } from "@/server/payroll/accounting-settings";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await updatePayrollAccountingSettings(await requireTenantSession({ permission: "payroll:manage" }), {
      grossPayrollDebitAccountCode: readString(formData.get("grossPayrollDebitAccountCode")),
      grossPayrollDebitAccountName: readString(formData.get("grossPayrollDebitAccountName")),
      employerContributionDebitAccountCode: readString(formData.get("employerContributionDebitAccountCode")),
      employerContributionDebitAccountName: readString(formData.get("employerContributionDebitAccountName")),
      deductionCreditAccountCode: readString(formData.get("deductionCreditAccountCode")),
      deductionCreditAccountName: readString(formData.get("deductionCreditAccountName")),
      netPayableCreditAccountCode: readString(formData.get("netPayableCreditAccountCode")),
      netPayableCreditAccountName: readString(formData.get("netPayableCreditAccountName")),
    });
    return NextResponse.redirect(new URL("/hr/payroll-accounting", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update payroll accounting settings.";
    return NextResponse.redirect(
      new URL(`/hr/payroll-accounting?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
