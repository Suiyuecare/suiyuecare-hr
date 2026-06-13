import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getCompanyCalendarSettings,
  getCompanyCalendarWorkspace,
  resetCompanyCalendarDemoState,
  saveCompanyCalendarDay,
  saveCompanyCalendarReview,
} from "./company-calendar";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王老闆" },
  employee: { id: "demo-owner-employee", displayName: "王老闆" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("company calendar settings", () => {
  beforeEach(() => {
    resetCompanyCalendarDemoState();
    resetAuditDemoState();
  });

  it("lets authorized users configure audited holidays and makeup workdays", async () => {
    const day = await saveCompanyCalendarDay(ownerSession, {
      calendarDate: new Date("2026-04-06T00:00:00+08:00"),
      dayType: "company_holiday",
      name: "Company founding day",
      paid: true,
      requiresWork: false,
      source: "company",
      notes: "Board approved.",
    });

    const days = await getCompanyCalendarSettings(ownerSession);

    expect(day).toMatchObject({
      dayType: "company_holiday",
      paid: true,
      requiresWork: false,
      source: "company",
    });
    expect(days).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Company founding day" })]));
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "create",
      entityType: "company_calendar_day",
    });
  });

  it("blocks managers from changing company calendar days", async () => {
    await expect(
      saveCompanyCalendarDay(managerSession, {
        calendarDate: new Date("2026-05-01T00:00:00+08:00"),
        dayType: "national_holiday",
        name: "Labor day",
        paid: true,
        requiresWork: false,
        source: "government",
      }),
    ).rejects.toThrow(/settings:write/);
  });

  it("tracks audited annual calendar review readiness", async () => {
    let workspace = await getCompanyCalendarWorkspace(ownerSession);
    expect(workspace.readiness.ready).toBe(false);
    expect(workspace.readiness.missing).toContain("approved review status");

    await saveCompanyCalendarReview(ownerSession, {
      calendarYear: 2026,
      sourceTitle: "DGPA 2026 annual calendar",
      sourceUrl: "https://www.dgpa.gov.tw/",
      sourceCheckedAt: new Date("2026-06-12T00:00:00+08:00"),
      reviewedBy: "王老闆",
      reviewedAt: new Date("2026-06-12T00:00:00+08:00"),
      reviewStatus: "approved",
      nationalHolidayCount: 1,
      makeupWorkdayCount: 1,
      companyHolidayCount: 0,
      notes: "Reviewed official annual calendar.",
    });

    workspace = await getCompanyCalendarWorkspace(ownerSession);
    expect(workspace.readiness).toMatchObject({
      ready: true,
      calendarYear: 2026,
    });
    expect(workspace.readiness.detail).toContain("source checked 2026-06-12");
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "company_calendar_review",
    });
  });
});
