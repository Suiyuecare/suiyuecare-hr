import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  acknowledgeEmploymentTerm,
  saveEmploymentTerm,
  type EmploymentTermStatus,
} from "@/server/employees/employment-terms";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    if (intent === "save") {
      await saveEmploymentTerm(await requireTenantSession({ permission: "employment_terms:manage" }), {
        employeeId: readString(formData.get("employeeId")),
        version: readString(formData.get("version")),
        status: readString(formData.get("status")) as EmploymentTermStatus,
        effectiveFrom: parseDate(formData.get("effectiveFrom")) ?? new Date(),
        jobTitle: readString(formData.get("jobTitle")),
        workLocation: readString(formData.get("workLocation")),
        regularWorkSchedule: readString(formData.get("regularWorkSchedule")),
        wagePaymentDay: readString(formData.get("wagePaymentDay")),
        wageBasisSummary: readString(formData.get("wageBasisSummary")),
        benefitsSummary: readString(formData.get("benefitsSummary")),
        contractLifecycleSummary: readString(formData.get("contractLifecycleSummary")),
        severancePensionBonusSummary: readString(formData.get("severancePensionBonusSummary")),
        mealLodgingToolCostSummary: readString(formData.get("mealLodgingToolCostSummary")),
        safetyHealthSummary: readString(formData.get("safetyHealthSummary")),
        trainingSummary: readString(formData.get("trainingSummary")),
        disasterCompensationSicknessSummary: readString(formData.get("disasterCompensationSicknessSummary")),
        disciplineSummary: readString(formData.get("disciplineSummary")),
        rewardDisciplineSummary: readString(formData.get("rewardDisciplineSummary")),
        rightsObligationsSummary: readString(formData.get("rightsObligationsSummary")),
        sourceRef: readString(formData.get("sourceRef")),
        acknowledgementRequired: formData.get("acknowledgementRequired") === "on",
      });
      return NextResponse.redirect(new URL("/hr/employment-terms", request.url), 303);
    }

    if (intent === "acknowledge") {
      await acknowledgeEmploymentTerm(
        await requireTenantSession({ permission: "employment_terms:self", employeeRequired: true }),
        readString(formData.get("termId")),
      );
      return NextResponse.redirect(new URL("/app/employment-terms", request.url), 303);
    }

    throw new Error("Unknown employment terms action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update employment terms.";
    const target = intent === "acknowledge" ? "/app/employment-terms" : "/hr/employment-terms";
    return NextResponse.redirect(new URL(`${target}?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: FormDataEntryValue | null) {
  const text = readString(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
