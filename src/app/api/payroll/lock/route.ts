import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { lockPayrollRun } from "@/server/payroll/service";

export async function POST(request: Request) {
  await lockPayrollRun(await requireTenantSession({ permission: "payroll:manage" }));
  return NextResponse.redirect(new URL("/hr", request.url), 303);
}

