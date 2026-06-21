import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { approveReportJobReview } from "@/server/reports/builder";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await approveReportJobReview(await requireTenantSession({ permission: "report:manage" }), {
      jobId: readString(formData.get("jobId")),
      reviewerNote: readString(formData.get("reviewerNote")),
    });
    return NextResponse.redirect(new URL("/hr/reports?success=report-review#report-jobs", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to approve report review.";
    return NextResponse.redirect(
      new URL(`/hr/reports?error=${encodeURIComponent(message)}#report-jobs`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
