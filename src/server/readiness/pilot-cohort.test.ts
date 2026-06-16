import { describe, expect, it } from "vitest";
import {
  buildPilotCohortFromSnapshot,
  readPilotCohortFromDatabase,
  unknownCohort,
} from "@/server/readiness/pilot-cohort";

describe("pilot cohort evidence", () => {
  it("treats a non-demo tenant with active employees and manager lines as real customer cohort evidence", () => {
    const cohort = buildPilotCohortFromSnapshot({
      tenantFound: true,
      companyFound: true,
      tenantSlug: "customer-a",
      tenantPlan: "enterprise",
      companyId: "company_1",
      activeEmployeeCount: 25,
      managerWithDirectReportsCount: 3,
    });

    expect(cohort).toEqual({
      source: "real_customer",
      employeeCount: 25,
      managerCount: 3,
    });
  });

  it("does not promote demo or missing tenants to real customer evidence", () => {
    expect(buildPilotCohortFromSnapshot({
      tenantFound: true,
      companyFound: true,
      tenantSlug: "hr-one-demo",
      tenantPlan: "demo",
      companyId: "demo-company",
      activeEmployeeCount: 25,
      managerWithDirectReportsCount: 3,
    })).toEqual({
      source: "synthetic",
      employeeCount: 25,
      managerCount: 3,
    });

    expect(buildPilotCohortFromSnapshot({
      tenantFound: true,
      companyFound: true,
      tenantSlug: "suiyuecare-pilot",
      tenantPlan: "pilot",
      companyId: "company_suiyuecare_pilot",
      activeEmployeeCount: 25,
      managerWithDirectReportsCount: 3,
    })).toEqual({
      source: "synthetic",
      employeeCount: 25,
      managerCount: 3,
    });

    expect(buildPilotCohortFromSnapshot({
      tenantFound: true,
      companyFound: false,
      tenantSlug: "customer-a",
      tenantPlan: "enterprise",
      companyId: "missing-company",
      activeEmployeeCount: 0,
      managerWithDirectReportsCount: 0,
    })).toEqual(unknownCohort());

    expect(buildPilotCohortFromSnapshot({
      tenantFound: false,
      companyFound: false,
      tenantSlug: "missing",
      tenantPlan: null,
      companyId: null,
      activeEmployeeCount: 0,
      managerWithDirectReportsCount: 0,
    })).toEqual(unknownCohort());
  });

  it("returns aggregate-only evidence without employee identifiers", () => {
    const cohort = buildPilotCohortFromSnapshot({
      tenantFound: true,
      companyFound: true,
      tenantSlug: "customer-a",
      tenantPlan: "enterprise",
      companyId: "company_1",
      activeEmployeeCount: 50,
      managerWithDirectReportsCount: 6,
    });

    const serialized = JSON.stringify(cohort);

    expect(serialized).toContain("\"employeeCount\":50");
    expect(serialized).not.toContain("employeeNo");
    expect(serialized).not.toContain("displayName");
    expect(serialized).not.toContain("salary");
    expect(serialized).not.toContain("bank");
  });

  it("returns unknown without touching Prisma when DATABASE_URL is missing", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(readPilotCohortFromDatabase({ tenantSlug: "customer-a" })).resolves.toEqual(unknownCohort());
    } finally {
      if (previousDatabaseUrl) {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
