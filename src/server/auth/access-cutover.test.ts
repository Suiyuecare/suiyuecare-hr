import { describe, expect, it } from "vitest";
import type { UserAccessEmployeeOption, UserAccessRow, UserAccessWorkspace } from "./access-management";
import { buildAccessCutoverReport } from "./access-cutover";
import type { RoleKey } from "./rbac";
import type { TenantIsolationGuardrailReport } from "./tenant-isolation";

const now = new Date("2026-06-22T01:00:00.000Z");
const readyEnv = {
  HR_ONE_AUTH_SESSION_SOURCE: "oidc",
  HR_ONE_ENCRYPTION_KEY: "production-encryption-key-with-at-least-32-chars",
  HR_ONE_WEB_SESSION_MAX_AGE_SECONDS: "28800",
  HR_ONE_AUTH_LOGIN_URL: "https://login.customer.co/oauth2/v2.0/authorize",
};

describe("access production cutover report", () => {
  it("blocks production cutover when demo auth is still available", () => {
    const report = buildAccessCutoverReport(readyWorkspace(), {
      supportAccessGovernance: readySupportAccessGovernance(),
      tenantIsolationGuardrail: readyTenantIsolationGuardrail(),
      env: readyEnv,
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
      tenantIsolationGuardrail: readyTenantIsolationGuardrail(),
      env: readyEnv,
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

  it("blocks production cutover when the browser session cookie posture is unsafe", () => {
    const report = buildAccessCutoverReport(readyWorkspace(), {
      supportAccessGovernance: readySupportAccessGovernance(),
      tenantIsolationGuardrail: readyTenantIsolationGuardrail(),
      env: {
        HR_ONE_AUTH_SESSION_SOURCE: "demo",
        HR_ONE_ENCRYPTION_KEY: "replace-with-at-least-32-random-characters",
        HR_ONE_WEB_SESSION_MAX_AGE_SECONDS: "172800",
        HR_ONE_AUTH_LOGIN_URL: "http://localhost:3000/login",
      },
      demoAuthRuntime: {
        allowed: false,
        reason: "Demo auth is disabled when HR_ONE_ENV=production.",
      },
    });

    expect(report.readyForProduction).toBe(false);
    expect(report.tasks.find((task) => task.id === "browser_session_cookie")).toMatchObject({
      status: "blocked",
      signal: "0/4 session 條件完成",
    });
    expect(report.metrics.find((metric) => metric.label === "Session Cookie")).toMatchObject({
      value: "阻擋",
      status: "blocked",
    });
  });

  it("blocks production cutover when tenant API guard coverage has a gap", () => {
    const report = buildAccessCutoverReport(readyWorkspace(), {
      supportAccessGovernance: readySupportAccessGovernance(),
      tenantIsolationGuardrail: readyTenantIsolationGuardrail({
        status: "blocked",
        signal: "1 tenant boundary gap(s)",
        guardedTenantRouteCount: 81,
        unguardedRoutePaths: ["/src/app/api/payroll/example/route.ts"],
        checks: [
          {
            id: "api_route_guard_coverage",
            title: "API route tenant session guard coverage",
            status: "blocked",
            detail: "81/82 tenant API route(s) call requireTenantSession.",
            nextStep: "Add requireTenantSession to: /src/app/api/payroll/example/route.ts.",
          },
          ...readyTenantIsolationGuardrail().checks.slice(1),
        ],
        topFailure: {
          id: "api_route_guard_coverage",
          title: "API route tenant session guard coverage",
          status: "blocked",
          detail: "81/82 tenant API route(s) call requireTenantSession.",
          nextStep: "Add requireTenantSession to: /src/app/api/payroll/example/route.ts.",
        },
      }),
      env: readyEnv,
      demoAuthRuntime: {
        allowed: false,
        reason: "Demo auth is disabled when HR_ONE_AUTH_SESSION_SOURCE=oidc.",
      },
    });

    expect(report.readyForProduction).toBe(false);
    expect(report.topTask.id).toBe("tenant_api_boundary");
    expect(report.tasks.find((task) => task.id === "tenant_api_boundary")).toMatchObject({
      status: "blocked",
      signal: "1 tenant boundary gap(s)",
      nextStep: "Add requireTenantSession to: /src/app/api/payroll/example/route.ts.",
    });
    expect(report.metrics.find((metric) => metric.label === "租戶 API 邊界")).toMatchObject({
      value: "阻擋",
      status: "blocked",
    });
  });

  it("marks the cutover ready only when all production access gates pass", () => {
    const report = buildAccessCutoverReport(readyWorkspace(), {
      supportAccessGovernance: readySupportAccessGovernance(),
      tenantIsolationGuardrail: readyTenantIsolationGuardrail(),
      env: readyEnv,
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
    expect(report.tasks.find((task) => task.id === "browser_session_cookie")).toMatchObject({
      status: "ready",
      signal: "加密 HttpOnly session ready",
    });
    expect(report.tasks.find((task) => task.id === "tenant_api_boundary")).toMatchObject({
      status: "ready",
      signal: "82/82 tenant APIs guarded",
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

function readyTenantIsolationGuardrail(
  overrides: Partial<TenantIsolationGuardrailReport> = {},
): TenantIsolationGuardrailReport {
  const checks: TenantIsolationGuardrailReport["checks"] = [
    {
      id: "api_route_guard_coverage",
      title: "API route tenant session guard coverage",
      status: "ready",
      detail: "82/82 tenant API route(s) call requireTenantSession.",
      nextStep: "Keep every non-public API route behind requireTenantSession.",
    },
    {
      id: "api_route_no_direct_db",
      title: "API routes use service-layer scoped data access",
      status: "ready",
      detail: "0 tenant API route(s) import the DB client directly or call getDb().",
      nextStep: "Keep API routes thin and route all persistence through tenant-scoped services.",
    },
    {
      id: "database_fallback_scope",
      title: "Database fallback helpers require tenant and company together",
      status: "ready",
      detail: "0 canUseDatabase helper(s) skip tenant/company context checks.",
      nextStep: "Keep DB fallback helpers fail-closed unless tenant and company context are both present.",
    },
  ];

  return {
    status: "ready",
    signal: "82/82 tenant APIs guarded",
    apiRouteCount: 86,
    publicRouteCount: 4,
    tenantScopedRouteCount: 82,
    guardedTenantRouteCount: 82,
    directDbRouteCount: 0,
    unsafeFallbackCount: 0,
    unguardedRoutePaths: [],
    directDbRoutePaths: [],
    unsafeFallbackPaths: [],
    checks,
    topFailure: null,
    ...overrides,
  };
}
