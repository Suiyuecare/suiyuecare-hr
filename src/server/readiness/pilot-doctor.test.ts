import { describe, expect, it } from "vitest";
import type { HealthReport } from "@/server/readiness/health";
import {
  buildPilotDoctorReport,
  formatPilotDoctorReport,
  getMissingProductionPilotEnvKeys,
  pilotDoctorPassed,
  requiredProductionPilotEnvKeys,
} from "@/server/readiness/pilot-doctor";
import { buildProductionPilotGateReport } from "@/server/readiness/production-pilot-gate";

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
  ],
};

describe("pilot doctor", () => {
  it("passes when Vercel env, live gate, and Supabase pilot data are ready", () => {
    const report = buildPilotDoctorReport({
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
      vercelEnvNames: [...requiredProductionPilotEnvKeys],
      productionGate: buildProductionPilotGateReport({
        appUrl: "https://hr.suiyuecare.com",
        expectedHost: "hr.suiyuecare.com",
        healthReport: readyHealth,
      }),
      supabasePilot: {
        status: "passed",
        detail: "pilot seed verified",
      },
    });

    expect(report.status).toBe("ready");
    expect(pilotDoctorPassed(report)).toBe(true);
    expect(report.nextActions).toEqual([]);
  });

  it("blocks and points to DATABASE_URL when production env is empty", () => {
    const report = buildPilotDoctorReport({
      vercelEnvNames: [],
      productionGate: buildProductionPilotGateReport({
        appUrl: "https://hr.suiyuecare.com",
        expectedHost: "hr.suiyuecare.com",
        healthReport: readyHealth,
      }),
      supabasePilot: {
        status: "passed",
        detail: "pilot seed verified",
      },
    });

    expect(report.status).toBe("blocked");
    expect(getMissingProductionPilotEnvKeys([])).toContain("DATABASE_URL");
    expect(report.checks.find((check) => check.name === "Vercel production env")).toMatchObject({
      passed: false,
    });
    expect(report.nextActions).toContain(
      "Use the Supabase server-side Postgres connection string with ?schema=hr_one for DATABASE_URL; do not use the publishable key as DATABASE_URL.",
    );
  });

  it("dedupes gate actions and redacts sensitive details in formatted output", () => {
    const report = buildPilotDoctorReport({
      vercelEnvNames: ["DATABASE_URL"],
      productionGate: buildProductionPilotGateReport({
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
              detail: "database ping failed: postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
            },
          ],
        },
      }),
      supabasePilot: {
        status: "failed",
        detail: "failed with DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
      },
    });
    const output = formatPilotDoctorReport(report);

    expect(report.status).toBe("blocked");
    expect(output).not.toContain("postgresql://");
    expect(output).not.toContain("secret@db.example.com");
    expect(output).toContain("[REDACTED]");
  });
});
