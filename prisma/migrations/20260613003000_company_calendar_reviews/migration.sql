CREATE TABLE "CompanyCalendarReview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "calendarYear" INTEGER NOT NULL,
  "sourceTitle" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceCheckedAt" TIMESTAMP(3) NOT NULL,
  "reviewedBy" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL,
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending_review',
  "nationalHolidayCount" INTEGER NOT NULL DEFAULT 0,
  "makeupWorkdayCount" INTEGER NOT NULL DEFAULT 0,
  "companyHolidayCount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyCalendarReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyCalendarReview_companyId_calendarYear_key" ON "CompanyCalendarReview"("companyId", "calendarYear");
CREATE INDEX "CompanyCalendarReview_tenantId_companyId_calendarYear_idx" ON "CompanyCalendarReview"("tenantId", "companyId", "calendarYear");
CREATE INDEX "CompanyCalendarReview_tenantId_companyId_reviewStatus_idx" ON "CompanyCalendarReview"("tenantId", "companyId", "reviewStatus");

ALTER TABLE "CompanyCalendarReview"
  ADD CONSTRAINT "CompanyCalendarReview_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
