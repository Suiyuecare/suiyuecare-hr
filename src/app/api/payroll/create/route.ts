import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createPayrollRun } from "@/server/payroll/service";

export async function POST(request: Request) {
  await createPayrollRun(await requireTenantSession({ permission: "payroll:manage" }));
  return NextResponse.redirect(new URL("/hr?success=payroll-create", request.url), 303);
}
