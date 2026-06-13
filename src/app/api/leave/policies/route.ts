import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { saveLeavePolicySettings } from "@/server/leave/policies";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await saveLeavePolicySettings(await requireTenantSession({ permission: "employee:write" }), {
      id: readString(formData.get("id")) || null,
      code: readString(formData.get("code")),
      name: readString(formData.get("name")),
      annualUnits: readNumber(formData.get("annualUnits")) ?? 0,
      unit: readString(formData.get("unit")),
      attachmentRequired: formData.get("attachmentRequired") === "on",
      status: readString(formData.get("status")) === "inactive" ? "inactive" : "active",
      statutoryCategory: readStatutoryCategory(formData.get("statutoryCategory")),
      eligibilityRule: readEligibilityRule(formData.get("eligibilityRule")),
      payRatePercent: readNumber(formData.get("payRatePercent")) ?? 100,
      annualLimitNote: readString(formData.get("annualLimitNote")) || null,
      requiresLegalReview: formData.get("requiresLegalReview") === "on",
      accrualMethod: readAccrualMethod(formData.get("accrualMethod")),
      minNoticeDays: readNumber(formData.get("minNoticeDays")) ?? 0,
      carryoverLimitUnits: readOptionalNumber(formData.get("carryoverLimitUnits")),
      paid: formData.get("paid") === "on",
      syncBalancesOnUpdate: formData.get("syncBalancesOnUpdate") === "on",
    });
    return NextResponse.redirect(new URL("/hr/leave-policies", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save leave policy.";
    return NextResponse.redirect(
      new URL(`/hr/leave-policies?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readAccrualMethod(value: FormDataEntryValue | null) {
  const raw = readString(value);
  if (raw === "monthly_accrual" || raw === "manual") return raw;
  return "annual_grant";
}

function readStatutoryCategory(value: FormDataEntryValue | null) {
  const raw = readString(value);
  if (
    raw === "annual_leave" ||
    raw === "sick_leave" ||
    raw === "personal_leave" ||
    raw === "family_care" ||
    raw === "parental" ||
    raw === "maternity" ||
    raw === "bereavement" ||
    raw === "marriage" ||
    raw === "official"
  ) {
    return raw;
  }
  return "company";
}

function readEligibilityRule(value: FormDataEntryValue | null) {
  const raw = readString(value);
  if (
    raw === "employee_self" ||
    raw === "caregiver" ||
    raw === "parent" ||
    raw === "pregnancy_related" ||
    raw === "manual_review"
  ) {
    return raw;
  }
  return "all_employees";
}
