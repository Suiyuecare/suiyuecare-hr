import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { clockAttendance } from "@/server/workflows/service";
import { parsePunchSource } from "../form-utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  await clockAttendance(await requireTenantSession({ permission: "attendance:write", employeeRequired: true }), {
    direction: "in",
    source: parsePunchSource(formData.get("source")),
  });
  return NextResponse.redirect(new URL("/app", request.url), 303);
}
