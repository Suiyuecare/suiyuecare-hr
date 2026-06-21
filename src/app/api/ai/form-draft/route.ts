import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { storeAiResult } from "@/server/ai/results";
import { draftFormFromPrompt } from "@/server/ai/service";

export async function POST(request: Request) {
  const formData = await request.formData();
  const prompt = parseText(formData.get("prompt"), "");
  try {
    const session = await requireTenantSession({ permission: "ai:form_builder" });
    const result = await draftFormFromPrompt(session, prompt);
    const resultId = await storeAiResult(session, "form_generator", result);
    return NextResponse.redirect(new URL(`/hr/copilot?result=${resultId}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 請求失敗。";
    return NextResponse.redirect(
      new URL(`/hr/copilot?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function parseText(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" ? value.trim() : fallback;
}
