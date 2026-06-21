import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { storeAiResult } from "@/server/ai/results";
import { explainPayrollException } from "@/server/ai/service";

export async function POST(request: Request) {
  const formData = await request.formData();
  const itemCode = typeof formData.get("itemCode") === "string" ? String(formData.get("itemCode")) : undefined;
  try {
    const session = await requireTenantSession({ permission: "ai:payroll_explain" });
    const result = await explainPayrollException(session, itemCode);
    const resultId = await storeAiResult(session, "payroll_exception_explainer", result);
    return NextResponse.redirect(new URL(`/hr/copilot?result=${resultId}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 請求失敗。";
    return NextResponse.redirect(
      new URL(`/hr/copilot?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}
