import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { runBetaPilotAccessReview } from "@/server/readiness/beta-pilot-access-review";

export async function POST(request: Request) {
  try {
    await runBetaPilotAccessReview(await requireTenantSession({ permission: "pilot:manage" }));
    return NextResponse.redirect(new URL("/settings/readiness#pilot-runbook", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run beta pilot access review.";
    return NextResponse.redirect(
      new URL(`/settings/readiness?error=${encodeURIComponent(message)}#pilot-runbook`, request.url),
      303,
    );
  }
}
