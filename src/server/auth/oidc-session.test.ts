import { describe, expect, it } from "vitest";
import { resolveOidcTenantSession, type OidcSessionDb } from "./oidc-session";
import type { OidcVerifiedClaims } from "./oidc";

const claims: OidcVerifiedClaims = {
  subject: "external-user-1",
  issuer: "https://login.customer.example/tenant/v2.0",
  audience: ["hr-one-api"],
  email: "employee@customer.example",
  emailVerified: true,
  name: "Token Claimed Name",
  tenantExternalId: "customer-a",
  companyExternalId: "company-1",
  employeeId: "token-employee-id",
  employeeName: "Token Employee",
  roleKeys: ["owner"],
  authAssurance: {
    method: "sso",
    mfaVerified: true,
    authenticatedAt: new Date("2026-06-12T07:58:00.000Z"),
    lastSeenAt: new Date("2026-06-12T08:00:00.000Z"),
  },
};

describe("OIDC DB-backed tenant session resolution", () => {
  it("prefers stable issuer-subject identity bindings over email lookup", async () => {
    let emailLookupUsed = false;
    let lastSeenUpdated = false;
    const session = await resolveOidcTenantSession({
      claims: {
        ...claims,
        email: "renamed@customer.example",
      },
      db: dbFixture({
        useExternalIdentity: true,
        onEmailLookup: () => {
          emailLookupUsed = true;
        },
        onIdentityUpdate: () => {
          lastSeenUpdated = true;
        },
      }),
    });

    expect(session.user?.email).toBe("employee@customer.example");
    expect(emailLookupUsed).toBe(false);
    expect(lastSeenUpdated).toBe(true);
  });

  it("uses HR One DB roles and user identity instead of token role claims", async () => {
    const session = await resolveOidcTenantSession({
      claims,
      db: dbFixture({
        roles: ["employee"],
      }),
    });

    expect(session).toMatchObject({
      role: "employee",
      tenantId: "tenant-1",
      companyId: "company-1",
      user: {
        id: "user-1",
        email: "employee@customer.example",
        displayName: "DB Employee",
        status: "active",
      },
      employee: {
        id: "employee-1",
        displayName: "DB Employee",
      },
      authAssurance: claims.authAssurance,
    });
  });

  it("chooses the highest DB role for the company", async () => {
    const session = await resolveOidcTenantSession({
      claims,
      db: dbFixture({
        roles: ["employee", "manager", "hr_admin"],
      }),
    });

    expect(session.role).toBe("hr_admin");
  });

  it("blocks suspended, unprovisioned, or unassigned users", async () => {
    await expect(resolveOidcTenantSession({
      claims,
      db: dbFixture({ userStatus: "suspended" }),
    })).rejects.toThrow(/not active/);

    await expect(resolveOidcTenantSession({
      claims: { ...claims, email: "missing@customer.example" },
      db: dbFixture({ userMissing: true }),
    })).rejects.toThrow(/not provisioned/);

    await expect(resolveOidcTenantSession({
      claims,
      db: dbFixture({ roles: [] }),
    })).rejects.toThrow(/no HR One role/);
  });

  it("blocks inactive tenants and company mismatches", async () => {
    await expect(resolveOidcTenantSession({
      claims,
      db: dbFixture({ tenantMissing: true }),
    })).rejects.toThrow(/tenant/);

    await expect(resolveOidcTenantSession({
      claims,
      db: dbFixture({ companyMissing: true }),
    })).rejects.toThrow(/company/);
  });
});

function dbFixture(options: {
  roles?: Array<"owner" | "hr_admin" | "manager" | "employee">;
  userStatus?: string;
  userMissing?: boolean;
  tenantMissing?: boolean;
  companyMissing?: boolean;
  useExternalIdentity?: boolean;
  onEmailLookup?: () => void;
  onIdentityUpdate?: () => void;
} = {}): OidcSessionDb {
  const roles = options.roles ?? ["employee"];
  const user = {
    id: "user-1",
    email: "employee@customer.example",
    displayName: "DB Employee",
    status: options.userStatus ?? "active",
    employee: {
      id: "employee-1",
      companyId: "company-1",
      displayName: "DB Employee",
    },
    userRoles: roles.map((role) => ({
      role: { key: role },
    })),
  };
  return {
    tenant: {
      findFirst: async () => options.tenantMissing ? null : { id: "tenant-1", slug: "customer-a" },
    },
    company: {
      findFirst: async () => options.companyMissing ? null : { id: "company-1" },
    },
    user: {
      findUnique: async () => {
        options.onEmailLookup?.();
        return options.userMissing ? null : user;
      },
    },
    userExternalIdentity: {
      findUnique: async () => options.useExternalIdentity ? { user } : null,
      update: async () => {
        options.onIdentityUpdate?.();
        return {};
      },
    },
  };
}
