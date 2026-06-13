import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { decidePayrollAdjustment } from "@/server/payroll/adjustments";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await decidePayrollAdjustment(await requireTenantSession({ permission: "payroll_adjustment:approve" }), {
      adjustmentId: readString(formData.get("adjustmentId")),
      decision: readString(formData.get("decision")) === "reject" ? "reject" : "approve",
      comment: readString(formData.get("comment")),
    });
    return NextResponse.redirect(new URL("/hr/payroll-adjustments", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to decide payroll adjustment.";
    return NextResponse.redirect(
      new URL(`/hr/payroll-adjustments?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
