import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { resolvePayrollBlockers } from "@/server/payroll/service";

export async function POST(request: Request) {
  await resolvePayrollBlockers(await requireTenantSession({ permission: "payroll:manage" }));
  return NextResponse.redirect(new URL("/hr?success=payroll-resolve-blockers", request.url), 303);
}
