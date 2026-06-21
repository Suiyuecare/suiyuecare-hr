import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createCustomReportJob } from "@/server/reports/builder";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await createCustomReportJob(await requireTenantSession({ permission: "report:manage" }), {
      title: readString(formData.get("title")),
      datasetCode: readString(formData.get("datasetCode")),
      purpose: readString(formData.get("purpose")),
      format: readString(formData.get("format")),
      deliveryMode: readString(formData.get("deliveryMode")),
      periodStart: readString(formData.get("periodStart")),
      periodEnd: readString(formData.get("periodEnd")),
      selectedFieldKeys: formData.getAll("selectedFieldKeys").map(readString).filter(Boolean),
    });
    return NextResponse.redirect(new URL("/hr/reports?success=custom-report#report-jobs", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create custom report.";
    return NextResponse.redirect(
      new URL(`/hr/reports?error=${encodeURIComponent(message)}#report-builder`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
