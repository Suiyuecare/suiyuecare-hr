import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateReportPermission } from "@/server/reports/builder";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await updateReportPermission(await requireTenantSession({ permission: "report:manage" }), {
      datasetCode: readString(formData.get("datasetCode")),
      fieldKey: readString(formData.get("fieldKey")),
      roleKey: readString(formData.get("roleKey")),
      accessLevel: readString(formData.get("accessLevel")),
      maskingMode: readString(formData.get("maskingMode")),
      exportAllowed: readString(formData.get("exportAllowed")),
      requiresReason: readString(formData.get("requiresReason")),
    });
    return NextResponse.redirect(
      new URL("/hr/reports?success=report-permission#report-permissions", request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update report permission.";
    return NextResponse.redirect(
      new URL(`/hr/reports?error=${encodeURIComponent(message)}#report-permissions`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
