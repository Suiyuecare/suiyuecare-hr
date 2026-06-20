import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateNotificationSettings } from "@/server/notifications/service";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await updateNotificationSettings(await requireTenantSession({ permission: "settings:write" }), {
      inAppEnabled: formData.get("inAppEnabled") === "on",
      emailEnabled: formData.get("emailEnabled") === "on",
      lineEnabled: formData.get("lineEnabled") === "on",
      slackEnabled: formData.get("slackEnabled") === "on",
      teamsEnabled: formData.get("teamsEnabled") === "on",
      externalSummaryOnly: formData.get("externalSummaryOnly") === "on",
      approvalSubmittedEnabled: formData.get("approvalSubmittedEnabled") === "on",
      approvalDecisionEnabled: formData.get("approvalDecisionEnabled") === "on",
      payrollReleasedEnabled: formData.get("payrollReleasedEnabled") === "on",
      systemAlertEnabled: formData.get("systemAlertEnabled") === "on",
    });
    return NextResponse.redirect(new URL("/settings/notifications?success=notifications", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update notification settings.";
    return NextResponse.redirect(
      new URL(`/settings/notifications?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}
