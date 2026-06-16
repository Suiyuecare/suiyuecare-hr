import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { runBetaPilotFinalReview } from "@/server/readiness/beta-pilot-final-review";

export async function POST(request: Request) {
  try {
    const report = await runBetaPilotFinalReview(
      await requireTenantSession({ permission: "pilot:manage" }),
    );
    return NextResponse.redirect(
      new URL(`/settings/readiness?success=beta-final-review-${report.status}#pilot-runbook`, request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run beta pilot final review.";
    return NextResponse.redirect(
      new URL(`/settings/readiness?error=${encodeURIComponent(message)}#pilot-runbook`, request.url),
      303,
    );
  }
}
