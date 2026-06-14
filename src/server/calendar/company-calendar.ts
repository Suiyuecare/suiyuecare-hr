import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type CalendarDayType = "national_holiday" | "makeup_workday" | "company_holiday" | "regular_workday";
export type CalendarReviewStatus = "pending_review" | "approved";

export type CompanyCalendarInput = {
  id?: string | null;
  calendarDate: Date;
  dayType: CalendarDayType;
  name: string;
  paid: boolean;
  requiresWork: boolean;
  source: "company" | "government" | "import";
  notes?: string | null;
};

export type CompanyCalendarDayView = CompanyCalendarInput & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyCalendarReviewInput = {
  calendarYear: number;
  sourceTitle: string;
  sourceUrl: string;
  sourceCheckedAt: Date;
  reviewedBy: string;
  reviewedAt: Date;
  reviewStatus: CalendarReviewStatus;
  nationalHolidayCount: number;
  makeupWorkdayCount: number;
  companyHolidayCount: number;
  notes?: string | null;
};

export type CompanyCalendarReviewView = CompanyCalendarReviewInput & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyCalendarReadiness = {
  ready: boolean;
  calendarYear: number;
  detail: string;
  review: CompanyCalendarReviewView | null;
  counts: {
    nationalHolidays: number;
    makeupWorkdays: number;
    companyHolidays: number;
  };
  missing: string[];
};

type CalendarDemoState = {
  days: CompanyCalendarDayView[];
  reviews: CompanyCalendarReviewView[];
};

const globalForCalendar = globalThis as unknown as {
  hrOneCompanyCalendarDemoState?: CalendarDemoState;
};

export async function getCompanyCalendarSettings(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    const rows = await getDb().companyCalendarDay.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      orderBy: { calendarDate: "asc" },
      take: 120,
    });
    return rows.map((row) => ({
      id: row.id,
      calendarDate: row.calendarDate,
      dayType: normalizeDayType(row.dayType),
      name: row.name,
      paid: row.paid,
      requiresWork: row.requiresWork,
      source: normalizeSource(row.source),
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
  return getCalendarDemoState().days;
}

export async function getCompanyCalendarWorkspace(session: SessionLike) {
  const [days, reviews] = await Promise.all([
    getCompanyCalendarSettings(session),
    getCompanyCalendarReviews(session),
  ]);
  return {
    days,
    reviews,
    readiness: evaluateCompanyCalendarReadiness({
      days,
      reviews,
      calendarYear: currentTaiwanCalendarYear(),
    }),
  };
}

export async function getCompanyCalendarReviews(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    const rows = await getDb().companyCalendarReview.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      orderBy: { calendarYear: "desc" },
      take: 5,
    });
    return rows.map(mapCalendarReview);
  }
  return getCalendarDemoState().reviews;
}

export async function saveCompanyCalendarDay(session: SessionLike, input: CompanyCalendarInput) {
  assertPermission(session.role, "settings:write");
  const normalized = normalizeCalendarInput(input);
  if (canUseDatabase(session)) {
    return await saveDbCompanyCalendarDay(session, normalized);
  }
  return saveDemoCompanyCalendarDay(session, normalized);
}

export async function saveCompanyCalendarReview(session: SessionLike, input: CompanyCalendarReviewInput) {
  assertPermission(session.role, "settings:write");
  const normalized = normalizeCalendarReviewInput(input);
  if (canUseDatabase(session)) {
    return await saveDbCompanyCalendarReview(session, normalized);
  }
  return saveDemoCompanyCalendarReview(session, normalized);
}

export function resetCompanyCalendarDemoState() {
  const now = new Date();
  globalForCalendar.hrOneCompanyCalendarDemoState = {
    days: [
      {
        id: "demo-calendar-new-year",
        calendarDate: startOfDate(new Date("2026-01-01T00:00:00+08:00")),
        dayType: "national_holiday",
        name: "New Year holiday",
        paid: true,
        requiresWork: false,
        source: "government",
        notes: "Demo configurable holiday. Verify official source before production import.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "demo-calendar-makeup",
        calendarDate: startOfDate(new Date("2026-02-07T00:00:00+08:00")),
        dayType: "makeup_workday",
        name: "Makeup workday",
        paid: true,
        requiresWork: true,
        source: "company",
        notes: "Demo makeup workday.",
        createdAt: now,
        updatedAt: now,
      },
    ],
    reviews: [
      {
        id: "demo-calendar-review-2026",
        calendarYear: 2026,
        sourceTitle: "Demo Taiwan government calendar source",
        sourceUrl: "https://www.dgpa.gov.tw/",
        sourceCheckedAt: startOfDate(new Date("2026-06-12T00:00:00+08:00")),
        reviewedBy: "HR One demo",
        reviewedAt: startOfDate(new Date("2026-06-12T00:00:00+08:00")),
        reviewStatus: "pending_review",
        nationalHolidayCount: 1,
        makeupWorkdayCount: 1,
        companyHolidayCount: 0,
        notes: "Demo review remains pending so production readiness stays honest.",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

async function saveDbCompanyCalendarDay(
  session: SessionLike,
  input: ReturnType<typeof normalizeCalendarInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = input.id
      ? await tx.companyCalendarDay.findFirst({
          where: {
            id: input.id,
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
        })
      : await tx.companyCalendarDay.findFirst({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            calendarDate: input.calendarDate,
          },
        });

    const day = before
      ? await tx.companyCalendarDay.update({
          where: { id: before.id },
          data: dbCalendarData(input),
        })
      : await tx.companyCalendarDay.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            createdByUserId: session.user?.id,
            ...dbCalendarData(input),
          },
        });

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "company_calendar_day",
      entityId: day.id,
      before,
      after: day,
      metadata: {
        calendarDate: day.calendarDate.toISOString().slice(0, 10),
        dayType: day.dayType,
        source: day.source,
      },
    });

    return mapCalendarDay(day);
  });
}

function saveDemoCompanyCalendarDay(
  session: SessionLike,
  input: ReturnType<typeof normalizeCalendarInput>,
) {
  const state = getCalendarDemoState();
  const key = dateKey(input.calendarDate);
  const existingIndex = state.days.findIndex((day) => day.id === input.id || dateKey(day.calendarDate) === key);
  const now = new Date();
  const day: CompanyCalendarDayView = {
    id: existingIndex >= 0 ? state.days[existingIndex].id : crypto.randomUUID(),
    calendarDate: input.calendarDate,
    dayType: input.dayType,
    name: input.name,
    paid: input.paid,
    requiresWork: input.requiresWork,
    source: input.source,
    notes: input.notes,
    createdAt: existingIndex >= 0 ? state.days[existingIndex].createdAt : now,
    updatedAt: now,
  };
  if (existingIndex >= 0) {
    state.days[existingIndex] = day;
  } else {
    state.days.push(day);
  }
  state.days.sort((a, b) => a.calendarDate.getTime() - b.calendarDate.getTime());

  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: existingIndex >= 0 ? "update" : "create",
    entityType: "company_calendar_day",
    entityId: day.id,
    after: day,
    metadata: {
      calendarDate: dateKey(day.calendarDate),
      dayType: day.dayType,
      source: day.source,
    },
  });
  return day;
}

async function saveDbCompanyCalendarReview(
  session: SessionLike,
  input: ReturnType<typeof normalizeCalendarReviewInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = await tx.companyCalendarReview.findUnique({
      where: {
        companyId_calendarYear: {
          companyId: session.companyId!,
          calendarYear: input.calendarYear,
        },
      },
    });
    const review = before
      ? await tx.companyCalendarReview.update({
          where: { id: before.id },
          data: {
            ...dbCalendarReviewData(input),
            updatedByUserId: session.user?.id,
          },
        })
      : await tx.companyCalendarReview.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            updatedByUserId: session.user?.id,
            ...dbCalendarReviewData(input),
          },
        });

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "company_calendar_review",
      entityId: review.id,
      before,
      after: review,
      metadata: {
        calendarYear: review.calendarYear,
        reviewStatus: review.reviewStatus,
        sourceCheckedAt: review.sourceCheckedAt.toISOString().slice(0, 10),
        nationalHolidayCount: review.nationalHolidayCount,
        makeupWorkdayCount: review.makeupWorkdayCount,
      },
    });

    return mapCalendarReview(review);
  });
}

function saveDemoCompanyCalendarReview(
  session: SessionLike,
  input: ReturnType<typeof normalizeCalendarReviewInput>,
) {
  const state = getCalendarDemoState();
  const existingIndex = state.reviews.findIndex((review) => review.calendarYear === input.calendarYear);
  const now = new Date();
  const review: CompanyCalendarReviewView = {
    id: existingIndex >= 0 ? state.reviews[existingIndex].id : crypto.randomUUID(),
    ...input,
    createdAt: existingIndex >= 0 ? state.reviews[existingIndex].createdAt : now,
    updatedAt: now,
  };
  if (existingIndex >= 0) {
    state.reviews[existingIndex] = review;
  } else {
    state.reviews.push(review);
  }
  state.reviews.sort((a, b) => b.calendarYear - a.calendarYear);

  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: existingIndex >= 0 ? "update" : "create",
    entityType: "company_calendar_review",
    entityId: review.id,
    after: review,
    metadata: {
      calendarYear: review.calendarYear,
      reviewStatus: review.reviewStatus,
      sourceCheckedAt: dateKey(review.sourceCheckedAt),
      nationalHolidayCount: review.nationalHolidayCount,
      makeupWorkdayCount: review.makeupWorkdayCount,
    },
  });
  return review;
}

export function evaluateCompanyCalendarReadiness(input: {
  days: CompanyCalendarDayView[];
  reviews: CompanyCalendarReviewView[];
  calendarYear: number;
  now?: Date;
  maxSourceAgeDays?: number;
}): CompanyCalendarReadiness {
  const now = input.now ?? new Date();
  const maxSourceAgeDays = input.maxSourceAgeDays ?? 365;
  const yearDays = input.days.filter((day) => taiwanCalendarYear(day.calendarDate) === input.calendarYear);
  const counts = {
    nationalHolidays: yearDays.filter((day) => day.dayType === "national_holiday").length,
    makeupWorkdays: yearDays.filter((day) => day.dayType === "makeup_workday").length,
    companyHolidays: yearDays.filter((day) => day.dayType === "company_holiday").length,
  };
  const review = input.reviews.find((item) => item.calendarYear === input.calendarYear) ?? null;
  const missing: string[] = [];
  if (!review) {
    missing.push("approved annual calendar review");
  } else {
    if (review.reviewStatus !== "approved") missing.push("approved review status");
    if (!review.sourceUrl.startsWith("https://")) missing.push("HTTPS official source URL");
    if (!review.reviewedBy.trim()) missing.push("reviewer");
    if (daysBetween(review.sourceCheckedAt, now) > maxSourceAgeDays) missing.push("fresh government source review");
    if (counts.nationalHolidays < review.nationalHolidayCount) missing.push("national holiday records");
    if (counts.makeupWorkdays < review.makeupWorkdayCount) missing.push("makeup workday records");
    if (counts.companyHolidays < review.companyHolidayCount) missing.push("company holiday records");
  }
  return {
    ready: missing.length === 0,
    calendarYear: input.calendarYear,
    detail: review
      ? `${review.reviewStatus}; ${counts.nationalHolidays}/${review.nationalHolidayCount} national holiday(s), ${counts.makeupWorkdays}/${review.makeupWorkdayCount} makeup workday(s); source checked ${dateKey(review.sourceCheckedAt)}.`
      : `No annual calendar review for ${input.calendarYear}.`,
    review,
    counts,
    missing,
  };
}

function normalizeCalendarInput(input: CompanyCalendarInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Calendar day name is required.");
  const calendarDate = startOfDate(input.calendarDate);
  if (Number.isNaN(calendarDate.getTime())) {
    throw new Error("Calendar date is required.");
  }
  const dayType = normalizeDayType(input.dayType);
  const requiresWork = dayType === "makeup_workday" || dayType === "regular_workday"
    ? Boolean(input.requiresWork)
    : false;
  return {
    id: input.id || null,
    calendarDate,
    dayType,
    name,
    paid: Boolean(input.paid),
    requiresWork,
    source: normalizeSource(input.source),
    notes: input.notes?.trim() || null,
  };
}

function normalizeCalendarReviewInput(input: CompanyCalendarReviewInput) {
  const calendarYear = Number(input.calendarYear);
  if (!Number.isInteger(calendarYear) || calendarYear < 2020 || calendarYear > 2100) {
    throw new Error("Calendar year must be between 2020 and 2100.");
  }
  const sourceTitle = input.sourceTitle.trim();
  if (!sourceTitle) throw new Error("Calendar source title is required.");
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl.startsWith("https://")) throw new Error("Calendar source URL must use HTTPS.");
  const sourceCheckedAt = startOfDate(input.sourceCheckedAt);
  if (Number.isNaN(sourceCheckedAt.getTime())) throw new Error("Calendar source checked date is required.");
  const reviewedBy = input.reviewedBy.trim();
  if (!reviewedBy) throw new Error("Calendar reviewer is required.");
  const reviewedAt = startOfDate(input.reviewedAt);
  if (Number.isNaN(reviewedAt.getTime())) throw new Error("Calendar reviewed date is required.");
  return {
    calendarYear,
    sourceTitle,
    sourceUrl,
    sourceCheckedAt,
    reviewedBy,
    reviewedAt,
    reviewStatus: input.reviewStatus === "approved" ? "approved" as const : "pending_review" as const,
    nationalHolidayCount: nonNegativeInteger(input.nationalHolidayCount),
    makeupWorkdayCount: nonNegativeInteger(input.makeupWorkdayCount),
    companyHolidayCount: nonNegativeInteger(input.companyHolidayCount),
    notes: input.notes?.trim() || null,
  };
}

function dbCalendarData(input: ReturnType<typeof normalizeCalendarInput>) {
  return {
    calendarDate: input.calendarDate,
    dayType: input.dayType,
    name: input.name,
    paid: input.paid,
    requiresWork: input.requiresWork,
    source: input.source,
    notes: input.notes,
  };
}

function dbCalendarReviewData(input: ReturnType<typeof normalizeCalendarReviewInput>) {
  return {
    calendarYear: input.calendarYear,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    sourceCheckedAt: input.sourceCheckedAt,
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt,
    reviewStatus: input.reviewStatus,
    nationalHolidayCount: input.nationalHolidayCount,
    makeupWorkdayCount: input.makeupWorkdayCount,
    companyHolidayCount: input.companyHolidayCount,
    notes: input.notes,
  };
}

function mapCalendarDay(row: {
  id: string;
  calendarDate: Date;
  dayType: string;
  name: string;
  paid: boolean;
  requiresWork: boolean;
  source: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CompanyCalendarDayView {
  return {
    id: row.id,
    calendarDate: row.calendarDate,
    dayType: normalizeDayType(row.dayType),
    name: row.name,
    paid: row.paid,
    requiresWork: row.requiresWork,
    source: normalizeSource(row.source),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCalendarReview(row: {
  id: string;
  calendarYear: number;
  sourceTitle: string;
  sourceUrl: string;
  sourceCheckedAt: Date;
  reviewedBy: string;
  reviewedAt: Date;
  reviewStatus: string;
  nationalHolidayCount: number;
  makeupWorkdayCount: number;
  companyHolidayCount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CompanyCalendarReviewView {
  return {
    id: row.id,
    calendarYear: row.calendarYear,
    sourceTitle: row.sourceTitle,
    sourceUrl: row.sourceUrl,
    sourceCheckedAt: row.sourceCheckedAt,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    reviewStatus: normalizeReviewStatus(row.reviewStatus),
    nationalHolidayCount: row.nationalHolidayCount,
    makeupWorkdayCount: row.makeupWorkdayCount,
    companyHolidayCount: row.companyHolidayCount,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getCalendarDemoState() {
  if (!globalForCalendar.hrOneCompanyCalendarDemoState) {
    resetCompanyCalendarDemoState();
  }
  return globalForCalendar.hrOneCompanyCalendarDemoState!;
}

function normalizeDayType(value: string): CalendarDayType {
  if (value === "makeup_workday" || value === "company_holiday" || value === "regular_workday") {
    return value;
  }
  return "national_holiday";
}

function normalizeSource(value: string): CompanyCalendarDayView["source"] {
  if (value === "government" || value === "import") return value;
  return "company";
}

function normalizeReviewStatus(value: string): CalendarReviewStatus {
  return value === "approved" ? "approved" : "pending_review";
}

function startOfDate(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function nonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function currentTaiwanCalendarYear(now = new Date()) {
  return taiwanCalendarYear(now);
}

function taiwanCalendarYear(date: Date) {
  return Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
  }).format(date));
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((startOfDate(to).getTime() - startOfDate(from).getTime()) / 86_400_000);
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
