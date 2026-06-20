import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  acknowledgeCompanyWorkRule,
  saveCompanyWorkRule,
  type WorkRuleReviewStatus,
  type WorkRuleStatus,
} from "@/server/work-rules/service";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    if (intent === "save") {
      await saveCompanyWorkRule(await requireTenantSession({ permission: "work_rule:manage" }), {
        id: readString(formData.get("ruleId")) || undefined,
        title: readString(formData.get("title")),
        category: readString(formData.get("category")),
        summary: readString(formData.get("summary")),
        version: readString(formData.get("version")),
        status: readString(formData.get("status")) as WorkRuleStatus,
        reviewStatus: readString(formData.get("reviewStatus")) as WorkRuleReviewStatus,
        sourceRef: readString(formData.get("sourceRef")) || undefined,
        content: readString(formData.get("content")),
        acknowledgementRequired: formData.get("acknowledgementRequired") === "on",
        effectiveFrom: parseDate(readString(formData.get("effectiveFrom"))),
      });
      return NextResponse.redirect(new URL("/hr/work-rules?success=save", request.url), 303);
    }

    if (intent === "acknowledge") {
      await acknowledgeCompanyWorkRule(
        await requireTenantSession({ permission: "work_rule:self", employeeRequired: true }),
        readString(formData.get("workRuleId")),
      );
      return NextResponse.redirect(new URL("/app/work-rules?success=acknowledge", request.url), 303);
    }

    throw new Error("Unknown work rules action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update work rules.";
    const target = intent === "acknowledge" ? "/app/work-rules" : "/hr/work-rules";
    return NextResponse.redirect(new URL(`${target}?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string) {
  const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
