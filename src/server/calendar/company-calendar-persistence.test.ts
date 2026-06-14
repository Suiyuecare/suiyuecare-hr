import { afterEach, describe, expect, it, vi } from "vitest";

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-owner", displayName: "Owner" },
  employee: { id: "employee-owner", displayName: "Owner" },
};

const dayInput = {
  calendarDate: new Date("2026-04-06T00:00:00.000Z"),
  dayType: "national_holiday" as const,
  name: "Holiday",
  paid: true,
  requiresWork: false,
  source: "government" as const,
};

const reviewInput = {
  calendarYear: 2026,
  sourceTitle: "DGPA 2026 annual calendar",
  sourceUrl: "https://www.dgpa.gov.tw/",
  sourceCheckedAt: new Date("2026-06-12T00:00:00.000Z"),
  reviewedBy: "Owner",
  reviewedAt: new Date("2026-06-12T00:00:00.000Z"),
  reviewStatus: "approved" as const,
  nationalHolidayCount: 1,
  makeupWorkdayCount: 0,
  companyHolidayCount: 0,
};

describe("company calendar persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo calendar data when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyCalendarDay: {
          findMany: vi.fn(async () => {
            throw new Error("database company calendar day read failed");
          }),
        },
        companyCalendarReview: {
          findMany: vi.fn(async () => {
            throw new Error("database company calendar review read failed");
          }),
        },
      }),
    }));

    const {
      getCompanyCalendarReviews,
      getCompanyCalendarSettings,
      getCompanyCalendarWorkspace,
    } = await import("./company-calendar");

    await expect(getCompanyCalendarSettings(ownerSession)).rejects.toThrow(
      "database company calendar day read failed",
    );
    await expect(getCompanyCalendarReviews(ownerSession)).rejects.toThrow(
      "database company calendar review read failed",
    );
    await expect(getCompanyCalendarWorkspace(ownerSession)).rejects.toThrow();
  });

  it("does not fall back to demo calendar saves when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database company calendar write failed");
        }),
      }),
    }));

    const {
      saveCompanyCalendarDay,
      saveCompanyCalendarReview,
    } = await import("./company-calendar");

    await expect(saveCompanyCalendarDay(ownerSession, dayInput)).rejects.toThrow(
      "database company calendar write failed",
    );
    await expect(saveCompanyCalendarReview(ownerSession, reviewInput)).rejects.toThrow(
      "database company calendar write failed",
    );
  });
});
