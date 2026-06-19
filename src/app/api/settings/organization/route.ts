import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  updateOrganizationCompanySettings,
  upsertOrganizationDepartment,
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
