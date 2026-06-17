import { describe, expect, it } from "vitest";
import {
  buildProductionDatabaseRemediationReport,
  formatProductionDatabaseRemediationMarkdown,
  getProductionDatabaseRemediationReport,
} from "@/server/readiness/production-database-remediation";
import type { HealthReport } from "@/server/readiness/health";

const directHostFailureHealth: HealthReport = {
  status: "fail",
  service: "hr-one",
  timestamp: "2026-06-17T07:45:12.330Z",
  checks: [
    {
      name: "environment",
      status: "fail",
      detail: "production environment verification failed",
    },
    {
      name: "database",
      status: "fail",
      detail: "database ping failed; Supabase direct database hosts require IPv6 or the IPv4 add-on, so Vercel/serverless deployments should use a compatible pooler URL or enable IPv4.",
    },
    {
      name: "demo auth",
      status: "ok",
      detail: "demo auth disabled for production runtime",
    },
  ],
};

const readyHealth: HealthReport = {
  status: "ok",
  service: "hr-one",
  timestamp: "2026-06-17T08:00:00.000Z",
  checks: [
    {
      name: "environment",
      status: "ok",
      detail: "production environment posture verified",
    },
    {
      name: "database",
      status: "ok",
      detail: "database ping succeeded",
    },
    {
      name: "demo auth",
      status: "ok",
      detail: "demo auth disabled for production runtime",
    },
  ],
};

describe("production database remediation", () => {
  it("classifies the live Supabase direct-host blocker and keeps remediation output redacted", () => {
    const report = buildProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: directHostFailureHealth,
      fetchedHealthStatusCode: 503,
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
    });

    expect(report.status).toBe("blocked");
    expect(report.rootCause).toBe("supabase_direct_network");
    expect(report.summary).toContain("Vercel/serverless");
    expect(report.tracks.find((track) => track.id === "transaction_pooler")).toMatchObject({
      recommended: true,
    });
    expect(report.nextActions.join("\n")).toContain("transaction pooler");

    const markdown = formatProductionDatabaseRemediationMarkdown(report);
    expect(markdown).toContain("Status: blocked");
    expect(markdown).toContain("Root cause: supabase_direct_network");
    expect(markdown).toContain("Supabase Transaction Pooler");

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("DATABASE_URL=");
    expect(serialized).not.toContain("salary: 60000");
    expect(serialized).not.toContain("bank account");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("DATABASE_URL=");
    expect(markdown).not.toContain("salary: 60000");
  });

  it("marks the gate ready only when production health and database checks are ok", () => {
    const report = buildProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: readyHealth,
      fetchedHealthStatusCode: 200,
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
    });

    expect(report.status).toBe("ready");
    expect(report.rootCause).toBe("ready");
    expect(report.gate.status).toBe("ready");
    expect(report.nextActions[0]).toContain("Production database gate 已通過");
  });

  it("fails closed when live readiness cannot be fetched", async () => {
    const report = await getProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      generatedAt: new Date("2026-06-17T08:00:00.000Z"),
      fetcher: async () => {
        throw new Error("network unavailable");
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.rootCause).toBe("health_unreachable");
    expect(report.nextActions.join("\n")).toContain("/api/health/ready");
  });
});
