import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  updateOrganizationCompanySettings,
  updateOrganizationManagerLine,
  upsertOrganizationDepartment,
  upsertOrganizationJobLevel,
  upsertOrganizationJobPosition,
} from "@/server/organization/settings";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    const session = await requireTenantSession({ permission: "settings:write" });
    if (intent === "company") {
      await updateOrganizationCompanySettings(session, {
        name: readString(formData.get("name")),
        legalName: readString(formData.get("legalName")),
        taxId: readString(formData.get("taxId")),
        timezone: readString(formData.get("timezone")),
        currency: readString(formData.get("currency")),
      });
      return NextResponse.redirect(
        new URL("/settings/organization?success=company", request.url),
        303,
      );
    }

    if (intent === "department") {
      await upsertOrganizationDepartment(session, {
        id: readString(formData.get("departmentId")),
        code: readString(formData.get("code")),
        name: readString(formData.get("name")),
        parentDepartmentId: readString(formData.get("parentDepartmentId")),
      });
      return NextResponse.redirect(
        new URL("/settings/organization?success=department#departments", request.url),
        303,
      );
    }

    if (intent === "job_level") {
      await upsertOrganizationJobLevel(session, {
        id: readString(formData.get("jobLevelId")),
        code: readString(formData.get("code")),
        name: readString(formData.get("name")),
        rank: readNumber(formData.get("rank")),
        status: readString(formData.get("status")),
        description: readString(formData.get("description")),
      });
      return NextResponse.redirect(
        new URL("/settings/organization?success=job-level#job-architecture", request.url),
        303,
      );
    }

    if (intent === "job_position") {
      await upsertOrganizationJobPosition(session, {
        id: readString(formData.get("jobPositionId")),
        code: readString(formData.get("code")),
        title: readString(formData.get("title")),
        family: readString(formData.get("family")),
        status: readString(formData.get("status")),
        departmentId: readString(formData.get("departmentId")),
        levelId: readString(formData.get("levelId")),
        description: readString(formData.get("description")),
      });
      return NextResponse.redirect(
        new URL("/settings/organization?success=job-position#job-architecture", request.url),
        303,
      );
    }

    if (intent === "manager_line") {
      await updateOrganizationManagerLine(session, {
        employeeId: readString(formData.get("employeeId")),
        managerId: readString(formData.get("managerId")),
        changeReason: readString(formData.get("changeReason")),
      });
      return NextResponse.redirect(
        new URL("/settings/organization?success=manager-line#manager-line-governance", request.url),
        303,
      );
    }

    throw new Error("未知的組織設定動作。");
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法更新組織設定。";
    return NextResponse.redirect(
      new URL(`/settings/organization?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const number = Number(readString(value));
  return Number.isFinite(number) ? number : undefined;
}
