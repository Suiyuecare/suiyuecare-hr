import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  saveCompanyCalendarDay,
  saveCompanyCalendarReview,
} from "@/server/calendar/company-calendar";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    const session = await requireTenantSession({ permission: "settings:write" });
    if (readString(formData.get("action")) === "review") {
      await saveCompanyCalendarReview(session, {
        calendarYear: parseInteger(formData.get("calendarYear")),
        sourceTitle: readString(formData.get("sourceTitle")),
        sourceUrl: readString(formData.get("sourceUrl")),
        sourceCheckedAt: parseDate(formData.get("sourceCheckedAt")),
        reviewedBy: readString(formData.get("reviewedBy")),
        reviewedAt: parseDate(formData.get("reviewedAt")),
        reviewStatus: readString(formData.get("reviewStatus")) === "approved" ? "approved" : "pending_review",
        nationalHolidayCount: parseInteger(formData.get("nationalHolidayCount")),
        makeupWorkdayCount: parseInteger(formData.get("makeupWorkdayCount")),
        companyHolidayCount: parseInteger(formData.get("companyHolidayCount")),
        notes: readString(formData.get("reviewNotes")) || null,
      });
    } else {
      await saveCompanyCalendarDay(session, {
        id: readString(formData.get("id")) || null,
        calendarDate: parseDate(formData.get("calendarDate")),
        dayType: readDayType(formData.get("dayType")),
        name: readString(formData.get("name")),
        paid: formData.get("paid") === "on",
        requiresWork: formData.get("requiresWork") === "on",
        source: readSource(formData.get("source")),
        notes: readString(formData.get("notes")) || null,
      });
    }
    return NextResponse.redirect(new URL("/hr/calendar", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save calendar day.";
    return NextResponse.redirect(
      new URL(`/hr/calendar?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  return raw ? new Date(`${raw}T00:00:00+08:00`) : new Date(Number.NaN);
}

function parseInteger(value: FormDataEntryValue | null) {
  const parsed = Number(readString(value));
  return Number.isInteger(parsed) ? parsed : 0;
}

function readDayType(value: FormDataEntryValue | null) {
  const raw = readString(value);
  if (raw === "makeup_workday" || raw === "company_holiday" || raw === "regular_workday") return raw;
  return "national_holiday";
}

function readSource(value: FormDataEntryValue | null) {
  const raw = readString(value);
  if (raw === "government" || raw === "import") return raw;
  return "company";
}
