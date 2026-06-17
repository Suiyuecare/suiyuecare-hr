import { describe, expect, it } from "vitest";
import {
  buildCompanySetupWizardReport,
  type CompanySetupWizardSnapshot,
} from "@/server/readiness/company-setup-wizard";

describe("company setup wizard", () => {
  it("marks setup complete when the pilot company can run the two-week trial", () => {
    const report = buildCompanySetupWizardReport({
      snapshot: setupSnapshot(),
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "complete",
      completedStepCount: 9,
      blockedStepCount: 0,
      warningStepCount: 0,
      pilotEmployeeRangeReady: true,
    });
    expect(report.nextActions).toHaveLength(0);
  });

  it("blocks trial setup when schedules and leave balances do not cover all employees", () => {
    const report = buildCompanySetupWizardReport({
      snapshot: setupSnapshot({
        scheduledEmployeeCount: 12,
        leaveBalanceEmployeeCount: 8,
      }),
    });

    expect(report.status).toBe("blocked");
    expect(report.steps.find((step) => step.id === "shift_schedule")).toMatchObject({
      status: "blocked",
      missing: ["前 14 天班表覆蓋 12/25"],
    });
    expect(report.steps.find((step) => step.id === "leave_balance")).toMatchObject({
      status: "blocked",
      missing: ["假別餘額覆蓋 8/25"],
    });
  });

  it("blocks payroll setup when payslip self-service is disabled", () => {
    const report = buildCompanySetupWizardReport({
      snapshot: setupSnapshot({
        employeePayslipEnabled: false,
        payrollRecordkeepingReady: false,
        releasedPayslipEmployeeCount: 0,
      }),
    });
    const payrollStep = report.steps.find((step) => step.id === "payroll_payslip");

    expect(report.status).toBe("blocked");
    expect(payrollStep).toMatchObject({
      status: "blocked",
      primaryHref: "/hr",
    });
    expect(payrollStep?.missing).toEqual(
      expect.arrayContaining([
        "薪資保存與勞檢匯出設定尚未就緒",
        "啟用員工薪資單自助查看",
      ]),
    );
  });

  it("keeps SSO as a warning while hard RBAC coverage blocks invitations", () => {
    const report = buildCompanySetupWizardReport({
      snapshot: setupSnapshot({
        ssoEnabled: false,
        activeLinkedUserCount: 24,
        employeeRoleAssignmentCount: 24,
      }),
    });
    const accessStep = report.steps.find((step) => step.id === "employee_access");

    expect(report.status).toBe("blocked");
    expect(accessStep).toMatchObject({
      status: "blocked",
    });
    expect(accessStep?.missing).toEqual(
      expect.arrayContaining([
        "員工登入帳號覆蓋 24/25",
        "employee 角色覆蓋 24/25",
        "正式試用建議啟用 SSO 或完成替代登入策略",
      ]),
    );
  });

  it("does not expose sensitive personal or payroll details in next actions", () => {
    const report = buildCompanySetupWizardReport({
      snapshot: setupSnapshot({
        activeLinkedUserCount: 20,
        employeeRoleAssignmentCount: 20,
        releasedPayslipEmployeeCount: 5,
      }),
    });
    const output = JSON.stringify(report);

    expect(output).not.toContain("A123456789");
    expect(output).not.toContain("56000");
    expect(output).not.toContain("bank");
    expect(output).not.toContain("employee@example.com");
  });
});

function setupSnapshot(
  overrides: Partial<CompanySetupWizardSnapshot> = {},
): CompanySetupWizardSnapshot {
  return {
    companyFound: true,
    companyName: "customer-co",
    departmentCount: 4,
    activeEmployeeCount: 25,
    managerWithDirectReportsCount: 3,
    employeesWithoutDepartmentCount: 0,
    activeUserCount: 27,
    activeLinkedUserCount: 25,
    employeeRoleAssignmentCount: 25,
    managerRoleAssignmentCount: 3,
    ownerRoleAssignmentCount: 1,
    hrAdminRoleAssignmentCount: 1,
    ssoEnabled: true,
    externalIdentityUserCount: 25,
    activeShiftTemplateCount: 2,
    scheduledEmployeeCount: 25,
    activeAttendancePolicyCount: 1,
    mobilePunchEnabled: true,
    attendanceSelfServiceEnabled: true,
    overtimeApprovalRequired: true,
    punchCorrectionApprovalRequired: true,
    activeLeavePolicyCount: 10,
    leaveBalanceEmployeeCount: 25,
    publishedAnnouncementCount: 1,
    receiptRequiredAnnouncementCount: 1,
    payrollRecordkeepingReady: true,
    employeePayslipEnabled: true,
    releasedPayslipEmployeeCount: 25,
    auditLogCount: 20,
    ...overrides,
  };
}
