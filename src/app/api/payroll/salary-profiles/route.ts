import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { saveSalaryProfile } from "@/server/payroll/salary-profiles";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await saveSalaryProfile(await requireTenantSession({ permission: "payroll:manage" }), {
      employeeId: readString(formData.get("employeeId")),
      baseSalary: readNumber(formData.get("baseSalary")) ?? 0,
      hourlyWage: readOptionalNumber(formData.get("hourlyWage")),
      allowanceCode: readString(formData.get("allowanceCode")) || null,
      allowanceName: readString(formData.get("allowanceName")) || null,
      allowanceAmount: readOptionalNumber(formData.get("allowanceAmount")),
      deductionCode: readString(formData.get("deductionCode")) || null,
      deductionName: readString(formData.get("deductionName")) || null,
      deductionAmount: readOptionalNumber(formData.get("deductionAmount")),
      effectiveFrom: parseDate(formData.get("effectiveFrom")),
    });
    return NextResponse.redirect(new URL("/hr/salary-profiles", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save salary profile.";
    return NextResponse.redirect(
      new URL(`/hr/salary-profiles?error=${encodeURIComponent(message)}`, request.url),
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

function readOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  return raw ? new Date(`${raw}T00:00:00.000Z`) : new Date(Number.NaN);
}
