import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { confirmPayrollRun } from "@/server/payroll/service";

export async function POST(request: Request) {
  await confirmPayrollRun(await requireTenantSession({ permission: "payroll:manage" }));
  return NextResponse.redirect(new URL("/hr?success=payroll-confirm", request.url), 303);
}
