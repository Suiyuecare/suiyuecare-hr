import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  generateSchedulesFromShiftTemplate,
  getShiftTemplateSettings,
  resetShiftTemplateDemoState,
  saveShiftTemplateSettings,
} from "./shift-templates";

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

describe("shift templates", () => {
  beforeEach(() => {
    resetShiftTemplateDemoState();
    resetAuditDemoState();
  });

  it("lets owners create audited cross-midnight shift templates", async () => {
    const template = await saveShiftTemplateSettings(ownerSession, {
      code: "night",
      name: "Night 22:00-07:00",
      status: "active",
      startTime: "22:00",
      endTime: "07:00",
      breakMinutes: 60,
      eligibleWeekdays: [1, 2, 3, 4, 5],
      notes: "Night shift review required.",
    });

    expect(template).toMatchObject({
      code: "night",
      crossesMidnight: true,
      scheduledMinutes: 480,
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "create",
      entityType: "shift_template",
    });
  });

  it("generates audited schedules from a shift template", async () => {
    const [template] = await getShiftTemplateSettings(ownerSession);
    const result = await generateSchedulesFromShiftTemplate(ownerSession, {
      shiftTemplateId: template.id,
      workDate: new Date("2026-06-12T00:00:00+08:00"),
      overwriteExisting: true,
    });

    expect(result).toEqual({ affectedCount: 5 });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "create",
      entityType: "work_schedule_generation",
    });
  });

  it("blocks managers from changing shift templates", async () => {
    await expect(
      saveShiftTemplateSettings(managerSession, {
        code: "manager",
        name: "Manager shift",
        status: "active",
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60,
        eligibleWeekdays: [1, 2, 3, 4, 5],
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
