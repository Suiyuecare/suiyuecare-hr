import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { recalculatePayrollRun } from "@/server/payroll/service";

export async function POST(request: Request) {
  await recalculatePayrollRun(await requireTenantSession({ permission: "payroll:manage" }));
  return NextResponse.redirect(new URL("/hr?success=payroll-recalculate", request.url), 303);
}
