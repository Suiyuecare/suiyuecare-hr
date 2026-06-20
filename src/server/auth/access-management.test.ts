import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getUserAccessWorkspace,
  inviteUser,
  linkUserEmployee,
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
      statusReason: "離職交接完成，停用登入",
    });
    const statusAudit = getAuditDemoState().logs[0];
    const updatedRoles = await updateUserAccess(ownerSession, {
      userId: invited!.id,
      roles: ["manager"],
    });

    expect(suspended?.status).toBe("suspended");
    expect(updatedRoles?.roles).toEqual(["manager"]);
    expect(statusAudit).toMatchObject({
      action: "update",
      entityType: "user_access",
      metadataJson: {
        operation: "status",
        statusReasonProvided: true,
        rawStatusReasonStored: false,
        activeOwnerGuardChecked: true,
      },
    });
    expect(statusAudit.metadataJson.statusReasonHash).toMatch(/[a-f0-9]{64}/);
    expect(JSON.stringify(statusAudit.metadataJson)).not.toContain("離職交接");
    expect(getAuditDemoState().logs[0]).toMatchObject({
      metadataJson: {
        operation: "roles",
        targetRoles: ["manager"],
        activeOwnerGuardChecked: true,
      },
    });
  });

  it("requires a hashed reason for status changes", async () => {
    await expect(
      updateUserAccess(ownerSession, {
        userId: "demo-user-manager",
        status: "suspended",
      }),
    ).rejects.toThrow(/Status change reason/);
  });

  it("keeps at least one active Owner account", async () => {
    await expect(
      updateUserAccess(ownerSession, {
        userId: "demo-user-owner",
        status: "suspended",
        statusReason: "測試停用最後 Owner",
      }),
    ).rejects.toThrow(/active Owner/);

    await expect(
      updateUserAccess(ownerSession, {
        userId: "demo-user-owner",
        roles: ["employee"],
      }),
    ).rejects.toThrow(/active Owner/);
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
      emailAtLink: "sso.user@hrone.test",
    });
    expect(user?.externalIdentities[0]?.subjectHash).toMatch(/[a-f0-9]{16}/);
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

  it("links users to employee master records with redacted audit evidence", async () => {
    const invited = await inviteUser(ownerSession, {
      email: "linked.employee@hrone.test",
      displayName: "Linked Employee",
      roles: ["employee"],
    });
    expect(invited).not.toBeNull();

    await linkUserEmployee(ownerSession, {
      userId: invited!.id,
      employeeId: "demo-employee-2",
    });

    const workspace = await getUserAccessWorkspace(ownerSession);
    const user = workspace.users.find((item) => item.id === invited!.id);
    const linkedEmployee = workspace.employees.find((employee) => employee.id === "demo-employee-2");

    expect(user?.employee).toMatchObject({
      id: "demo-employee-2",
      employeeNo: "E004",
      displayName: "李小真",
    });
    expect(linkedEmployee?.userId).toBe(invited!.id);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "user_employee_link",
      metadataJson: {
        operation: "link_employee",
        rawEmployeePersonalDataStored: false,
      },
    });
    expect(JSON.stringify(getAuditDemoState().logs[0].metadataJson)).not.toContain("李小真");
    expect(JSON.stringify(getAuditDemoState().logs[0].metadataJson)).not.toContain("E004");
  });

  it("prevents two users from sharing the same employee link", async () => {
    const invited = await inviteUser(ownerSession, {
      email: "duplicate.employee@hrone.test",
      displayName: "Duplicate Employee",
      roles: ["employee"],
    });

    await expect(
      linkUserEmployee(ownerSession, {
        userId: invited!.id,
        employeeId: "demo-employee-1",
      }),
    ).rejects.toThrow(/already linked/);
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
