import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  resolveAttendanceException,
  resolveSafeAttendanceExceptions,
} from "@/server/attendance/exceptions";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    const session = await requireTenantSession({ permission: "employee:write" });
    if (intent === "resolve") {
      await resolveAttendanceException(session, {
        exceptionId: readString(formData.get("exceptionId")),
        resolutionCode: readString(formData.get("resolutionCode")),
        evidenceRef: readString(formData.get("evidenceRef")),
        comment: readString(formData.get("comment")),
      });
      return NextResponse.redirect(new URL("/hr/attendance-exceptions", request.url), 303);
    }

    if (intent === "resolve_safe") {
      await resolveSafeAttendanceExceptions(session);
      return NextResponse.redirect(new URL("/hr/attendance-exceptions", request.url), 303);
    }

    throw new Error("Unknown attendance exception action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update attendance exceptions.";
    return NextResponse.redirect(
      new URL(`/hr/attendance-exceptions?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
