import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { saveShiftTemplateSettings } from "@/server/scheduling/shift-templates";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await saveShiftTemplateSettings(await requireTenantSession({ permission: "settings:write" }), {
      id: readString(formData.get("id")) || null,
      code: readString(formData.get("code")),
      name: readString(formData.get("name")),
      status: readString(formData.get("status")) === "inactive" ? "inactive" : "active",
      startTime: readString(formData.get("startTime")),
      endTime: readString(formData.get("endTime")),
      breakMinutes: readNumber(formData.get("breakMinutes")) ?? 0,
      eligibleWeekdays: formData.getAll("eligibleWeekdays").map((value) => Number(value)),
      notes: readString(formData.get("notes")) || null,
    });
    return NextResponse.redirect(new URL("/hr/shift-templates", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save shift template.";
    return NextResponse.redirect(
      new URL(`/hr/shift-templates?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
