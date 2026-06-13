import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updatePayrollComplianceProfile } from "@/server/payroll/compliance";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await updatePayrollComplianceProfile(await requireTenantSession({ permission: "payroll:manage" }), {
      employeeId: readString(formData.get("employeeId")),
      taxResidency: readString(formData.get("taxResidency")) === "non_resident" ? "non_resident" : "resident",
      dependentCount: parseNumber(formData.get("dependentCount")) ?? 0,
      laborInsuranceMonthlyWage: parseNumber(formData.get("laborInsuranceMonthlyWage")),
      healthInsuranceMonthlyWage: parseNumber(formData.get("healthInsuranceMonthlyWage")),
      laborPensionMonthlyWage: parseNumber(formData.get("laborPensionMonthlyWage")),
      incomeTaxWithholdingMethod:
        readString(formData.get("taxResidency")) === "non_resident"
          ? "non_resident_flat"
          : "annualized_progressive",
      nonResidentWithholdingRate: parsePercent(formData.get("nonResidentWithholdingRate")),
    });
    return NextResponse.redirect(new URL("/hr/payroll-compliance", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update payroll compliance profile.";
    return NextResponse.redirect(
      new URL(`/hr/payroll-compliance?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePercent(value: FormDataEntryValue | null) {
  const parsed = parseNumber(value);
  if (parsed === undefined) return undefined;
  return parsed / 100;
}
