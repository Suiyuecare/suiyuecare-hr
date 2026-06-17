import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAnnouncementDemoState } from "@/server/announcements/service";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { resetLeavePolicyDemoState } from "@/server/leave/policies";
import { getPayrollDashboard } from "@/server/payroll/service";
import { resetPayrollDemoState } from "@/server/payroll/demo-store";
import { resetRuleSettingsDemoState } from "@/server/rules/settings";
import { resetShiftTemplateDemoState } from "@/server/scheduling/shift-templates";
import {
  readCompanySetupWizardSnapshot,
} from "@/server/readiness/company-setup-wizard";
import { runCompanySetupAction } from "./company-setup-actions";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("company setup actions", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetAnnouncementDemoState();
    resetAuditDemoState();
    resetLeavePolicyDemoState();
    resetPayrollDemoState();
    resetRuleSettingsDemoState();
    resetShiftTemplateDemoState();
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("lets HR generate two-week schedules without exposing employee details", async () => {
    const result = await runCompanySetupAction(hrSession, "generate_14_day_schedules");

    expect(result).toMatchObject({
      actionId: "generate_14_day_schedules",
      status: "completed",
    });
    expect(result.affectedCount).toBeGreaterThan(0);
    expect(getAuditDemoState().logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "company_setup_action", entityId: "generate_14_day_schedules" }),
        expect.objectContaining({ entityType: "work_schedule_generation" }),
      ]),
    );
    expect(JSON.stringify(getAuditDemoState().logs)).not.toContain("A123456789");
  });

  it("syncs leave balances for the full pilot company", async () => {
    const result = await runCompanySetupAction(hrSession, "sync_leave_balances");
    const snapshot = await readCompanySetupWizardSnapshot(hrSession);

    expect(result).toMatchObject({
      actionId: "sync_leave_balances",
      status: "completed",
    });
    expect(snapshot.leaveBalanceEmployeeCount).toBe(25);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      entityType: "company_setup_action",
      metadataJson: expect.objectContaining({
        actionId: "sync_leave_balances",
        containsSensitiveData: false,
      }),
    });
  });

  it("publishes one trial announcement and skips duplicates", async () => {
    const first = await runCompanySetupAction(hrSession, "publish_trial_announcement");
    const second = await runCompanySetupAction(hrSession, "publish_trial_announcement");

    expect(first).toMatchObject({
      actionId: "publish_trial_announcement",
      status: "completed",
      affectedCount: 1,
    });
    expect(second).toMatchObject({
      actionId: "publish_trial_announcement",
      status: "skipped",
      affectedCount: 0,
    });
    const auditOutput = JSON.stringify(getAuditDemoState().logs);
    expect(auditOutput).not.toContain("請員工每天使用手機首頁完成打卡");
  });

  it("runs the demo payroll rehearsal and keeps salary values out of setup audit metadata", async () => {
    const result = await runCompanySetupAction(hrSession, "run_payroll_rehearsal");
    const dashboard = await getPayrollDashboard(hrSession);
    const snapshot = await readCompanySetupWizardSnapshot(hrSession);

    expect(result).toMatchObject({
      actionId: "run_payroll_rehearsal",
      status: "completed",
      affectedCount: 5,
    });
    expect(dashboard.run).toMatchObject({ status: "released" });
    expect(snapshot.releasedPayslipEmployeeCount).toBe(5);
    const setupAudit = getAuditDemoState().logs.find(
      (log) => log.entityType === "company_setup_action" && log.entityId === "run_payroll_rehearsal",
    );
    expect(JSON.stringify(setupAudit)).not.toContain("62000");
    expect(JSON.stringify(setupAudit)).not.toContain("78000");
  });

  it("blocks managers from guided setup actions", async () => {
    await expect(
      runCompanySetupAction(managerSession, "generate_14_day_schedules"),
    ).rejects.toThrow(/settings:read/);
  });
});
