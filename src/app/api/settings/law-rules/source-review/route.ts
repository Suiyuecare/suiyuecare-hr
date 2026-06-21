import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { reviewTaiwanLaborLegalSources } from "@/server/rules/settings";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = normalizeReturnTo(readString(formData.get("returnTo")));

  try {
    await reviewTaiwanLaborLegalSources(await requireTenantSession({ permission: "settings:write" }), {
      reviewedBy: readString(formData.get("reviewedBy")),
      reviewedAt: readString(formData.get("reviewedAt")),
      evidenceNote: readString(formData.get("evidenceNote")),
      sourceIds: formData.getAll("sourceIds").map(readString).filter(Boolean),
      reviewStatus: formData.get("reviewStatus") === "pending_legal_review" ? "pending_legal_review" : "approved",
      requiresPayrollRecalculation: formData.get("requiresPayrollRecalculation") === "on",
    });
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review legal sources.";
    const url = new URL(returnTo, request.url);
    url.searchParams.delete("success");
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, 303);
  }
}

function normalizeReturnTo(value: string | undefined) {
  const fallback = "/settings/law-rules?success=source-review#source-review-workspace";
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://hr-one.local");
    if (url.pathname !== "/settings/law-rules") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
