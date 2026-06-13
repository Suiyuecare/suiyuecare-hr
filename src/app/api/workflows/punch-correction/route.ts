import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createPunchCorrectionRequest } from "@/server/workflows/service";
import {
  combineDateAndTime,
  parseDate,
  parseOptionalTime,
  parseText,
} from "../form-utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  const workDate = parseDate(formData.get("workDate"));
  const clockInTime = parseOptionalTime(formData.get("clockInTime"));
  const clockOutTime = parseOptionalTime(formData.get("clockOutTime"));
  await createPunchCorrectionRequest(await requireTenantSession({ permission: "attendance:write", employeeRequired: true }), {
    workDate,
    requestedClockInAt: clockInTime ? combineDateAndTime(workDate, clockInTime) : null,
    requestedClockOutAt: clockOutTime ? combineDateAndTime(workDate, clockOutTime) : null,
    reason: parseText(formData.get("reason"), "Punch correction request"),
  });
  return NextResponse.redirect(new URL("/app#requests", request.url), 303);
}
