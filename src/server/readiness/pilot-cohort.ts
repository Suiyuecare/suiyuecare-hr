import { getDb } from "@/server/db/client";
import type { PilotAcceptanceCohort } from "@/server/readiness/pilot-acceptance";

export type PilotCohortDatabaseOptions = {
  tenantSlug: string;
  companyId?: string | null;
};

export type PilotCohortSnapshot = {
  tenantFound: boolean;
  companyFound: boolean;
  tenantSlug: string | null;
  tenantPlan: string | null;
  companyId: string | null;
  activeEmployeeCount: number;
  managerWithDirectReportsCount: number;
};

export async function readPilotCohortFromDatabase(
  options: PilotCohortDatabaseOptions,
): Promise<PilotAcceptanceCohort> {
  const tenantSlug = options.tenantSlug.trim();
  if (!tenantSlug) return unknownCohort();
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("REPLACE_WITH_")) {
    return unknownCohort();
  }

  const db = getDb();
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      companies: options.companyId ? { where: { id: options.companyId } } : { take: 1 },
    },
  });
  const company = tenant?.companies[0] ?? null;
  if (!tenant || !company) {
    return buildPilotCohortFromSnapshot({
      tenantFound: Boolean(tenant),
      companyFound: false,
      tenantSlug: tenant?.slug ?? tenantSlug,
      tenantPlan: tenant?.plan ?? null,
      companyId: options.companyId ?? null,
      activeEmployeeCount: 0,
      managerWithDirectReportsCount: 0,
    });
  }

  const activeEmployees = await db.employee.findMany({
    where: {
      tenantId: tenant.id,
      companyId: company.id,
      employmentStatus: "active",
    },
    select: {
      id: true,
      managerId: true,
    },
  });
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
  const managerIds = new Set(
    activeEmployees
      .map((employee) => employee.managerId)
      .filter((managerId): managerId is string => Boolean(managerId && activeEmployeeIds.has(managerId))),
  );

  return buildPilotCohortFromSnapshot({
    tenantFound: true,
    companyFound: true,
    tenantSlug: tenant.slug,
    tenantPlan: tenant.plan,
    companyId: company.id,
    activeEmployeeCount: activeEmployees.length,
    managerWithDirectReportsCount: managerIds.size,
  });
}

export function buildPilotCohortFromSnapshot(snapshot: PilotCohortSnapshot): PilotAcceptanceCohort {
  const isRealCustomerTenant = snapshot.tenantFound &&
    snapshot.companyFound &&
    Boolean(snapshot.tenantSlug) &&
    !["hr-one-demo", "suiyuecare-pilot"].includes(snapshot.tenantSlug ?? "") &&
    snapshot.tenantPlan !== "demo" &&
    snapshot.tenantPlan !== "pilot";
  return {
    source: isRealCustomerTenant ? "real_customer" : snapshot.companyFound ? "synthetic" : "unknown",
    employeeCount: snapshot.companyFound ? snapshot.activeEmployeeCount : null,
    managerCount: snapshot.companyFound ? snapshot.managerWithDirectReportsCount : null,
  };
}

export function unknownCohort(): PilotAcceptanceCohort {
  return {
    source: "unknown",
    employeeCount: null,
    managerCount: null,
  };
}
