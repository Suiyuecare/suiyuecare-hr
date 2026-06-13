import { NextResponse } from "next/server";
import { getReadyHealth, healthHttpStatus } from "@/server/readiness/health";

export async function GET() {
  const report = await getReadyHealth();
  return NextResponse.json(report, {
    status: healthHttpStatus(report),
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
