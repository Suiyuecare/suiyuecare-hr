import { NextResponse } from "next/server";
import { getLiveHealth, healthHttpStatus } from "@/server/readiness/health";

export async function GET() {
  const report = getLiveHealth();
  return NextResponse.json(report, {
    status: healthHttpStatus(report),
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
