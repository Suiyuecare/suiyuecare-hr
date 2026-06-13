import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { generatePayrollExport, type PayrollExportType } from "@/server/payroll/exports";

export async function POST(request: Request) {
  const formData = await request.formData();
  const exportType = readExportType(formData.get("exportType"));

  try {
    await generatePayrollExport(await requireTenantSession({ permission: "payroll:manage" }), exportType);
    return NextResponse.redirect(new URL("/hr/payroll-exports", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate payroll export.";
    return NextResponse.redirect(
      new URL(`/hr/payroll-exports?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readExportType(value: FormDataEntryValue | null): PayrollExportType {
  if (value === "statutory_filing") return "statutory_filing";
  return value === "accounting_journal" ? "accounting_journal" : "bank_transfer";
}
