import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  approveSupportAccessGrant,
  revokeSupportAccessGrant,
  type SupportAccessDataLevel,
  type SupportAccessScope,
} from "@/server/support/access";

export async function POST(request: Request) {
  const formData = await request.formData();
  const action = readString(formData.get("action"));

  try {
    const session = await requireTenantSession({ permission: "settings:write" });
    if (action === "revoke") {
      await revokeSupportAccessGrant(
        session,
        readString(formData.get("grantId")),
        readString(formData.get("revokeReason")),
      );
    } else {
      await approveSupportAccessGrant(session, {
        supportPrincipalEmail: readString(formData.get("supportPrincipalEmail")),
        supportPrincipalName: readOptionalString(formData.get("supportPrincipalName")),
        ticketId: readString(formData.get("ticketId")),
        reason: readString(formData.get("reason")),
        scopes: readScopes(formData),
        dataAccessLevel: readDataAccessLevel(formData.get("dataAccessLevel")),
        expiresAt: readDate(formData.get("expiresAt")),
      });
    }

    return NextResponse.redirect(new URL("/settings/support-access", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update support access.";
    return NextResponse.redirect(
      new URL(`/settings/support-access?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: FormDataEntryValue | null) {
  const text = readString(value);
  return text || null;
}

function readScopes(formData: FormData): SupportAccessScope[] {
  return formData
    .getAll("scopes")
    .map((value) => String(value))
    .filter((value): value is SupportAccessScope =>
      value === "technical_support" ||
      value === "billing_support" ||
      value === "data_migration" ||
      value === "incident_response",
    );
}

function readDataAccessLevel(value: FormDataEntryValue | null): SupportAccessDataLevel | undefined {
  const text = readString(value);
  if (text === "metadata_only" || text === "customer_approved_records") return text;
  return undefined;
}

function readDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error("Support access expiry is invalid.");
  }
  return date;
}
