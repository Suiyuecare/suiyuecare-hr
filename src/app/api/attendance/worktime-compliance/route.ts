import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createWorktimeComplianceExceptions } from "@/server/attendance/worktime-compliance";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await createWorktimeComplianceExceptions(await requireTenantSession({ permission: "employee:write" }), {
      periodStart: parseDate(formData.get("periodStart")) ?? undefined,
      periodEnd: parseDate(formData.get("periodEnd")) ?? undefined,
    });
    return NextResponse.redirect(new URL("/hr/worktime-compliance", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create worktime compliance exceptions.";
    return NextResponse.redirect(
      new URL(`/hr/worktime-compliance?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
