import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createOvertimeRequest } from "@/server/workflows/service";
import { parseDateTime, parseText } from "../form-utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  await createOvertimeRequest(await requireTenantSession({ permission: "overtime:write", employeeRequired: true }), {
    startAt: parseDateTime(formData.get("startDate"), formData.get("startTime")),
    endAt: parseDateTime(formData.get("endDate"), formData.get("endTime")),
    reason: parseText(formData.get("reason"), "Overtime request"),
  });
  return NextResponse.redirect(new URL("/app#requests", request.url), 303);
}
