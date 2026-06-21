import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { answerPolicyQuestion } from "@/server/ai/service";
import { storeAiResult } from "@/server/ai/demo-store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const question = parseText(formData.get("question"), "");
  try {
    const result = await answerPolicyQuestion(await requireTenantSession({ permission: "ai:policy" }), question);
    const resultId = storeAiResult("policy_qa", result);
    return NextResponse.redirect(new URL(`/hr/copilot?result=${resultId}`, request.url), 303);
  } catch (error) {
    return redirectWithError(request, error);
  }
}

function parseText(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" ? value.trim() : fallback;
}

function redirectWithError(request: Request, error: unknown) {
  const message = error instanceof Error ? error.message : "AI 請求失敗。";
  return NextResponse.redirect(
    new URL(`/hr/copilot?error=${encodeURIComponent(message)}`, request.url),
    303,
  );
}
