import { NextResponse } from "next/server";
import { acknowledgeAnnouncement } from "@/server/announcements/service";
import { requireTenantSession } from "@/server/auth/guards";

export async function POST(request: Request) {
  const formData = await request.formData();
  const announcementId = readString(formData.get("announcementId"));
  try {
    await acknowledgeAnnouncement(await requireTenantSession({ permission: "announcement:self" }), announcementId);
    return NextResponse.redirect(new URL("/app/announcements", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法送出公告回條。";
    return NextResponse.redirect(
      new URL(`/app/announcements?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
