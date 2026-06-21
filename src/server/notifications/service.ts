import type { Prisma } from "@prisma/client";
import { stableHash } from "@/server/audit/redaction";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type NotificationEventType =
  | "general"
  | "approval_submitted"
  | "approval_decision"
  | "payroll_released"
  | "system_alert";

export type NotificationChannel = "in_app" | "email" | "line" | "slack" | "teams";

export type NotificationChannelSettings = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  lineEnabled: boolean;
  slackEnabled: boolean;
  teamsEnabled: boolean;
  externalSummaryOnly: boolean;
  approvalSubmittedEnabled: boolean;
  approvalDecisionEnabled: boolean;
  payrollReleasedEnabled: boolean;
  systemAlertEnabled: boolean;
};

export type NotificationChannelSettingsInput = Partial<NotificationChannelSettings>;

export type NotificationDeliveryRow = {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: "queued" | "sent" | "skipped" | "failed";
  payloadHash: string;
  destinationHash: string | null;
  errorCode: string | null;
  createdAt: Date;
};

export type NotificationAdminWorkspace = {
  settings: NotificationChannelSettings;
  deliveries: NotificationDeliveryRow[];
};

type SendNotificationInput = {
  tenantId: string;
  companyId: string;
  recipientUserId: string;
  title: string;
  body: string;
  linkUrl: string;
  eventType?: NotificationEventType;
};

type NotificationDemoRecord = {
  id: string;
  tenantId: string;
  companyId: string;
  recipientUserId: string;
  title: string;
  body: string;
  linkUrl: string;
  status: "unread" | "read";
  eventType: NotificationEventType;
  createdAt: Date;
};

type NotificationDemoState = {
  settings: NotificationChannelSettings;
  notifications: NotificationDemoRecord[];
  deliveries: NotificationDeliveryRow[];
};

export const defaultNotificationSettings: NotificationChannelSettings = {
  inAppEnabled: true,
  emailEnabled: false,
  lineEnabled: false,
  slackEnabled: false,
  teamsEnabled: false,
  externalSummaryOnly: true,
  approvalSubmittedEnabled: true,
  approvalDecisionEnabled: true,
  payrollReleasedEnabled: true,
  systemAlertEnabled: true,
};

const globalForNotifications = globalThis as unknown as {
  hrOneNotificationDemoState?: NotificationDemoState;
};

export async function getNotificationAdminWorkspace(session: SessionLike): Promise<NotificationAdminWorkspace> {
  assertPermission(session.role, "settings:read");
  const settings = await getNotificationSettings(session);
  const deliveries = process.env.DATABASE_URL
    ? await listDbDeliveries(assertDatabaseNotificationContext(session))
    : getDemoState().deliveries;
  return {
    settings,
    deliveries: deliveries.slice(0, 20),
  };
}

export async function getNotificationSettings(session: SessionLike) {
  if (!process.env.DATABASE_URL) {
    return getDemoState().settings;
  }
  const dbSession = assertDatabaseNotificationContext(session);
  const record = await getDb().companyNotificationSetting.findUnique({
    where: { companyId: dbSession.companyId },
  });
  return record ? readSettings(record) : defaultNotificationSettings;
}

export async function updateNotificationSettings(
  session: SessionLike,
  input: NotificationChannelSettingsInput,
) {
  assertPermission(session.role, "settings:write");
  const before = await getNotificationSettings(session);
  const normalized = normalizeSettings(input, before);
  if (!process.env.DATABASE_URL) {
    return updateDemoSettings(session, before, normalized);
  }
  return updateDbSettings(assertDatabaseNotificationContext(session), before, normalized);
}

export async function sendNotification(input: SendNotificationInput) {
  const settings = await getNotificationSettings({
    role: "owner",
    tenantId: input.tenantId,
    companyId: input.companyId,
  });
  if (!eventEnabled(settings, input.eventType ?? "general")) return null;

  if (process.env.DATABASE_URL) {
    return createDbNotification(input, settings);
  }
  return createDemoNotification(input, settings);
}

export async function sendNotificationInTransaction(
  tx: Prisma.TransactionClient,
  input: SendNotificationInput,
) {
  const settings = await getNotificationSettings({
    role: "owner",
    tenantId: input.tenantId,
    companyId: input.companyId,
  });
  if (!eventEnabled(settings, input.eventType ?? "general")) return null;

  const notification = await tx.notification.create({
    data: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      recipientUserId: input.recipientUserId,
      title: input.title,
      body: settings.inAppEnabled ? input.body : "In-app notification disabled by company policy.",
      linkUrl: input.linkUrl,
      eventType: input.eventType ?? "general",
    },
  });
  await tx.notificationDelivery.createMany({
    data: buildDeliveries(notification.id, input, settings),
  });
  return notification;
}

export function resetNotificationDemoState() {
  globalForNotifications.hrOneNotificationDemoState = {
    settings: { ...defaultNotificationSettings },
    notifications: [],
    deliveries: [],
  };
}

function getDemoState() {
  if (!globalForNotifications.hrOneNotificationDemoState) {
    resetNotificationDemoState();
  }
  return globalForNotifications.hrOneNotificationDemoState!;
}

async function listDbDeliveries(session: SessionLike & { tenantId: string; companyId: string }) {
  const deliveries = await getDb().notificationDelivery.findMany({
    where: { tenantId: session.tenantId, companyId: session.companyId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return deliveries.map(mapDelivery);
}

async function updateDbSettings(
  session: SessionLike & { tenantId: string; companyId: string },
  before: NotificationChannelSettings,
  normalized: NotificationChannelSettings,
) {
  const updated = await getDb().$transaction(async (tx) => {
    const record = await tx.companyNotificationSetting.upsert({
      where: { companyId: session.companyId },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        ...normalized,
        updatedByUserId: session.user?.id,
      },
      update: {
        ...normalized,
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "notification_settings",
      entityId: record.id,
      before,
      after: normalized,
      metadata: auditMetadata(before, normalized),
    });
    return record;
  });
  return readSettings(updated);
}

function updateDemoSettings(
  session: SessionLike,
  before: NotificationChannelSettings,
  normalized: NotificationChannelSettings,
) {
  getDemoState().settings = normalized;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "notification_settings",
    entityId: "demo-notification-settings",
    before,
    after: normalized,
    metadata: auditMetadata(before, normalized),
  });
  return normalized;
}

async function createDbNotification(input: SendNotificationInput, settings: NotificationChannelSettings) {
  return getDb().$transaction(async (tx) => {
    const notification = settings.inAppEnabled
      ? await tx.notification.create({
          data: {
            tenantId: input.tenantId,
            companyId: input.companyId,
            recipientUserId: input.recipientUserId,
            title: input.title,
            body: input.body,
            linkUrl: input.linkUrl,
            eventType: input.eventType ?? "general",
          },
        })
      : await tx.notification.create({
          data: {
            tenantId: input.tenantId,
            companyId: input.companyId,
            recipientUserId: input.recipientUserId,
            title: input.title,
            body: "In-app notification disabled by company policy.",
            linkUrl: input.linkUrl,
            eventType: input.eventType ?? "general",
          },
        });
    await tx.notificationDelivery.createMany({
      data: buildDeliveries(notification.id, input, settings),
    });
    return notification;
  });
}

function createDemoNotification(input: SendNotificationInput, settings: NotificationChannelSettings) {
  const state = getDemoState();
  const notification: NotificationDemoRecord = {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId,
    recipientUserId: input.recipientUserId,
    title: input.title,
    body: settings.inAppEnabled ? input.body : "In-app notification disabled by company policy.",
    linkUrl: input.linkUrl,
    status: "unread",
    eventType: input.eventType ?? "general",
    createdAt: new Date(),
  };
  state.notifications.unshift(notification);
  state.deliveries.unshift(...buildDeliveries(notification.id, input, settings).map((delivery) => ({
    id: crypto.randomUUID(),
    notificationId: delivery.notificationId,
    channel: delivery.channel as NotificationChannel,
    status: delivery.status as NotificationDeliveryRow["status"],
    payloadHash: delivery.payloadHash,
    destinationHash: delivery.destinationHash ?? null,
    errorCode: delivery.errorCode ?? null,
    createdAt: new Date(),
  })));
  return notification;
}

function buildDeliveries(
  notificationId: string,
  input: SendNotificationInput,
  settings: NotificationChannelSettings,
) {
  const channels: Array<{ channel: NotificationChannel; enabled: boolean }> = [
    { channel: "in_app", enabled: settings.inAppEnabled },
    { channel: "email", enabled: settings.emailEnabled },
    { channel: "line", enabled: settings.lineEnabled },
    { channel: "slack", enabled: settings.slackEnabled },
    { channel: "teams", enabled: settings.teamsEnabled },
  ];
  return channels.map(({ channel, enabled }) => {
    const payload = channel === "in_app" || !settings.externalSummaryOnly
      ? { title: input.title, body: input.body, linkUrl: input.linkUrl }
      : { title: input.title, body: "Open HR One to review this item.", linkUrl: input.linkUrl };
    return {
      tenantId: input.tenantId,
      companyId: input.companyId,
      notificationId,
      channel,
      status: enabled ? "queued" : "skipped",
      destinationHash: stableHash({ recipientUserId: input.recipientUserId, channel }),
      payloadHash: stableHash(payload),
      errorCode: enabled && channel !== "in_app" ? "provider_not_configured" : null,
      attemptedAt: enabled ? new Date() : null,
      deliveredAt: enabled && channel === "in_app" ? new Date() : null,
    };
  });
}

function auditMetadata(before: NotificationChannelSettings, after: NotificationChannelSettings) {
  return {
    changedFields: changedFields(before, after),
    externalSummaryOnly: after.externalSummaryOnly,
    externalMessageStored: false,
  };
}

function normalizeSettings(
  input: NotificationChannelSettingsInput,
  before: NotificationChannelSettings,
): NotificationChannelSettings {
  return {
    inAppEnabled: input.inAppEnabled ?? before.inAppEnabled,
    emailEnabled: input.emailEnabled ?? before.emailEnabled,
    lineEnabled: input.lineEnabled ?? before.lineEnabled,
    slackEnabled: input.slackEnabled ?? before.slackEnabled,
    teamsEnabled: input.teamsEnabled ?? before.teamsEnabled,
    externalSummaryOnly: input.externalSummaryOnly ?? before.externalSummaryOnly,
    approvalSubmittedEnabled: input.approvalSubmittedEnabled ?? before.approvalSubmittedEnabled,
    approvalDecisionEnabled: input.approvalDecisionEnabled ?? before.approvalDecisionEnabled,
    payrollReleasedEnabled: input.payrollReleasedEnabled ?? before.payrollReleasedEnabled,
    systemAlertEnabled: input.systemAlertEnabled ?? before.systemAlertEnabled,
  };
}

function readSettings(record: NotificationChannelSettings): NotificationChannelSettings {
  return {
    inAppEnabled: record.inAppEnabled,
    emailEnabled: record.emailEnabled,
    lineEnabled: record.lineEnabled,
    slackEnabled: record.slackEnabled,
    teamsEnabled: record.teamsEnabled,
    externalSummaryOnly: record.externalSummaryOnly,
    approvalSubmittedEnabled: record.approvalSubmittedEnabled,
    approvalDecisionEnabled: record.approvalDecisionEnabled,
    payrollReleasedEnabled: record.payrollReleasedEnabled,
    systemAlertEnabled: record.systemAlertEnabled,
  };
}

function mapDelivery(record: {
  id: string;
  notificationId: string;
  channel: string;
  status: string;
  payloadHash: string;
  destinationHash: string | null;
  errorCode: string | null;
  createdAt: Date;
}): NotificationDeliveryRow {
  return {
    id: record.id,
    notificationId: record.notificationId,
    channel: normalizeChannel(record.channel),
    status: normalizeDeliveryStatus(record.status),
    payloadHash: record.payloadHash,
    destinationHash: record.destinationHash,
    errorCode: record.errorCode,
    createdAt: record.createdAt,
  };
}

function eventEnabled(settings: NotificationChannelSettings, eventType: NotificationEventType) {
  if (eventType === "approval_submitted") return settings.approvalSubmittedEnabled;
  if (eventType === "approval_decision") return settings.approvalDecisionEnabled;
  if (eventType === "payroll_released") return settings.payrollReleasedEnabled;
  if (eventType === "system_alert") return settings.systemAlertEnabled;
  return true;
}

function normalizeChannel(value: string): NotificationChannel {
  if (value === "email" || value === "line" || value === "slack" || value === "teams") return value;
  return "in_app";
}

function normalizeDeliveryStatus(value: string): NotificationDeliveryRow["status"] {
  if (value === "sent" || value === "skipped" || value === "failed") return value;
  return "queued";
}

function changedFields(before: NotificationChannelSettings, after: NotificationChannelSettings) {
  return (Object.keys(after) as Array<keyof NotificationChannelSettings>).filter((key) => before[key] !== after[key]);
}

function assertDatabaseNotificationContext<T extends SessionLike>(
  session: SessionLike,
): T & { tenantId: string; companyId: string } {
  if (!session.tenantId || !session.companyId) {
    throw new Error("Notification settings require tenant and company context in database mode.");
  }
  return session as T & { tenantId: string; companyId: string };
}
