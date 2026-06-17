import { describe, expect, it } from "vitest";
import {
  buildPilotInviteReadinessReport,
  formatPilotInviteReadinessMarkdown,
  pilotInviteReadinessPassed,
  type PilotInviteReadinessSnapshot,
} from "@/server/readiness/pilot-invite-readiness";

describe("pilot invite readiness", () => {
  it("passes when every pilot employee and manager can be invited with correct roles", () => {
    const report = buildPilotInviteReadinessReport({
      snapshot: inviteSnapshot(),
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "ready",
      activeEmployeeCount: 25,
      managerWithDirectReportsCount: 3,
      scheduledEmployeeCount: 25,
      leaveBalanceEmployeeCount: 25,
      releasedPayslipEmployeeCount: 25,
      blockers: 0,
      warnings: 0,
    });
    expect(report.checks.map((check) => check.status)).toEqual([
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
    ]);
    expect(report.preparationAreas.map((area) => area.status)).toEqual([
      "ready",
      "ready",
      "ready",
      "ready",
      "ready",
    ]);
    expect(pilotInviteReadinessPassed(report)).toBe(true);
  });

  it("blocks missing user links, manager role coverage, and SSO identities", () => {
    const report = buildPilotInviteReadinessReport({
      snapshot: inviteSnapshot({
        linkedUserCount: 24,
        activeLinkedUserCount: 23,
        employeeRoleAssignmentCount: 24,
        externalIdentityEmployeeCount: 20,
        emailDomainViolationCount: 2,
        managerLinkedUserCount: 2,
        managerRoleAssignmentCount: 2,
      }),
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toBeGreaterThanOrEqual(5);
    expect(report.checks.find((check) => check.name === "active user link for every employee")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.name === "manager login and role coverage")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.name === "SSO identity coverage")).toMatchObject({
      status: "block",
    });
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "Create or link one active user account for every active employee before sending invitations.",
        "Make every manager with direct reports an active linked user with the manager role.",
        "Enable production SSO and link external identities for every pilot employee user.",
      ]),
    );
    expect(report.preparationAreas.find((area) => area.id === "employee_access")).toMatchObject({
      status: "blocked",
      readyCount: 20,
      gapCount: 5,
    });
    expect(report.preparationAreas.find((area) => area.id === "manager_line")).toMatchObject({
      status: "blocked",
      readyCount: 2,
      gapCount: 1,
    });
  });

  it("treats missing SSO and department coverage as warnings while keeping output redacted", () => {
    const report = buildPilotInviteReadinessReport({
      snapshot: inviteSnapshot({
        ssoEnabled: false,
        externalIdentityEmployeeCount: 0,
        employeesWithoutDepartmentCount: 2,
      }),
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });
    const markdown = formatPilotInviteReadinessMarkdown(report);

    expect(report.status).toBe("action_required");
    expect(report.blockers).toBe(0);
    expect(report.warnings).toBe(2);
    expect(pilotInviteReadinessPassed(report)).toBe(false);
    expect(markdown).toContain("Status: action_required");
    expect(markdown).toContain("## Preparation Areas");
    expect(markdown).not.toContain("employee@example.com");
    expect(markdown).not.toContain("A123456789");
    expect(markdown).not.toContain("56000");
  });

  it("blocks missing schedules, leave balances, and unsafe payslip visibility", () => {
    const report = buildPilotInviteReadinessReport({
      snapshot: inviteSnapshot({
        scheduledEmployeeCount: 20,
        leaveBalanceEmployeeCount: 22,
        payslipSelfServiceEnabled: false,
        payslipVisibilityRuleSafe: false,
        releasedPayslipEmployeeCount: 8,
      }),
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.name === "14-day schedule coverage")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.name === "leave balance coverage")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.name === "payslip visibility rule")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.name === "released payslip rehearsal coverage")).toMatchObject({
      status: "warn",
    });
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "Publish work schedules for every active pilot employee covering the first 14 trial days.",
        "Create at least one active leave balance for every active pilot employee.",
        "Enable employee payslip self-service and keep the self-only payslip RBAC rule enforced.",
      ]),
    );
    expect(report.preparationAreas.find((area) => area.id === "schedule_leave")).toMatchObject({
      status: "blocked",
      readyCount: 20,
      gapCount: 5,
    });
    expect(report.preparationAreas.find((area) => area.id === "payslip_self_service")).toMatchObject({
      status: "blocked",
      readyCount: 0,
      gapCount: 25,
    });
  });

  it("blocks unknown tenant or company snapshots", () => {
    const report = buildPilotInviteReadinessReport({
      snapshot: inviteSnapshot({
        tenantFound: false,
        companyFound: false,
        activeEmployeeCount: 0,
        linkedUserCount: 0,
        activeLinkedUserCount: 0,
        employeeRoleAssignmentCount: 0,
        externalIdentityEmployeeCount: 0,
        managerWithDirectReportsCount: 0,
        managerLinkedUserCount: 0,
        managerRoleAssignmentCount: 0,
      }),
    });

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.name === "tenant and company")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.name === "20-50 active employees")).toMatchObject({
      status: "block",
    });
  });
});

function inviteSnapshot(
  overrides: Partial<PilotInviteReadinessSnapshot> = {},
): PilotInviteReadinessSnapshot {
  return {
    tenantFound: true,
    companyFound: true,
    tenantSlug: "customer-co",
    companyId: "company_1",
    ssoEnabled: true,
    allowedEmailDomainCount: 1,
    activeEmployeeCount: 25,
    linkedUserCount: 25,
    activeLinkedUserCount: 25,
    employeeRoleAssignmentCount: 25,
    externalIdentityEmployeeCount: 25,
    emailDomainViolationCount: 0,
    managerWithDirectReportsCount: 3,
    managerLinkedUserCount: 3,
    managerRoleAssignmentCount: 3,
    employeesWithoutManagerCount: 3,
    employeesWithoutDepartmentCount: 0,
    scheduledEmployeeCount: 25,
    leaveBalanceEmployeeCount: 25,
    payslipSelfServiceEnabled: true,
    payslipVisibilityRuleSafe: true,
    releasedPayslipEmployeeCount: 25,
    ...overrides,
  };
}
