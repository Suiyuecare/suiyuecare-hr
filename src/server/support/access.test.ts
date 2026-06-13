import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  approveSupportAccessGrant,
  canUseSupportAccess,
  listSupportAccessGrants,
  resetSupportAccessDemoState,
  revokeSupportAccessGrant,
  summarizeSupportAccessGovernance,
} from "./access";

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "owner-1", displayName: "Owner" },
};

const hrSession = {
  ...ownerSession,
  role: "hr_admin" as const,
  user: { id: "hr-1", displayName: "HR" },
};

const now = new Date("2026-06-13T01:00:00.000Z");

describe("support access governance", () => {
  beforeEach(() => {
    resetAuditDemoState();
    resetSupportAccessDemoState();
  });

  it("requires owner approval, bounded expiry, and audited redacted metadata", async () => {
    const grant = await approveSupportAccessGrant(ownerSession, {
      supportPrincipalEmail: "Support.Engineer@hrone.example",
      supportPrincipalName: "Support Engineer",
      ticketId: "INC-2026-0001",
      reason: "Investigate customer approved payroll export incident",
      scopes: ["incident_response", "technical_support"],
      dataAccessLevel: "metadata_only",
      expiresAt: new Date("2026-06-14T01:00:00.000Z"),
    }, now);

    expect(grant.supportPrincipalEmail).toBe("support.engineer@hrone.example");
    expect(canUseSupportAccess(grant, "incident_response", now)).toBe(true);
    expect(await listSupportAccessGrants(ownerSession)).toHaveLength(1);

    const auditText = JSON.stringify(getAuditDemoState().logs);
    expect(auditText).toContain("support_access_grant");
    expect(auditText).not.toContain("support.engineer@hrone.example");
    expect(auditText).not.toContain("Support.Engineer@hrone.example");
  });

  it("blocks non-owner grants and grants longer than 72 hours", async () => {
    await expect(approveSupportAccessGrant(hrSession, {
      supportPrincipalEmail: "support@hrone.example",
      ticketId: "INC-1",
      reason: "Customer approved investigation",
      scopes: ["technical_support"],
      expiresAt: new Date("2026-06-13T02:00:00.000Z"),
    }, now)).rejects.toThrow(/Only owner/);

    await expect(approveSupportAccessGrant(ownerSession, {
      supportPrincipalEmail: "support@hrone.example",
      ticketId: "INC-2",
      reason: "Customer approved investigation",
      scopes: ["technical_support"],
      expiresAt: new Date("2026-06-17T01:00:00.000Z"),
    }, now)).rejects.toThrow(/72 hours/);
  });

  it("revokes active grants and prevents later use", async () => {
    const grant = await approveSupportAccessGrant(ownerSession, {
      supportPrincipalEmail: "support@hrone.example",
      ticketId: "INC-3",
      reason: "Customer approved data migration check",
      scopes: ["data_migration"],
      expiresAt: new Date("2026-06-13T05:00:00.000Z"),
    }, now);

    const revoked = await revokeSupportAccessGrant(
      ownerSession,
      grant.id,
      "Customer ended support session",
      new Date("2026-06-13T02:00:00.000Z"),
    );

    expect(revoked.status).toBe("revoked");
    expect(canUseSupportAccess(revoked, "data_migration", new Date("2026-06-13T02:01:00.000Z"))).toBe(false);
    expect(getAuditDemoState().logs.map((log) => log.action)).toEqual(["update", "approve"]);
  });

  it("summarizes production governance blockers", () => {
    expect(summarizeSupportAccessGovernance({
      activeApprovedCount: 2,
      activeUnapprovedCount: 0,
      expiredStillApprovedCount: 0,
    })).toMatchObject({ passed: true });

    expect(summarizeSupportAccessGovernance({
      activeApprovedCount: 1,
      activeUnapprovedCount: 1,
      expiredStillApprovedCount: 1,
    })).toMatchObject({
      passed: false,
      detail: "1 unapproved active grant(s), 1 expired grant(s) still approved.",
    });
  });
});
