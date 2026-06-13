import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getNotificationAdminWorkspace,
  resetNotificationDemoState,
  sendNotification,
  updateNotificationSettings,
} from "./service";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王執行長" },
  employee: null,
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("notification settings and delivery metadata", () => {
  beforeEach(() => {
    resetNotificationDemoState();
    resetAuditDemoState();
  });

  it("updates notification settings with audit metadata", async () => {
    const settings = await updateNotificationSettings(ownerSession, {
      inAppEnabled: true,
      emailEnabled: true,
      lineEnabled: true,
      externalSummaryOnly: true,
    });

    expect(settings).toMatchObject({
      emailEnabled: true,
      lineEnabled: true,
      externalSummaryOnly: true,
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "notification_settings",
    });
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      externalMessageStored: false,
    });
  });

  it("creates delivery records without raw external payloads", async () => {
    await updateNotificationSettings(ownerSession, {
      inAppEnabled: true,
      emailEnabled: true,
      slackEnabled: true,
      externalSummaryOnly: true,
    });
    await sendNotification({
      tenantId: "demo-tenant",
      companyId: "demo-company",
      recipientUserId: "demo-user-manager",
      title: "New leave request",
      body: "Employee reason with sensitive context",
      linkUrl: "/manager/inbox",
      eventType: "approval_submitted",
    });

    const workspace = await getNotificationAdminWorkspace(ownerSession);
    expect(workspace.deliveries).toHaveLength(5);
    expect(workspace.deliveries.some((delivery) => delivery.channel === "email" && delivery.status === "queued")).toBe(true);
    expect(JSON.stringify(workspace.deliveries)).not.toContain("sensitive context");
  });

  it("respects event toggles and blocks managers from updates", async () => {
    await updateNotificationSettings(ownerSession, {
      approvalSubmittedEnabled: false,
    });
    const skipped = await sendNotification({
      tenantId: "demo-tenant",
      companyId: "demo-company",
      recipientUserId: "demo-user-manager",
      title: "New leave request",
      body: "Submitted",
      linkUrl: "/manager/inbox",
      eventType: "approval_submitted",
    });

    expect(skipped).toBeNull();
    await expect(updateNotificationSettings(managerSession, { emailEnabled: true })).rejects.toThrow(/settings:write/);
  });
});
