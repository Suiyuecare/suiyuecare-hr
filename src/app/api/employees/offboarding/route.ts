import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateOffboardingTask } from "@/server/employees/offboarding";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await updateOffboardingTask(await requireTenantSession({ permission: "employee:write" }), {
      employeeId: readString(formData.get("employeeId")),
      lifecycleEventId: readString(formData.get("lifecycleEventId")),
      taskType: readString(formData.get("taskType")),
      status: readString(formData.get("status")),
      completedAt: readDate(formData.get("completedAt")),
      evidenceRef: readString(formData.get("evidenceRef")),
      notes: readString(formData.get("notes")),
    });
    return NextResponse.redirect(new URL("/hr/offboarding", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update offboarding task.";
    return NextResponse.redirect(new URL(`/hr/offboarding?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readDate(value: FormDataEntryValue | null) {
  const text = readString(value);
  return text ? new Date(`${text}T00:00:00.000Z`) : null;
}
