import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { upsertBetaPilotTrialRun } from "@/server/readiness/beta-pilot-trial-run";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    await upsertBetaPilotTrialRun(await requireTenantSession({ permission: "pilot:manage" }), {
      startsAt: parseDate(readString(formData.get("startsAt"))),
      notes: readString(formData.get("notes")),
    });
    return NextResponse.redirect(
      new URL("/settings/readiness?success=beta-trial-run#pilot-runbook", request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create beta pilot trial run.";
    return NextResponse.redirect(
      new URL(`/settings/readiness?error=${encodeURIComponent(message)}#pilot-runbook`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("試用開始日格式不正確。");
  }
  return parsed;
}
