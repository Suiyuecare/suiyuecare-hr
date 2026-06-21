import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { savePolicyDocument } from "@/server/ai/policy-docs";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const session = await requireTenantSession({ permission: "ai:form_builder" });
    await savePolicyDocument(session, {
      title: readString(formData.get("title")),
      category: readString(formData.get("category")),
      status: readString(formData.get("status")),
      version: readString(formData.get("version")),
      sourceRef: readString(formData.get("sourceRef")),
      excerpt: readString(formData.get("excerpt")),
      keywords: readString(formData.get("keywords")),
    });

    return NextResponse.redirect(new URL("/hr/policy-sources", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "政策來源儲存失敗。";
    return NextResponse.redirect(
      new URL(`/hr/policy-sources?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
