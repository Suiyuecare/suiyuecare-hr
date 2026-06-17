import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { runBetaPilotFinalReview } from "@/server/readiness/beta-pilot-final-review";
import {
  getBetaPilotErrorReturnUrl,
  getBetaPilotReturnUrl,
} from "@/server/readiness/beta-pilot-redirect";

export async function POST(request: Request) {
  let returnTo = "";
  try {
    const formData = await request.formData();
    returnTo = readString(formData.get("returnTo"));
    const report = await runBetaPilotFinalReview(
      await requireTenantSession({ permission: "pilot:manage" }),
    );
    if (returnTo) {
      return NextResponse.redirect(getBetaPilotReturnUrl(request.url, returnTo), 303);
    }
    return NextResponse.redirect(
      new URL(`/settings/readiness?success=beta-final-review-${report.status}#pilot-runbook`, request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run beta pilot final review.";
    return NextResponse.redirect(getBetaPilotErrorReturnUrl(request.url, returnTo, message), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
