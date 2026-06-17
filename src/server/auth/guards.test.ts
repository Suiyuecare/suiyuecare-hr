import { describe, expect, it } from "vitest";
import {
  assertTenantSessionAccess,
  tenantSessionFromAuthorizationHeader,
  tenantSessionFromOidcSessionCookie,
} from "./guards";
import {
  buildOidcSessionCookiePayload,
  sealOidcSessionCookie,
} from "./oidc-session-cookie";

const baseSession = {
  role: "employee" as const,
  tenantId: "tenant_1",
  companyId: "company_1",
  user: { id: "user_1", email: "employee@hrone.test", displayName: "User" },
  employee: { id: "employee_1", displayName: "Employee" },
  authAssurance: {
    method: "local_password" as const,
    mfaVerified: false,
    authenticatedAt: new Date(),
    lastSeenAt: new Date(),
  },
};

describe("tenant session guard", () => {
  it("allows sessions with tenant, company, permission, and employee context", async () => {
    await expect(
      assertTenantSessionAccess(baseSession, {
        permission: "leave:write",
        employeeRequired: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("blocks missing tenant context", async () => {
    await expect(
      assertTenantSessionAccess(
        {
          ...baseSession,
          tenantId: null,
        },
        { permission: "leave:write" },
      ),
    ).rejects.toThrow(/Tenant and company/);
  });

  it("blocks missing employee context when required", async () => {
    await expect(
      assertTenantSessionAccess(
        {
          ...baseSession,
          employee: null,
        },
        { permission: "leave:write", employeeRequired: true },
      ),
    ).rejects.toThrow(/Employee context/);
  });

  it("blocks missing permissions", async () => {
    await expect(
      assertTenantSessionAccess(baseSession, {
        permission: "payroll:manage",
      }),
    ).rejects.toThrow(/payroll:manage/);
  });

  it("blocks inactive user accounts", async () => {
    await expect(
      assertTenantSessionAccess(
        {
          ...baseSession,
          user: { ...baseSession.user, status: "suspended" },
        },
        { permission: "leave:write" },
      ),
    ).rejects.toThrow(/not active/);
  });

  it("builds tenant sessions from verified OIDC bearer claims", async () => {
    const session = await tenantSessionFromAuthorizationHeader({
      authorization: "Bearer verified-token",
      verifyToken: async (token) => {
        expect(token).toBe("verified-token");
        return {
          subject: "external-user-1",
          issuer: "https://login.customer.example/tenant/v2.0",
          audience: ["hr-one-api"],
          email: "employee@hrone.test",
          emailVerified: true,
          name: "Employee User",
          tenantExternalId: "tenant_1",
          companyExternalId: "company_1",
          employeeId: "employee_1",
          employeeName: "Employee User",
          roleKeys: ["employee"],
          authAssurance: {
            method: "sso",
            mfaVerified: false,
            authenticatedAt: new Date(),
            lastSeenAt: new Date(),
          },
        };
      },
      resolveClaims: async (claims) => ({
        role: "employee",
        tenantId: claims.tenantExternalId,
        companyId: claims.companyExternalId,
        user: {
          id: "user_1",
          email: claims.email,
          displayName: claims.name ?? "Employee",
        },
        employee: {
          id: claims.employeeId ?? "employee_1",
          displayName: claims.employeeName ?? "Employee",
        },
        authAssurance: claims.authAssurance,
      }),
    });

    await expect(assertTenantSessionAccess(session, {
      permission: "leave:write",
      employeeRequired: true,
    })).resolves.toBeUndefined();
  });

  it("blocks missing bearer tokens before tenant access checks", async () => {
    await expect(tenantSessionFromAuthorizationHeader({
      authorization: null,
      verifyToken: async () => {
        throw new Error("should not verify");
      },
    })).rejects.toThrow(/Bearer token/);
  });

  it("builds tenant sessions from encrypted OIDC session cookies", async () => {
    const now = new Date();
    const authenticatedAt = new Date(now.getTime() - 10 * 60 * 1_000);
    const cookie = await sealOidcSessionCookie(
      buildOidcSessionCookiePayload({
        claims: {
          subject: "external-user-1",
          issuer: "https://login.customer.example/tenant/v2.0",
          audience: ["hr-one-api"],
          email: "employee@hrone.test",
          emailVerified: true,
          name: "Employee User",
          tenantExternalId: "tenant_1",
          companyExternalId: "company_1",
          employeeId: "employee_1",
          employeeName: "Employee User",
          roleKeys: ["employee"],
          authAssurance: {
            method: "sso",
            mfaVerified: true,
            authenticatedAt,
            lastSeenAt: authenticatedAt,
          },
        },
        env: {
          HR_ONE_WEB_SESSION_MAX_AGE_SECONDS: "3600",
        },
        now,
      }),
      {
        HR_ONE_ENCRYPTION_KEY: "encryption-key-with-at-least-32-characters",
      },
    );
    const session = await tenantSessionFromOidcSessionCookie({
      cookie,
      env: {
        HR_ONE_ENCRYPTION_KEY: "encryption-key-with-at-least-32-characters",
      },
      resolveClaims: async (claims) => ({
        role: "employee",
        tenantId: claims.tenantExternalId,
        companyId: claims.companyExternalId,
        user: {
          id: "user_1",
          email: "employee@hrone.test",
          displayName: "Employee",
        },
        employee: {
          id: "employee_1",
          displayName: "Employee",
        },
        authAssurance: claims.authAssurance,
      }),
    });

    await expect(assertTenantSessionAccess(session, {
      permission: "leave:write",
      employeeRequired: true,
    })).resolves.toBeUndefined();
  });
});
