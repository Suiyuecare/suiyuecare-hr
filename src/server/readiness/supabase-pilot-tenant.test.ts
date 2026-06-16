import { describe, expect, it } from "vitest";
import {
  buildSupabasePilotTenantSeedPlan,
  buildSupabasePilotTenantVerificationChecks,
  buildSupabasePilotTenantVerificationSql,
  supabasePilotTenantVerificationPassed,
  type SupabasePilotTenantVerificationSnapshot,
} from "@/server/readiness/supabase-pilot-tenant";

const readySnapshot: SupabasePilotTenantVerificationSnapshot = {
  tenantCount: 1,
  companyCount: 1,
  employeeCount: 25,
  managerCount: 3,
  departmentCount: 4,
  userCount: 25,
  userRoleCount: 25,
  roleKeys: ["employee", "hr_admin", "manager", "owner"],
  roleAssignmentKeys: ["employee", "hr_admin", "manager", "owner"],
  attendancePolicyCount: 1,
  shiftTemplateCount: 1,
  workScheduleCount: 375,
  leavePolicyCount: 11,
  leaveBalanceCount: 275,
  salaryProfileCount: 25,
  payrollComplianceProfileCount: 25,
  statutoryInsuranceReadyEmployeeCount: 25,
  paymentProfileCount: 25,
  releasedPayrollRunCount: 1,
  payrollItemCount: 75,
  releasedPayslipCount: 25,
  announcementCount: 1,
  announcementReceiptCount: 25,
  formTemplateCount: 1,
  workflowStepCount: 2,
  calendarDayCount: 2,
  approvedCalendarReviewCount: 1,
  completeLaborRosterProfileCount: 25,
  approvedPolicyDocumentCount: 4,
  activeWorkRuleCount: 1,
  workRuleAcknowledgementCount: 25,
  verifiedFileStorageCount: 1,
  externalNotificationSettingCount: 1,
  verifiedPayrollPaymentSecurityCount: 1,
  readyWorktimeAgreementCount: 1,
  commercialSubscriptionCount: 1,
  backupPostureConfiguredCount: 1,
  activeRuleVersionCount: 3,
  telemetryEventCount: 29,
  betaPilotTrialRunCount: 1,
  auditLogCount: 11,
  auditEntityTypes: [
    "employee",
    "employee_import",
    "employee_labor_roster_profile",
    "employee_payment_profile",
    "law_rule",
    "payroll_compliance_profile",
    "payroll_profile_import",
    "payroll_run",
    "payslip",
    "pilot_seed",
    "salary_profile",
  ],
  exposedTablePrivilegeCount: 0,
  anonUsage: false,
  authenticatedUsage: false,
  publicSecurityDefinerExecuteCount: 0,
};

describe("Supabase pilot tenant seed", () => {
  it("builds a 25-person pilot seed without public schema references", () => {
    const plan = buildSupabasePilotTenantSeedPlan({
      schemaName: "hr_one",
      referenceDate: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(plan.summary).toMatchObject({
      tenantSlug: "suiyuecare-pilot",
      employeeCount: 25,
      managerCount: 3,
      departmentCount: 4,
      releasedPayslipCount: 25,
      auditLogCount: 11,
    });
    expect(plan.sql).toContain('SET search_path TO "hr_one";');
    expect(plan.sql).toContain('"PayrollRun"');
    expect(plan.sql).toContain('"AuditLog"');
    expect(plan.sql).toContain('"CompanyCalendarReview"');
    expect(plan.sql).toContain('"EmployeeLaborRosterProfile"');
    expect(plan.sql).toContain('"CompanyPayrollPaymentSecuritySetting"');
    expect(plan.sql).not.toContain("public.");
    expect(plan.sql).not.toContain("national_id=");
  });

  it("builds a private-schema verification query", () => {
    const sql = buildSupabasePilotTenantVerificationSql("hr_one");

    expect(sql).toContain('SET search_path TO "hr_one";');
    expect(sql).toContain('"Payslip"');
    expect(sql).toContain("information_schema.table_privileges");
    expect(sql).toContain("n.nspname = 'public'");
  });

  it("passes when the Supabase pilot tenant has operational trial data and no browser grants", () => {
    const checks = buildSupabasePilotTenantVerificationChecks(readySnapshot);

    expect(supabasePilotTenantVerificationPassed(checks)).toBe(true);
  });

  it("fails when audit coverage is incomplete or browser roles can access the private schema", () => {
    const checks = buildSupabasePilotTenantVerificationChecks({
      ...readySnapshot,
      auditEntityTypes: readySnapshot.auditEntityTypes.filter((entityType) => entityType !== "payslip"),
      exposedTablePrivilegeCount: 1,
      anonUsage: true,
      publicSecurityDefinerExecuteCount: 2,
    });

    expect(supabasePilotTenantVerificationPassed(checks)).toBe(false);
    expect(checks.filter((item) => !item.passed).map((item) => item.name)).toEqual([
      "audit coverage",
      "Supabase browser role schema usage",
      "Supabase browser table grants",
      "Supabase public security-definer RPC exposure",
    ]);
  });
});
