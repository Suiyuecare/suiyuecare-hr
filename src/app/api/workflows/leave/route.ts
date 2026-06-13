import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createLeaveRequest } from "@/server/workflows/service";
import { parseAttachmentMetadata, parseDateTime, parseNumber, parseText } from "../form-utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  await createLeaveRequest(await requireTenantSession({ permission: "leave:write", employeeRequired: true }), {
    startAt: parseDateTime(formData.get("startDate"), formData.get("startTime")),
    endAt: parseDateTime(formData.get("endDate"), formData.get("endTime")),
    units: parseNumber(formData.get("units"), 1),
    reason: parseText(formData.get("reason"), "Leave request"),
    attachment: parseAttachmentMetadata(formData, "attachment"),
  });
  return NextResponse.redirect(new URL("/app#requests", request.url), 303);
}
