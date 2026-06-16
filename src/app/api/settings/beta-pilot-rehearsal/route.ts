import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { runBetaPilotRehearsal } from "@/server/readiness/beta-pilot-rehearsal";

export async function POST(request: Request) {
  try {
    await runBetaPilotRehearsal(await requireTenantSession({ permission: "pilot:manage" }));
    return NextResponse.redirect(
      new URL("/settings/readiness?success=beta-rehearsal#pilot-runbook", request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run beta pilot rehearsal.";
    return NextResponse.redirect(
      new URL(`/settings/readiness?error=${encodeURIComponent(message)}#pilot-runbook`, request.url),
      303,
    );
  }
}
