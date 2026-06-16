CREATE TABLE "CompanyAnnouncement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "status" TEXT NOT NULL DEFAULT 'published',
  "requireReceipt" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeAnnouncementReceipt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "receiptHash" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'employee_self_service',

  CONSTRAINT "EmployeeAnnouncementReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyAnnouncement_tenantId_companyId_status_publishedAt_idx"
  ON "CompanyAnnouncement"("tenantId", "companyId", "status", "publishedAt");

CREATE UNIQUE INDEX "EmployeeAnnouncementReceipt_announcementId_employeeId_key"
  ON "EmployeeAnnouncementReceipt"("announcementId", "employeeId");

CREATE INDEX "EmployeeAnnouncementReceipt_tenantId_companyId_employeeId_acknowledgedAt_idx"
  ON "EmployeeAnnouncementReceipt"("tenantId", "companyId", "employeeId", "acknowledgedAt");

ALTER TABLE "CompanyAnnouncement"
  ADD CONSTRAINT "CompanyAnnouncement_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeAnnouncementReceipt"
  ADD CONSTRAINT "EmployeeAnnouncementReceipt_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeAnnouncementReceipt"
  ADD CONSTRAINT "EmployeeAnnouncementReceipt_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "CompanyAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeAnnouncementReceipt"
  ADD CONSTRAINT "EmployeeAnnouncementReceipt_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
