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
    {
      name: "demo auth",
      status: "ok",
      detail: "demo auth disabled for production runtime",
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
      localEnvDraft: {
        status: "ready",
        detail: "local draft ready",
      },
      supabasePilot: {
        status: "passed",
        detail: "pilot seed verified",
      },
    });

    expect(report.status).toBe("ready");
    expect(pilotDoctorPassed(report)).toBe(true);
    expect(report.nextActions).toEqual([]);
  });

  it("blocks and points to DATABASE_URL when production env is empty and local draft is missing", () => {
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
      localEnvDraft: {
        status: "missing",
        detail: ".env.vercel.production does not exist",
      },
    });

    expect(report.status).toBe("blocked");
    expect(getMissingProductionPilotEnvKeys([])).toContain("DATABASE_URL");
    expect(report.checks.find((check) => check.name === "Vercel production env")).toMatchObject({
      passed: false,
    });
    expect(report.nextActions).toContain(
      "Use a server-side Supabase Postgres DATABASE_URL with schema=hr_one. On Vercel, prefer the transaction pooler URL with pgbouncer=true&connection_limit=1&schema=hr_one; do not use the publishable key as DATABASE_URL.",
    );
    expect(report.nextActions).toContain(
      "Run pnpm vercel:create-production-env-draft to create a gitignored .env.vercel.production draft with generated local secrets.",
    );
    expect(report.nextActions).toContain(
      "Optionally run pnpm vercel:bootstrap-known-env -- --env-file=.env.vercel.production to prefill safe known Production env values; it will not write DATABASE_URL, vault refs, or restore-drill evidence.",
    );
  });

  it("reports unresolved local env draft placeholders before Vercel apply", () => {
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
      localEnvDraft: {
        status: "blocked",
        detail: ".env.vercel.production has 3 unresolved placeholder key(s) and 3 failed verifier check(s)",
        unresolvedPlaceholderKeys: ["DATABASE_URL", "HR_ONE_AUTH_ISSUER_URL", "HR_ONE_AUTH_LOGIN_URL"],
        failedCheckNames: ["database url", "auth issuer url", "auth login url"],
      },
    });

    expect(report.checks.find((check) => check.name === "local production env draft")).toMatchObject({
      passed: false,
      detail: ".env.vercel.production has 3 unresolved placeholder key(s) and 3 failed verifier check(s)",
    });
    expect(report.nextActions).toContain(
      "Replace local .env.vercel.production placeholders for: DATABASE_URL, HR_ONE_AUTH_ISSUER_URL, HR_ONE_AUTH_LOGIN_URL.",
    );
    expect(report.nextActions).toContain(
      "Fix local production env verification failures before apply: database url, auth issuer url, auth login url.",
    );
    expect(report.nextActions).toContain(
      "Run pnpm env:verify:production -- --env-file=.env.vercel.production until the local production env draft passes before applying it to Vercel.",
    );
    expect(report.nextActions).toContain(
      "Use a server-side Supabase Postgres DATABASE_URL with schema=hr_one. On Vercel, prefer the transaction pooler URL with pgbouncer=true&connection_limit=1&schema=hr_one; do not use the publishable key as DATABASE_URL.",
    );
  });

  it("tells the operator to apply a ready env draft when the live gate is still blocked", () => {
    const report = buildPilotDoctorReport({
      vercelEnvNames: [...requiredProductionPilotEnvKeys],
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
              detail: "database ping failed; Supabase direct database hosts require IPv6 or the IPv4 add-on",
            },
            readyHealth.checks[2]!,
          ],
        },
      }),
      supabasePilot: {
        status: "passed",
        detail: "pilot seed verified",
      },
      localEnvDraft: {
        status: "ready",
        detail: "local draft ready",
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.nextActions).toContain(
      "Apply the verified production env draft with pnpm vercel:apply-production-env -- --env-file=.env.vercel.production, then trigger a new Vercel production deployment.",
    );
  });

  it("does not suggest known-env bootstrap after bootstrap keys are already present", () => {
    const missingAfterBootstrap = [
      "DATABASE_URL",
      "HR_ONE_OBJECT_STORAGE_SECRET_REF",
      "HR_ONE_RATE_LIMIT_SECRET_REF",
      "HR_ONE_BACKUP_ENCRYPTION_KEY_REF",
      "HR_ONE_BACKUP_RESTORE_TESTED_AT",
    ];
    const report = buildPilotDoctorReport({
      vercelEnvNames: requiredProductionPilotEnvKeys.filter((key) => !missingAfterBootstrap.includes(key)),
      productionGate: buildProductionPilotGateReport({
        appUrl: "https://hr.suiyuecare.com",
        expectedHost: "hr.suiyuecare.com",
        healthReport: readyHealth,
      }),
      supabasePilot: {
        status: "passed",
        detail: "pilot seed verified",
      },
      localEnvDraft: {
        status: "blocked",
        detail: ".env.vercel.production has 2 unresolved placeholder key(s) and 3 failed verifier check(s)",
        unresolvedPlaceholderKeys: [
          "DATABASE_URL",
          "HR_ONE_BACKUP_RESTORE_TESTED_AT",
        ],
        failedCheckNames: [
          "database url",
          "database private schema",
          "restore drill evidence",
        ],
      },
    });

    expect(report.nextActions).not.toContain(
      "Optionally run pnpm vercel:bootstrap-known-env -- --env-file=.env.vercel.production to prefill safe known Production env values; it will not write DATABASE_URL, vault refs, or restore-drill evidence.",
    );
    expect(report.nextActions).toContain(
      "Known Vercel bootstrap env values are already present; fill remaining operator-managed Production values: DATABASE_URL, HR_ONE_OBJECT_STORAGE_SECRET_REF, HR_ONE_RATE_LIMIT_SECRET_REF, HR_ONE_BACKUP_ENCRYPTION_KEY_REF, HR_ONE_BACKUP_RESTORE_TESTED_AT.",
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
