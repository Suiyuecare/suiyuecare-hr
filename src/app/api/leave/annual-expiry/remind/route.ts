import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { sendAnnualLeaveExpiryReminders } from "@/server/leave/annual-leave-expiry";

export async function POST(request: Request) {
  const formData = await request.formData();
  const asOfDate = parseDate(formData.get("asOfDate")) ?? new Date();
  const warningDays = parseInteger(formData.get("warningDays")) ?? 60;
  try {
    await sendAnnualLeaveExpiryReminders(await requireTenantSession({ permission: "employee:write" }), {
      asOfDate,
      warningDays,
    });
    return NextResponse.redirect(
      new URL(`/hr/annual-leave-expiry?asOfDate=${formatDate(asOfDate)}&warningDays=${warningDays}`, request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send annual leave expiry reminders.";
    return NextResponse.redirect(
      new URL(`/hr/annual-leave-expiry?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
