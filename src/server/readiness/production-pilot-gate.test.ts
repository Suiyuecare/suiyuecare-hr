import { describe, expect, it } from "vitest";
import type { HealthReport } from "@/server/readiness/health";
import {
  buildProductionPilotGateReport,
  formatProductionPilotGateReport,
  productionPilotGatePassed,
} from "@/server/readiness/production-pilot-gate";

const readyHealth: HealthReport = {
  status: "ok",
  service: "hr-one",
  timestamp: "2026-06-17T00:00:00.000Z",
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

describe("production pilot gate", () => {
  it("passes only when the production URL, environment, and database are ready", () => {
    const report = buildProductionPilotGateReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
      healthReport: readyHealth,
    });

    expect(report.status).toBe("ready");
    expect(productionPilotGatePassed(report)).toBe(true);
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });

  it("blocks demo fallback even when the readiness endpoint returns HTTP 200", () => {
    const report = buildProductionPilotGateReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: {
        ...readyHealth,
        status: "degraded",
        checks: [
          {
            name: "environment",
            status: "ok",
            detail: "non-production environment",
          },
          {
            name: "database",
            status: "degraded",
            detail: "database not configured; demo fallback available",
          },
        ],
      },
    });

    expect(report.status).toBe("blocked");
    expect(productionPilotGatePassed(report)).toBe(false);
    expect(report.checks.find((check) => check.name === "production environment")).toMatchObject({
      passed: false,
    });
    expect(report.checks.find((check) => check.name === "production database")).toMatchObject({
      passed: false,
    });
    expect(report.nextActions).toContain(
      "Set a server-side Supabase PostgreSQL DATABASE_URL with schema=hr_one in Vercel Production.",
    );
  });

  it("blocks localhost or non-HTTPS URLs for pilot use", () => {
    const report = buildProductionPilotGateReport({
      appUrl: "http://localhost:3000",
      expectedHost: "hr.suiyuecare.com",
      healthReport: readyHealth,
    });

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.name === "production URL")).toMatchObject({
      passed: false,
      detail: expect.stringContaining("requires HTTPS"),
    });
  });

  it("points Vercel deployments at Supabase pooler or IPv4 when direct database ping fails", () => {
    const report = buildProductionPilotGateReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: {
        ...readyHealth,
        status: "fail",
        checks: [
          readyHealth.checks[0]!,
          {
            name: "database",
            status: "fail",
            detail: "database ping failed; Supabase direct database hosts require IPv6 or the IPv4 add-on, so Vercel/serverless deployments should use a compatible pooler URL or enable IPv4.",
          },
          readyHealth.checks[2]!,
        ],
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.nextActions).toContain(
      "For Vercel/serverless, replace the Supabase direct DATABASE_URL with a Supabase transaction pooler URL including pgbouncer=true&connection_limit=1&schema=hr_one, or enable the Supabase IPv4 add-on for the direct host and set HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true.",
    );
  });

  it("turns the live environment failure into a concrete Supabase network fix", () => {
    const report = buildProductionPilotGateReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      healthReport: {
        ...readyHealth,
        status: "fail",
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
          readyHealth.checks[2]!,
        ],
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.nextActions).toContain(
      "Fix the Vercel Production database network env: use a Supabase transaction pooler DATABASE_URL with pgbouncer=true&connection_limit=1&schema=hr_one, or enable the Supabase IPv4 add-on and set HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true.",
    );
  });

  it("returns a blocked report instead of throwing for invalid URLs", () => {
    const report = buildProductionPilotGateReport({
      appUrl: "not-a-url",
      expectedHost: "hr.suiyuecare.com",
      healthReport: readyHealth,
    });

    expect(report.status).toBe("blocked");
    expect(report.readinessUrl).toBe("[invalid-url]");
    expect(report.checks.find((check) => check.name === "production URL")).toMatchObject({
      passed: false,
      detail: "app URL is not a valid absolute URL",
    });
  });

  it("redacts sensitive values from formatted output and blocks leaked health payloads", () => {
    const report = buildProductionPilotGateReport({
      appUrl: "https://hr.suiyuecare.com",
      healthReport: {
        ...readyHealth,
        checks: [
          readyHealth.checks[0]!,
          {
            name: "database",
            status: "fail",
            detail: "database ping failed: postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
          },
        ],
      },
    });
    const output = formatProductionPilotGateReport(report);

    expect(report.checks.find((check) => check.name === "health payload redaction")).toMatchObject({
      passed: false,
    });
    expect(output).not.toContain("secret@db.example.com");
    expect(output).not.toContain("postgresql://");
    expect(output).toContain("[REDACTED]");
  });
});
