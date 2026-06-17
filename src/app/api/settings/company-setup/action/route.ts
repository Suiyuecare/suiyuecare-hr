import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  isCompanySetupActionId,
  runCompanySetupAction,
} from "@/server/readiness/company-setup-actions";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const actionId = readString(formData.get("actionId"));
    if (!isCompanySetupActionId(actionId)) {
      throw new Error("未知的公司導入動作。");
    }
    const result = await runCompanySetupAction(
      await requireTenantSession({ permission: "settings:read" }),
      actionId,
    );
    return NextResponse.redirect(
      new URL(`/settings/company-setup?success=${result.actionId}&status=${result.status}`, request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法執行公司導入動作。";
    return NextResponse.redirect(
      new URL(`/settings/company-setup?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
