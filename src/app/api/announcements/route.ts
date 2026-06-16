import { NextResponse } from "next/server";
import { publishAnnouncement } from "@/server/announcements/service";
import { requireTenantSession } from "@/server/auth/guards";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await publishAnnouncement(await requireTenantSession({ permission: "announcement:manage" }), {
      title: readString(formData.get("title")),
      body: readString(formData.get("body")),
      category: readString(formData.get("category")) || "一般",
      requireReceipt: formData.get("requireReceipt") === "on",
    });
    return NextResponse.redirect(new URL("/hr/announcements", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法發布公告。";
    return NextResponse.redirect(
      new URL(`/hr/announcements?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
