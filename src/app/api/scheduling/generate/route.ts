import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { generateSchedulesFromShiftTemplate } from "@/server/scheduling/shift-templates";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await generateSchedulesFromShiftTemplate(await requireTenantSession({ permission: "settings:write" }), {
      shiftTemplateId: readString(formData.get("shiftTemplateId")),
      workDate: parseDate(formData.get("workDate")),
      overwriteExisting: formData.get("overwriteExisting") === "on",
    });
    return NextResponse.redirect(new URL("/hr/shift-templates", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate schedules.";
    return NextResponse.redirect(
      new URL(`/hr/shift-templates?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  return raw ? new Date(`${raw}T00:00:00+08:00`) : new Date(Number.NaN);
}
