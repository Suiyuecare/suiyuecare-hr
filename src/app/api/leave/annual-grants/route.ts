import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { runAnnualLeaveGrantBatch } from "@/server/leave/annual-leave-grants";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await runAnnualLeaveGrantBatch(
      await requireTenantSession({ permission: "employee:write" }),
      parseDate(formData.get("asOfDate")) ?? new Date(),
    );
    return NextResponse.redirect(new URL("/hr/annual-leave-grants", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run annual leave grant batch.";
    return NextResponse.redirect(
      new URL(`/hr/annual-leave-grants?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
