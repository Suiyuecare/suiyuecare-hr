import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { recordBetaPilotCheckpoint } from "@/server/readiness/beta-pilot-checkpoints";
import {
  getBetaPilotErrorReturnUrl,
  getBetaPilotReturnUrl,
} from "@/server/readiness/beta-pilot-redirect";

export async function POST(request: Request) {
  let returnTo = "";
  try {
    const formData = await request.formData();
    returnTo = readString(formData.get("returnTo"));
    await recordBetaPilotCheckpoint(await requireTenantSession({ permission: "pilot:manage" }), {
      checkpointId: readString(formData.get("checkpointId")),
      status: readString(formData.get("status")),
      evidenceType: readString(formData.get("evidenceType")),
      evidenceRef: readString(formData.get("evidenceRef")),
      reviewerNote: readString(formData.get("reviewerNote")),
      nextStep: readString(formData.get("nextStep")),
    });
    return NextResponse.redirect(getBetaPilotReturnUrl(request.url, returnTo), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record beta pilot checkpoint.";
    return NextResponse.redirect(getBetaPilotErrorReturnUrl(request.url, returnTo, message), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
