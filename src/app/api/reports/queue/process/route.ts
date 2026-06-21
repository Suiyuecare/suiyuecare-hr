import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { processReportExportQueue } from "@/server/reports/builder";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const session = await requireTenantSession({ permission: "report:manage" });
    const result = await processReportExportQueue(session, {
      jobId: readString(formData.get("jobId")),
      workerId: "manual-report-workspace",
      limit: readString(formData.get("limit")),
    });
    const success = result.processedCount > 0 ? "report-queue" : "report-queue-empty";
    return NextResponse.redirect(new URL(`/hr/reports?success=${success}#report-jobs`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process report export queue.";
    return NextResponse.redirect(
      new URL(`/hr/reports?error=${encodeURIComponent(message)}#report-jobs`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
