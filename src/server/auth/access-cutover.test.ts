import { describe, expect, it } from "vitest";
import type { UserAccessEmployeeOption, UserAccessRow, UserAccessWorkspace } from "./access-management";
import { buildAccessCutoverReport } from "./access-cutover";
import type { RoleKey } from "./rbac";

const now = new Date("2026-06-22T01:00:00.000Z");

describe("access production cutover report", () => {
  it("blocks production cutover when demo auth is still available", () => {
    const report = buildAccessCutoverReport(readyWorkspace(), {
      supportAccessGovernance: readySupportAccessGovernance(),
      demoAuthRuntime: {
        allowed: true,
        reason: "Demo auth is available for local development and smoke tests.",
      },
    });

    expect(report.readyForProduction).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.topTask.id).toBe("demo_auth_shutdown");
    expect(report.tasks.find((task) => task.id === "payroll_salary_boundary")).toMatchObject({
      status: "ready",
      signal: "0 個已知漏洞",
    });
  });

  it("requires SSO metadata, privileged identity binding, employee links, and support governance", () => {
    const workspace = readyWorkspace({
      ssoEnabled: false,
      ssoMetadataConfigured: false,
      users: [
        user("owner", "owner", []),
        user("hr", "hr_admin", []),
        user("manager", "manager", []),
        user("employee", "employee", []),
      ],
      employees: [
        employee("emp-1", "E001", "owner"),
        employee("emp-2", "E002", null),
      ],
    });

    const report = buildAccessCutoverReport(workspace, {
      supportAccessGovernance: {
        activeApprovedCount: 1,
        activeUnapprovedCount: 1,
        expiredStillApprovedCount: 1,
      },
      demoAuthRuntime: {
        allowed: false,
        reason: "Demo auth is disabled when HR_ONE_ENV=production.",
      },
    });

    expect(report.readyForProduction).toBe(false);
    expect(report.tasks.find((task) => task.id === "production_sso_policy")?.status).toBe("action_required");
    expect(report.tasks.find((task) => task.id === "privileged_sso_identity")?.signal).toBe("0/3 已綁定");
    expect(report.tasks.find((task) => task.id === "employee_user_link_coverage")?.signal).toBe("1/2 已綁定");
    expect(report.tasks.find((task) => task.id === "support_access_governance")?.status).toBe("blocked");
  });

  it("marks the cutover ready only when all production access gates pass", () => {
    const report = buildAccessCutoverReport(readyWorkspace(), {
      supportAccessGovernance: readySupportAccessGovernance(),
      demoAuthRuntime: {
        allowed: false,
        reason: "Demo auth is disabled when HR_ONE_AUTH_SESSION_SOURCE=oidc.",
      },
    });

    expect(report.readyForProduction).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.blockedCount).toBe(0);
    expect(report.actionRequiredCount).toBe(0);
    expect(report.metrics.find((metric) => metric.label === "薪資防漏")).toMatchObject({
      value: "0 漏洞",
      status: "ready",
    });
  });
});

function readyWorkspace(overrides: Partial<UserAccessWorkspace> = {}): UserAccessWorkspace {
  return {
    users: [
      user("owner", "owner"),
      user("hr", "hr_admin"),
      user("manager", "manager"),
      user("employee", "employee", []),
    ],
    employees: [
      employee("emp-1", "E001", "hr"),
      employee("emp-2", "E002", "manager"),
      employee("emp-3", "E003", "employee"),
    ],
    allowedEmailDomains: ["hrone.test"],
    ssoEnabled: true,
    ssoMetadataConfigured: true,
    adminMfaRequired: true,
    employeeMfaRequired: false,
    passwordMinLength: 12,
    ...overrides,
  };
}

function user(id: string, role: RoleKey, externalIdentities = [identity(id)]): UserAccessRow {
  return {
    id,
    email: `${id}@hrone.test`,
    displayName: id,
    status: "active",
    roles: [role],
    externalIdentities,
    employee: null,
    authRequirement: role === "employee" ? "password_or_sso" : "sso",
    createdAt: now,
    updatedAt: now,
  };
}

function identity(id: string): UserAccessRow["externalIdentities"][number] {
  return {
    id: `identity-${id}`,
    provider: "Entra ID",
    issuer: "https://login.example.com/customer/v2.0",
    subjectHash: `${id.padEnd(16, "0").slice(0, 16)}`,
    emailAtLink: `${id}@hrone.test`,
    lastSeenAt: now,
  };
}

function employee(id: string, employeeNo: string, userId: string | null): UserAccessEmployeeOption {
  return {
    id,
    employeeNo,
    displayName: employeeNo,
    departmentName: "營運部",
    userId,
  };
}

function readySupportAccessGovernance() {
  return {
    activeApprovedCount: 0,
    activeUnapprovedCount: 0,
    expiredStillApprovedCount: 0,
  };
}
