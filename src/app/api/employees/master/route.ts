import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createEmployeeMasterProfile, updateEmployeeMasterProfile } from "@/server/employees/master";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    const session = await requireTenantSession({ permission: "employee:write" });
    if (intent === "create") {
      await createEmployeeMasterProfile(session, {
        employeeNo: readString(formData.get("employeeNo")),
        displayName: readString(formData.get("displayName")),
        hireDate: readDate(formData.get("hireDate")),
        departmentId: readString(formData.get("departmentId")),
        managerId: readString(formData.get("managerId")),
        jobPositionId: readString(formData.get("jobPositionId")),
        jobTitle: readString(formData.get("jobTitle")),
        onboardingNote: readString(formData.get("onboardingNote")),
      });
      return NextResponse.redirect(
        new URL("/hr/employees?success=employee-created#employee-master-create", request.url),
        303,
      );
    }

    await updateEmployeeMasterProfile(session, {
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

function readDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  const date = raw ? new Date(`${raw}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid hire date.");
  }
  return date;
}
