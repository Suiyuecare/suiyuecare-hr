import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { storeAiResult } from "@/server/ai/demo-store";
import { explainPayrollException } from "@/server/ai/service";

export async function POST(request: Request) {
  const formData = await request.formData();
  const itemCode = typeof formData.get("itemCode") === "string" ? String(formData.get("itemCode")) : undefined;
  try {
    const result = await explainPayrollException(await requireTenantSession({ permission: "ai:payroll_explain" }), itemCode);
    const resultId = storeAiResult("payroll_exception_explainer", result);
    return NextResponse.redirect(new URL(`/hr/copilot?result=${resultId}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    return NextResponse.redirect(
      new URL(`/hr/copilot?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}
