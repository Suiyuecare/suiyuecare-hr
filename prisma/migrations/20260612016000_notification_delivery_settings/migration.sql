-- Notification channel settings and external delivery audit metadata.
CREATE TABLE "CompanyNotificationSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lineEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "teamsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "externalSummaryOnly" BOOLEAN NOT NULL DEFAULT true,
    "approvalSubmittedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "approvalDecisionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payrollReleasedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "systemAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyNotificationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyNotificationSetting_companyId_key"
    ON "CompanyNotificationSetting"("companyId");

CREATE INDEX "CompanyNotificationSetting_tenantId_companyId_idx"
    ON "CompanyNotificationSetting"("tenantId", "companyId");

ALTER TABLE "CompanyNotificationSetting"
    ADD CONSTRAINT "CompanyNotificationSetting_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
    ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'general';

CREATE INDEX "Notification_tenantId_companyId_eventType_idx"
    ON "Notification"("tenantId", "companyId", "eventType");

CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "destinationHash" TEXT,
    "payloadHash" TEXT NOT NULL,
    "providerRef" TEXT,
    "errorCode" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationDelivery_tenantId_companyId_notificationId_idx"
    ON "NotificationDelivery"("tenantId", "companyId", "notificationId");

CREATE INDEX "NotificationDelivery_tenantId_companyId_channel_status_idx"
    ON "NotificationDelivery"("tenantId", "companyId", "channel", "status");

ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
