import { describe, expect, it } from "vitest";
import { getOperationalMaintenanceReport, type OperationalMaintenanceCounts } from "./maintenance";

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
};

const readyCounts: OperationalMaintenanceCounts = {
  queuedReportJobs: 0,
  failedReportJobs: 0,
  expiredReportArchives: 0,
  expiredAiResults: 0,
  activeAiResults: 2,
  maintenanceAuditEvents: 4,
};

describe("operational maintenance readiness", () => {
  it("keeps demo maintenance visible but not sale-ready evidence", async () => {
    const report = await getOperationalMaintenanceReport(ownerSession, {
      env: {
        HR_ONE_ENV: "development",
      },
      now: new Date("2026-06-22T09:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "action_required",
      databaseConfigured: false,
      readyForAutomatedMaintenance: false,
      countStatus: "not_applicable",
    });
    expect(report.summary).toContain("demo 維護狀態");
    expect(report.signals.find((signal) => signal.id === "report_exports")).toMatchObject({
      status: "action_required",
      metric: "Demo",
    });
  });

  it("blocks production maintenance when cron secret or scope is missing", async () => {
    const report = await getOperationalMaintenanceReport(ownerSession, {
      env: {
        HR_ONE_ENV: "production",
        DATABASE_URL: "postgresql://redacted.example/hrone",
        CRON_SECRET: "cron-secret",
        HR_ONE_CRON_TENANT_ID: "tenant-1",
      },
      loadCounts: async () => readyCounts,
    });

    expect(report.status).toBe("blocked");
    expect(report.signals.find((signal) => signal.id === "cron_scope")).toMatchObject({
      status: "blocked",
      metric: "2/3",
    });
    expect(JSON.stringify(report)).not.toContain("postgresql://redacted.example/hrone");
  });

  it("surfaces report and AI cleanup work with aggregate counts only", async () => {
    const report = await getOperationalMaintenanceReport(ownerSession, {
      env: {
        HR_ONE_ENV: "production",
        DATABASE_URL: "postgresql://redacted.example/hrone",
        CRON_SECRET: "cron-secret",
        HR_ONE_CRON_TENANT_ID: "tenant-1",
        HR_ONE_CRON_COMPANY_ID: "company-1",
      },
      loadCounts: async () => ({
        queuedReportJobs: 1,
        failedReportJobs: 1,
        expiredReportArchives: 2,
        expiredAiResults: 3,
        activeAiResults: 5,
        maintenanceAuditEvents: 7,
      }),
    });

    expect(report.status).toBe("action_required");
    expect(report.signals.find((signal) => signal.id === "report_exports")).toMatchObject({
      status: "action_required",
      metric: "1 佇列 / 1 失敗 / 2 到期",
    });
    expect(report.signals.find((signal) => signal.id === "ai_result_retention")).toMatchObject({
      status: "action_required",
      metric: "3 待清 / 5 暫存",
    });
    expect(JSON.stringify(report)).not.toMatch(/postgresql:\/\/redacted|database unavailable|身分證字號|銀行帳號/);
  });

  it("marks maintenance ready when production scope, counts, and audit evidence are clean", async () => {
    const report = await getOperationalMaintenanceReport(ownerSession, {
      env: {
        HR_ONE_ENV: "production",
        DATABASE_URL: "postgresql://redacted.example/hrone",
        CRON_SECRET: "cron-secret",
        HR_ONE_CRON_TENANT_ID: "tenant-1",
        HR_ONE_CRON_COMPANY_ID: "company-1",
      },
      loadCounts: async () => readyCounts,
    });

    expect(report).toMatchObject({
      status: "ready",
      readyForAutomatedMaintenance: true,
      countStatus: "ready",
    });
    expect(report.signals.every((signal) => signal.status === "ready")).toBe(true);
    expect(report.summary).toContain("正式營運維護已可追蹤");
  });

  it("fails closed when database maintenance counts cannot be loaded", async () => {
    const report = await getOperationalMaintenanceReport(ownerSession, {
      env: {
        HR_ONE_ENV: "production",
        DATABASE_URL: "postgresql://redacted.example/hrone",
        CRON_SECRET: "cron-secret",
        HR_ONE_CRON_TENANT_ID: "tenant-1",
        HR_ONE_CRON_COMPANY_ID: "company-1",
      },
      loadCounts: async () => {
        throw new Error("database unavailable with private details");
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.countStatus).toBe("failed");
    expect(report.summary).toContain("維護狀態查詢失敗");
    expect(JSON.stringify(report)).not.toContain("database unavailable with private details");
  });
});
