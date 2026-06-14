import { afterEach, describe, expect, it, vi } from "vitest";

const minimumAttendanceRetentionDays = 365 * 5;

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-owner", displayName: "Owner" },
  employee: { id: "employee-owner", displayName: "Owner" },
};

const policyInput = {
  name: "Production attendance policy",
  status: "active" as const,
  regularDailyMinutes: 480,
  overtimeWarningDailyMinutes: 600,
  clockInGraceMinutes: 5,
  clockOutGraceMinutes: 5,
  requireOvertimeApproval: true,
  requirePunchCorrectionApproval: true,
  allowMobilePunch: true,
  attendanceRecordRetentionDays: minimumAttendanceRetentionDays,
  employeeSelfServiceEnabled: true,
  employeeExportEnabled: true,
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
};

describe("attendance policy persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo attendance policies when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        attendancePolicy: {
          findMany: vi.fn(async () => {
            throw new Error("database attendance policy read failed");
          }),
        },
      }),
    }));

    const {
      getActiveAttendancePolicy,
      getAttendancePolicySettings,
    } = await import("./policies");

    await expect(getAttendancePolicySettings(ownerSession)).rejects.toThrow(
      "database attendance policy read failed",
    );
    await expect(getActiveAttendancePolicy(ownerSession)).rejects.toThrow(
      "database attendance policy read failed",
    );
  });

  it("does not fall back to demo attendance policy saves when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database attendance policy write failed");
        }),
      }),
    }));

    const { saveAttendancePolicySettings } = await import("./policies");

    await expect(saveAttendancePolicySettings(ownerSession, policyInput)).rejects.toThrow(
      "database attendance policy write failed",
    );
  });
});
