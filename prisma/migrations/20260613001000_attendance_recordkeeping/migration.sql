ALTER TABLE "AttendancePolicy"
  ADD COLUMN "attendanceRecordRetentionDays" INTEGER NOT NULL DEFAULT 1825,
  ADD COLUMN "employeeSelfServiceEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "employeeExportEnabled" BOOLEAN NOT NULL DEFAULT true;
