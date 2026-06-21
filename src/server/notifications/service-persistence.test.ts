import { afterEach, describe, expect, it, vi } from "vitest";

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-owner", displayName: "Owner" },
  employee: null,
};

const storedSettings = {
  inAppEnabled: true,
  emailEnabled: true,
  lineEnabled: false,
  slackEnabled: false,
  teamsEnabled: false,
  externalSummaryOnly: true,
  approvalSubmittedEnabled: true,
  approvalDecisionEnabled: true,
  payrollReleasedEnabled: true,
  systemAlertEnabled: true,
};

describe("notification persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("reads notification settings and deliveries from the tenant database in database mode", async () => {
    const findUnique = vi.fn(async () => storedSettings);
    const findMany = vi.fn(async () => [
      {
        id: "delivery-1",
        notificationId: "notification-1",
        channel: "email",
        status: "queued",
        payloadHash: "payload-hash",
        destinationHash: "destination-hash",
        errorCode: "provider_not_configured",
        createdAt: new Date("2026-06-22T00:00:00.000Z"),
      },
    ]);
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyNotificationSetting: { findUnique },
        notificationDelivery: { findMany },
      }),
    }));

    const { getNotificationAdminWorkspace } = await import("./service");
    const workspace = await getNotificationAdminWorkspace(ownerSession);

    expect(workspace.settings.emailEnabled).toBe(true);
    expect(workspace.deliveries[0]).toMatchObject({
      id: "delivery-1",
      channel: "email",
      status: "queued",
      payloadHash: "payload-hash",
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { companyId: "company-1" } });
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", companyId: "company-1" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });

  it("fails closed instead of returning demo deliveries when database delivery reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyNotificationSetting: {
          findUnique: vi.fn(async () => storedSettings),
        },
        notificationDelivery: {
          findMany: vi.fn(async () => {
            throw new Error("database notification delivery read failed");
          }),
        },
      }),
    }));

    const { getNotificationAdminWorkspace } = await import("./service");

    await expect(getNotificationAdminWorkspace(ownerSession)).rejects.toThrow(
      "database notification delivery read failed",
    );
  });

  it("writes notification settings and audit logs to the tenant database in database mode", async () => {
    const findUnique = vi.fn(async () => storedSettings);
    const upsert = vi.fn(async () => ({
      id: "notification-settings-1",
      ...storedSettings,
      slackEnabled: true,
    }));
    const createAudit = vi.fn(async () => ({ id: "audit-1" }));
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyNotificationSetting: { findUnique },
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            companyNotificationSetting: { upsert },
            auditLog: { create: createAudit },
          }),
      }),
    }));

    const { updateNotificationSettings } = await import("./service");
    const updated = await updateNotificationSettings(ownerSession, { slackEnabled: true });

    expect(updated.slackEnabled).toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      create: expect.objectContaining({
        tenantId: "tenant-1",
        companyId: "company-1",
        slackEnabled: true,
        updatedByUserId: "user-owner",
      }),
      update: expect.objectContaining({
        slackEnabled: true,
        updatedByUserId: "user-owner",
      }),
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        companyId: "company-1",
        actorUserId: "user-owner",
        entityType: "notification_settings",
        entityId: "notification-settings-1",
      }),
    });
  });

  it("fails closed instead of saving demo notification settings when database writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyNotificationSetting: {
          findUnique: vi.fn(async () => storedSettings),
        },
        $transaction: vi.fn(async () => {
          throw new Error("database notification settings write failed");
        }),
      }),
    }));

    const {
      getNotificationSettings,
      resetNotificationDemoState,
      updateNotificationSettings,
    } = await import("./service");
    resetNotificationDemoState();

    await expect(updateNotificationSettings(ownerSession, { teamsEnabled: true })).rejects.toThrow(
      "database notification settings write failed",
    );
    delete process.env.DATABASE_URL;
    const demoSettings = await getNotificationSettings(ownerSession);
    expect(demoSettings.teamsEnabled).toBe(false);
  });

  it("fails closed instead of creating demo notifications when database notification writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyNotificationSetting: {
          findUnique: vi.fn(async () => storedSettings),
        },
        $transaction: vi.fn(async () => {
          throw new Error("database notification write failed");
        }),
      }),
    }));

    const {
      getNotificationAdminWorkspace,
      resetNotificationDemoState,
      sendNotification,
    } = await import("./service");
    resetNotificationDemoState();

    await expect(
      sendNotification({
        tenantId: "tenant-1",
        companyId: "company-1",
        recipientUserId: "user-manager",
        title: "New leave request",
        body: "Sensitive reason should not land in demo state",
        linkUrl: "/manager/inbox",
        eventType: "approval_submitted",
      }),
    ).rejects.toThrow("database notification write failed");

    delete process.env.DATABASE_URL;
    const workspace = await getNotificationAdminWorkspace(ownerSession);
    expect(workspace.deliveries).toHaveLength(0);
  });

  it("requires tenant and company context for settings in database mode", async () => {
    const findUnique = vi.fn();
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyNotificationSetting: { findUnique },
      }),
    }));

    const { getNotificationSettings, updateNotificationSettings } = await import("./service");
    const sessionWithoutTenant = { ...ownerSession, tenantId: null };

    await expect(getNotificationSettings(sessionWithoutTenant)).rejects.toThrow(
      "tenant and company context",
    );
    await expect(updateNotificationSettings(sessionWithoutTenant, { emailEnabled: true })).rejects.toThrow(
      "tenant and company context",
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
