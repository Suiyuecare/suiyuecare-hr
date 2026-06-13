CREATE TABLE "CompanyCalendarDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "calendarDate" TIMESTAMP(3) NOT NULL,
    "dayType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "requiresWork" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'company',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyCalendarDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyCalendarDay_companyId_calendarDate_key" ON "CompanyCalendarDay"("companyId", "calendarDate");
CREATE INDEX "CompanyCalendarDay_tenantId_companyId_calendarDate_idx" ON "CompanyCalendarDay"("tenantId", "companyId", "calendarDate");
CREATE INDEX "CompanyCalendarDay_tenantId_companyId_dayType_idx" ON "CompanyCalendarDay"("tenantId", "companyId", "dayType");

ALTER TABLE "CompanyCalendarDay" ADD CONSTRAINT "CompanyCalendarDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
