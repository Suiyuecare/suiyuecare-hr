import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { runBetaPilotAccessReview } from "@/server/readiness/beta-pilot-access-review";
import {
  getBetaPilotErrorReturnUrl,
  getBetaPilotReturnUrl,
} from "@/server/readiness/beta-pilot-redirect";

export async function POST(request: Request) {
  let returnTo = "";
  try {
    const formData = await request.formData();
    returnTo = readString(formData.get("returnTo"));
    await runBetaPilotAccessReview(await requireTenantSession({ permission: "pilot:manage" }));
    return NextResponse.redirect(getBetaPilotReturnUrl(request.url, returnTo), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run beta pilot access review.";
    return NextResponse.redirect(getBetaPilotErrorReturnUrl(request.url, returnTo, message), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
