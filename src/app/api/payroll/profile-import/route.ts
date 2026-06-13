import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { confirmPayrollProfileImport, previewPayrollProfileImport } from "@/server/payroll/profile-imports";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    const session = await requireTenantSession({ permission: "payroll:manage" });
    const intent = readString(formData.get("intent"));
    if (intent === "import") {
      await confirmPayrollProfileImport(session, readString(formData.get("previewId")));
      return NextResponse.redirect(new URL("/hr/payroll-profile-import?imported=1", request.url), 303);
    }
    await previewPayrollProfileImport(session, readString(formData.get("rawCsv")));
    return NextResponse.redirect(new URL("/hr/payroll-profile-import?preview=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process payroll profile import.";
    return NextResponse.redirect(
      new URL(`/hr/payroll-profile-import?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
