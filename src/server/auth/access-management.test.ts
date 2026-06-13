import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getUserAccessWorkspace,
  inviteUser,
  linkUserExternalIdentity,
  resetAccessDemoState,
  updateUserAccess,
} from "./access-management";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", email: "owner@hrone.test", displayName: "王執行長" },
  employee: null,
  authAssurance: {
    method: "sso" as const,
    mfaVerified: true,
    authenticatedAt: new Date(),
    lastSeenAt: new Date(),
  },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", email: "manager@hrone.test", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
  authAssurance: {
    method: "sso" as const,
    mfaVerified: true,
    authenticatedAt: new Date(),
    lastSeenAt: new Date(),
  },
};

describe("access management", () => {
  beforeEach(() => {
    resetAccessDemoState();
    resetAuditDemoState();
  });

  it("invites users, assigns roles, and writes audit logs", async () => {
    const invited = await inviteUser(ownerSession, {
      email: "New.User@hrone.test",
      displayName: "New User",
      roles: ["hr_admin", "employee"],
    });
    const workspace = await getUserAccessWorkspace(ownerSession);

    expect(invited).not.toBeNull();
    expect(invited).toMatchObject({
      email: "new.user@hrone.test",
      status: "invited",
      roles: ["hr_admin", "employee"],
    });
    expect(workspace.users.some((user) => user.id === invited!.id)).toBe(true);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "create",
      entityType: "user_access",
    });
  });

  it("updates user status and roles", async () => {
    const invited = await inviteUser(ownerSession, {
      email: "ops@hrone.test",
      displayName: "Ops User",
      roles: ["employee"],
    });
    const suspended = await updateUserAccess(ownerSession, {
      userId: invited!.id,
      status: "suspended",
    });
    const updatedRoles = await updateUserAccess(ownerSession, {
      userId: invited!.id,
      roles: ["manager"],
    });

    expect(suspended?.status).toBe("suspended");
    expect(updatedRoles?.roles).toEqual(["manager"]);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "user_access",
    });
  });

  it("links external SSO identities with an audit trail", async () => {
    const invited = await inviteUser(ownerSession, {
      email: "sso.user@hrone.test",
      displayName: "SSO User",
      roles: ["employee"],
    });
    expect(invited).not.toBeNull();

    await linkUserExternalIdentity(ownerSession, {
      userId: invited!.id,
      provider: "Entra ID",
      issuer: "https://login.example.com/customer/v2.0",
      subject: "00000000-0000-0000-0000-000000000001",
    });

    const workspace = await getUserAccessWorkspace(ownerSession);
    const user = workspace.users.find((item) => item.id === invited!.id);

    expect(user?.externalIdentities).toHaveLength(1);
    expect(user?.externalIdentities[0]).toMatchObject({
      provider: "Entra ID",
      issuer: "https://login.example.com/customer/v2.0",
      subject: "00000000-0000-0000-0000-000000000001",
      emailAtLink: "sso.user@hrone.test",
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "user_external_identity",
      metadataJson: {
        operation: "link_sso_identity",
        provider: "Entra ID",
        rawTokenStored: false,
      },
    });
    expect(JSON.stringify(getAuditDemoState().logs[0].metadataJson)).not.toContain("00000000-0000");
  });

  it("validates external identity inputs", async () => {
    await expect(linkUserExternalIdentity(ownerSession, {
      userId: "demo-user-employee",
      provider: "Entra ID",
      issuer: "http://login.example.com/customer/v2.0",
      subject: "subject-1",
    })).rejects.toThrow(/Issuer/);
  });

  it("blocks non-owner access writes and disallowed email domains", async () => {
    await expect(
      inviteUser(managerSession, {
        email: "ops@hrone.test",
        displayName: "Ops User",
        roles: ["employee"],
      }),
    ).rejects.toThrow(/settings:write/);
    await expect(
      inviteUser(ownerSession, {
        email: "outsider@example.com",
        displayName: "Outsider",
        roles: ["employee"],
      }),
    ).rejects.toThrow(/domain/);
  });
});
