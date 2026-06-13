import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { storeAiResult } from "@/server/ai/demo-store";
import { draftFormFromPrompt } from "@/server/ai/service";

export async function POST(request: Request) {
  const formData = await request.formData();
  const prompt = parseText(formData.get("prompt"), "");
  try {
    const result = await draftFormFromPrompt(await requireTenantSession({ permission: "ai:form_builder" }), prompt);
    const resultId = storeAiResult("form_generator", result);
    return NextResponse.redirect(new URL(`/hr/copilot?result=${resultId}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    return NextResponse.redirect(
      new URL(`/hr/copilot?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function parseText(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" ? value.trim() : fallback;
}
