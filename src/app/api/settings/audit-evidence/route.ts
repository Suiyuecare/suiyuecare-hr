import { NextResponse } from "next/server";
import { generateAuditEvidencePackage } from "@/server/audit/evidence-packages";
import { requireTenantSession } from "@/server/auth/guards";
import {
  buildAuditEvidenceErrorRedirectUrl,
  normalizeAuditEvidenceReturnTo,
} from "./redirects";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = normalizeAuditEvidenceReturnTo(readString(formData.get("returnTo")));

  try {
    const session = await requireTenantSession({ permission: "audit:read" });
    await generateAuditEvidencePackage(session, {
      periodStart: parseDate(formData.get("periodStart")),
      periodEnd: parseDate(formData.get("periodEnd")),
    });

    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate audit evidence package.";
    return NextResponse.redirect(
      buildAuditEvidenceErrorRedirectUrl(returnTo, message, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
