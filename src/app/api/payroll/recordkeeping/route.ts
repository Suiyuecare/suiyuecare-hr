import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updatePayrollRecordkeepingSettings } from "@/server/payroll/recordkeeping";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const session = await requireTenantSession({ permission: "payroll:manage" });
    await updatePayrollRecordkeepingSettings(session, {
      wageRosterRetentionDays: readNumber(formData.get("wageRosterRetentionDays")),
      employeePayslipEnabled: formData.get("employeePayslipEnabled") === "on",
      wageCalculationDetailsEnabled: formData.get("wageCalculationDetailsEnabled") === "on",
      laborInspectionExportEnabled: formData.get("laborInspectionExportEnabled") === "on",
    });

    return NextResponse.redirect(new URL("/hr/payroll-recordkeeping", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update payroll recordkeeping settings.";
    return NextResponse.redirect(
      new URL(`/hr/payroll-recordkeeping?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
