import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { signAttendancePeriod } from "@/server/attendance/signoffs";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await signAttendancePeriod(
      await requireTenantSession({ permission: "attendance:write", employeeRequired: true }),
      {
        periodStart: parseDate(formData.get("periodStart")) ?? undefined,
        periodEnd: parseDate(formData.get("periodEnd")) ?? undefined,
      },
    );
    return NextResponse.redirect(new URL("/app/attendance", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign attendance period.";
    return NextResponse.redirect(new URL(`/app/attendance?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
