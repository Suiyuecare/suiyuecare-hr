import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { runPilotImportPreflightForUi } from "@/server/readiness/pilot-import-preflight-ui";
import {
  buildPilotImportPreflightErrorRedirectUrl,
  buildPilotImportPreflightSuccessRedirectUrl,
  normalizePilotImportPreflightReturnTo,
} from "./redirects";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = normalizePilotImportPreflightReturnTo(readString(formData.get("returnTo")));

  try {
    await runPilotImportPreflightForUi(await requireTenantSession({ permission: "pilot:manage" }), {
      employeeCsv: readString(formData.get("employeeCsv")),
      identityCsv: readString(formData.get("identityCsv")),
      payrollCsv: readString(formData.get("payrollCsv")),
    });
    return NextResponse.redirect(
      buildPilotImportPreflightSuccessRedirectUrl(returnTo, request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run pilot import preflight.";
    return NextResponse.redirect(
      buildPilotImportPreflightErrorRedirectUrl(returnTo, message, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
