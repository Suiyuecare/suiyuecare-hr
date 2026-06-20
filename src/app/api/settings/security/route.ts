import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateCompanySecuritySettings } from "@/server/settings/security";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await updateCompanySecuritySettings(await requireTenantSession({ permission: "settings:write" }), {
      mfaRequiredForAdmins: formData.get("mfaRequiredForAdmins") === "on",
      mfaRequiredForEmployees: formData.get("mfaRequiredForEmployees") === "on",
      ssoEnabled: formData.get("ssoEnabled") === "on",
      ssoProvider: readString(formData.get("ssoProvider")),
      ssoIssuerUrl: readString(formData.get("ssoIssuerUrl")),
      ssoClientId: readString(formData.get("ssoClientId")),
      ssoJwksUrl: readString(formData.get("ssoJwksUrl")),
      passwordMinLength: readNumber(formData.get("passwordMinLength")),
      passwordRequiresNumber: formData.get("passwordRequiresNumber") === "on",
      passwordRequiresSymbol: formData.get("passwordRequiresSymbol") === "on",
      sessionTimeoutMinutes: readNumber(formData.get("sessionTimeoutMinutes")),
      idleTimeoutMinutes: readNumber(formData.get("idleTimeoutMinutes")),
      allowedEmailDomains: readString(formData.get("allowedEmailDomains")).split(/[\s,]+/),
    });
    return NextResponse.redirect(new URL("/settings/security?success=security", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update security settings.";
    return NextResponse.redirect(
      new URL(`/settings/security?error=${encodeURIComponent(message)}`, request.url),
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
