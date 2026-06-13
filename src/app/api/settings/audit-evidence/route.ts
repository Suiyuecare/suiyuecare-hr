import { NextResponse } from "next/server";
import { generateAuditEvidencePackage } from "@/server/audit/evidence-packages";
import { requireTenantSession } from "@/server/auth/guards";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const session = await requireTenantSession({ permission: "audit:read" });
    await generateAuditEvidencePackage(session, {
      periodStart: parseDate(formData.get("periodStart")),
      periodEnd: parseDate(formData.get("periodEnd")),
    });

    return NextResponse.redirect(new URL("/settings/audit", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate audit evidence package.";
    return NextResponse.redirect(
      new URL(`/settings/audit?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
