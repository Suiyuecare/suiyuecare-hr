import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-employee", displayName: "Employee" },
  employee: { id: "employee-1", displayName: "Employee" },
};

const termInput = {
  employeeId: "employee-1",
  version: "2026.07",
  status: "active" as const,
  effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
  jobTitle: "Engineer",
  workLocation: "Taipei office",
  regularWorkSchedule: "09:00-18:00 with one-hour break.",
  wagePaymentDay: "Monthly by the fifth business day.",
  wageBasisSummary: "Linked to salary profile.",
  benefitsSummary: "Statutory benefits and company policy.",
  contractLifecycleSummary: "Contract lifecycle follows approved company work rules.",
  severancePensionBonusSummary: "Severance, pension, allowances, and bonuses follow approved rules.",
  mealLodgingToolCostSummary: "No employee-borne meal, lodging, or tool costs unless lawfully approved.",
  safetyHealthSummary: "Safety and health follow workplace safety policies.",
  trainingSummary: "Training follows onboarding and compliance policies.",
  disasterCompensationSicknessSummary: "Occupational disaster and sickness support follow statutory rules.",
  disciplineSummary: "Service discipline follows approved company work rules.",
  rewardDisciplineSummary: "Rewards and discipline follow approved company work rules.",
  rightsObligationsSummary: "Other rights and obligations follow approved policy documents.",
  sourceRef: "policy://employment-terms/2026.07",
  acknowledgementRequired: true,
};

describe("employment terms persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo employment terms when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findMany: vi.fn(async () => {
            throw new Error("database employment terms workspace failed");
          }),
        },
        employeeEmploymentTerm: {
          findMany: vi.fn(async () => {
            throw new Error("database employment terms self failed");
          }),
        },
      }),
    }));

    const {
      getEmploymentTermsWorkspace,
      getOwnEmploymentTerms,
    } = await import("./employment-terms");

    await expect(getEmploymentTermsWorkspace(hrSession)).rejects.toThrow(
      "database employment terms workspace failed",
    );
    await expect(getOwnEmploymentTerms(employeeSession)).rejects.toThrow(
      "database employment terms self failed",
    );
  });

  it("does not fall back to demo employment terms when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database employment terms write failed");
        }),
      }),
    }));

    const {
      acknowledgeEmploymentTerm,
      saveEmploymentTerm,
    } = await import("./employment-terms");

    await expect(saveEmploymentTerm(hrSession, termInput)).rejects.toThrow(
      "database employment terms write failed",
    );
    await expect(acknowledgeEmploymentTerm(employeeSession, "term-1")).rejects.toThrow(
      "database employment terms write failed",
    );
  });
});
