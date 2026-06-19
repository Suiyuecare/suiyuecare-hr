import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateEmployeeMasterProfile } from "@/server/employees/master";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await updateEmployeeMasterProfile(await requireTenantSession({ permission: "employee:write" }), {
      employeeId: readString(formData.get("employeeId")),
      departmentId: readString(formData.get("departmentId")),
      managerId: readString(formData.get("managerId")),
      jobPositionId: readString(formData.get("jobPositionId")),
      jobTitle: readString(formData.get("jobTitle")),
      changeReason: readString(formData.get("changeReason")),
    });
    return NextResponse.redirect(
      new URL("/hr/employees?success=employee-master#employee-master-update", request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update employee master profile.";
    return NextResponse.redirect(
      new URL(`/hr/employees?error=${encodeURIComponent(message)}#employee-master-update`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
