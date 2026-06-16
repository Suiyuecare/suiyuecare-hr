import { describe, expect, it } from "vitest";
import type { HealthReport } from "@/server/readiness/health";
import {
  buildPilotAcceptanceReport,
  formatPilotAcceptanceReport,
} from "@/server/readiness/pilot-acceptance";
import {
  buildPilotDoctorReport,
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

const readyDoctor = buildPilotDoctorReport({
  vercelEnvNames: [...requiredProductionPilotEnvKeys],
  productionGate: buildProductionPilotGateReport({
    appUrl: "https://hr.suiyuecare.com",
    expectedHost: "hr.suiyuecare.com",
    healthReport: readyHealth,
  }),
  localEnvDraft: {
    status: "ready",
    detail: "local draft ready",
  },
  supabasePilot: {
    status: "passed",
    detail: "pilot seed verified",
  },
});

const passedRehearsal = {
  status: "passed" as const,
  stepIds: [
    "access_review",
    "attendance",
    "leave_approval",
    "announcement",
    "payroll",
    "payslip",
  ] as const,
  sensitiveValuesReturned: false,
};

describe("pilot acceptance matrix", () => {
  it("allows starting a pilot only with production readiness, real cohort, and rehearsal evidence", () => {
    const report = buildPilotAcceptanceReport({
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
      doctor: readyDoctor,
      cohort: {
        source: "real_customer",
        employeeCount: 25,
        managerCount: 3,
      },
      rehearsal: passedRehearsal,
      finalReview: {
        status: "not_run",
      },
    });

    expect(report.status).toBe("ready_to_start");
    expect(report.readyToStart).toBe(true);
    expect(report.complete).toBe(false);
    expect(report.items.find((item) => item.id === "two_week_completion")).toMatchObject({
      status: "blocked",
    });
  });

  it("does not treat synthetic Supabase seed data as a real company trial", () => {
    const report = buildPilotAcceptanceReport({
      doctor: readyDoctor,
      cohort: {
        source: "synthetic",
        employeeCount: 25,
        managerCount: 3,
      },
      rehearsal: passedRehearsal,
      finalReview: {
        status: "not_run",
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.readyToStart).toBe(false);
    expect(report.items.find((item) => item.id === "real_company_cohort")).toMatchObject({
      status: "rehearsed",
    });
  });

  it("blocks when doctor is blocked and redacts sensitive details in formatted output", () => {
    const blockedDoctor = buildPilotDoctorReport({
      vercelEnvNames: [],
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
      localEnvDraft: {
        status: "blocked",
        detail: "DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
      },
      supabasePilot: {
        status: "passed",
        detail: "pilot seed verified",
      },
    });
    const report = buildPilotAcceptanceReport({
      doctor: blockedDoctor,
      cohort: {
        source: "synthetic",
        employeeCount: 25,
        managerCount: 3,
      },
      rehearsal: passedRehearsal,
      finalReview: {
        status: "not_run",
      },
    });
    const output = formatPilotAcceptanceReport(report);

    expect(report.status).toBe("blocked");
    expect(output).not.toContain("postgresql://");
    expect(output).not.toContain("secret@db.example.com");
    expect(output).toContain("Production deployment, database, and env are ready");
  });
});
