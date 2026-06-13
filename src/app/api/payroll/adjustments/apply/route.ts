import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { requestPayrollAdjustment } from "@/server/payroll/adjustments";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await requestPayrollAdjustment(await requireTenantSession({ permission: "payroll:manage" }), {
      payrollRunId: readString(formData.get("payrollRunId")) || null,
      employeeId: readString(formData.get("employeeId")),
      kind: readString(formData.get("kind")) === "deduction" ? "deduction" : "allowance",
      amount: parseNumber(formData.get("amount")) ?? 0,
      reason: readString(formData.get("reason")),
    });
    return NextResponse.redirect(new URL("/hr/payroll-adjustments", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply payroll adjustment.";
    return NextResponse.redirect(
      new URL(`/hr/payroll-adjustments?error=${encodeURIComponent(message)}`, request.url),
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
