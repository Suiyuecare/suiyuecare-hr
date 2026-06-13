import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  createDataSubjectRequest,
  recordEmployeePrivacyConsent,
  resolveDataSubjectRequest,
  updatePrivacySettings,
  type DataSubjectRequestStatus,
  type DataSubjectRequestType,
  type PrivacyVerificationStatus,
} from "@/server/privacy/governance";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    if (intent === "settings") {
      await updatePrivacySettings(await requireTenantSession({ permission: "privacy:manage" }), {
        consentVersion: readString(formData.get("consentVersion")),
        consentTitle: readString(formData.get("consentTitle")),
        consentBody: readString(formData.get("consentBody")),
        collectionPurpose: readString(formData.get("collectionPurpose")),
        requiresEmployeeAcknowledgement: formData.get("requiresEmployeeAcknowledgement") === "on",
        dataRetentionYears: readNumber(formData.get("dataRetentionYears")),
        dataSubjectRequestResponseDays: readNumber(formData.get("dataSubjectRequestResponseDays")),
        deletionReviewRequired: formData.get("deletionReviewRequired") === "on",
        crossBorderTransferEnabled: formData.get("crossBorderTransferEnabled") === "on",
        subprocessors: readString(formData.get("subprocessors")).split(/[\n,]+/),
        verificationStatus: readString(formData.get("verificationStatus")) as PrivacyVerificationStatus,
      });
      return NextResponse.redirect(new URL("/settings/privacy", request.url), 303);
    }

    if (intent === "consent") {
      await recordEmployeePrivacyConsent(await requireTenantSession({ permission: "privacy:self", employeeRequired: true }));
      return NextResponse.redirect(new URL("/app/privacy", request.url), 303);
    }

    if (intent === "request") {
      await createDataSubjectRequest(await requireTenantSession({ permission: "privacy:self", employeeRequired: true }), {
        requestType: readString(formData.get("requestType")) as DataSubjectRequestType,
        summary: readString(formData.get("summary")),
      });
      return NextResponse.redirect(new URL("/app/privacy", request.url), 303);
    }

    if (intent === "resolve_request") {
      await resolveDataSubjectRequest(await requireTenantSession({ permission: "privacy:manage" }), {
        requestId: readString(formData.get("requestId")),
        status: readString(formData.get("status")) as DataSubjectRequestStatus,
        resolutionNote: readString(formData.get("resolutionNote")),
      });
      return NextResponse.redirect(new URL("/settings/privacy", request.url), 303);
    }

    throw new Error("Unknown privacy action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update privacy settings.";
    const target = intent === "consent" || intent === "request" ? "/app/privacy" : "/settings/privacy";
    return NextResponse.redirect(new URL(`${target}?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const number = Number(readString(value));
  return Number.isFinite(number) ? number : undefined;
}
