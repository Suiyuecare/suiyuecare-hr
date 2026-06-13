import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  reportWorkplaceIncident,
  updateIncidentSettings,
  updateWorkplaceIncident,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentType,
  type IncidentVerificationStatus,
} from "@/server/incidents/workplace";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    if (intent === "settings") {
      await updateIncidentSettings(await requireTenantSession({ permission: "incident:manage" }), {
        reportingEnabled: formData.get("reportingEnabled") === "on",
        anonymousReportingEnabled: formData.get("anonymousReportingEnabled") === "on",
        severeIncidentNotifyHours: readNumber(formData.get("severeIncidentNotifyHours")),
        investigationTargetDays: readNumber(formData.get("investigationTargetDays")),
        harassmentPolicyVersion: readString(formData.get("harassmentPolicyVersion")),
        safetyPolicyVersion: readString(formData.get("safetyPolicyVersion")),
        authorityReportRequired: formData.get("authorityReportRequired") === "on",
        verificationStatus: readString(formData.get("verificationStatus")) as IncidentVerificationStatus,
      });
      return NextResponse.redirect(new URL("/hr/incidents", request.url), 303);
    }

    if (intent === "report") {
      await reportWorkplaceIncident(await requireTenantSession({ permission: "incident:self", employeeRequired: true }), {
        incidentType: readString(formData.get("incidentType")) as IncidentType,
        severity: readString(formData.get("severity")) as IncidentSeverity,
        occurredAt: readDate(formData.get("occurredAt")),
        summary: readString(formData.get("summary")),
        location: readString(formData.get("location")),
        confidential: formData.get("confidential") === "on",
      });
      return NextResponse.redirect(new URL("/app/incidents", request.url), 303);
    }

    if (intent === "update") {
      await updateWorkplaceIncident(await requireTenantSession({ permission: "incident:manage" }), {
        incidentId: readString(formData.get("incidentId")),
        status: readString(formData.get("status")) as IncidentStatus,
        correctiveAction: readString(formData.get("correctiveAction")),
        authorityReported: formData.get("authorityReported") === "on",
      });
      return NextResponse.redirect(new URL("/hr/incidents", request.url), 303);
    }

    throw new Error("Unknown incident action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update workplace incident.";
    const target = intent === "report" ? "/app/incidents" : "/hr/incidents";
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

function readDate(value: FormDataEntryValue | null) {
  const parsed = new Date(readString(value));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
