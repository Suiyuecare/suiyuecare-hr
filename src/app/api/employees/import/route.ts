import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { confirmEmployeeImport, previewEmployeeImport } from "@/server/employees/imports";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    const session = await requireTenantSession({ permission: "employee:write" });
    if (intent === "import") {
      await confirmEmployeeImport(session, readString(formData.get("previewId")));
      return NextResponse.redirect(new URL("/hr/employee-import?imported=1", request.url), 303);
    }
    await previewEmployeeImport(session, readString(formData.get("rawCsv")));
    return NextResponse.redirect(new URL("/hr/employee-import?preview=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process employee import.";
    return NextResponse.redirect(
      new URL(`/hr/employee-import?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
