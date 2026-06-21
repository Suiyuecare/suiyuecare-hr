import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type OrganizationCompanySettings = {
  id: string;
  name: string;
  legalName: string;
  taxId: string;
  timezone: string;
  currency: string;
};

export type OrganizationDepartmentSettings = {
  id: string;
  code: string;
  name: string;
  parentDepartmentId: string | null;
  employeeCount: number;
  managerCount: number;
  childDepartmentCount: number;
};

export type OrganizationJobTitleSummary = {
  title: string;
  employeeCount: number;
  departmentCount: number;
};

export type OrganizationJobLevelSettings = {
  id: string;
  code: string;
  name: string;
  rank: number;
  status: "active" | "inactive";
  description: string | null;
  positionCount: number;
};

export type OrganizationJobPositionSettings = {
  id: string;
  code: string;
  title: string;
  family: string;
  status: "active" | "inactive";
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  levelId: string | null;
  levelCode: string | null;
  levelName: string | null;
  employeeCount: number;
};

export type OrganizationManagerLine = {
  employeeId: string;
  employeeNo: string;
  displayName: string;
  jobTitle: string;
  departmentName: string | null;
  directReportCount: number;
};

export type OrganizationEmployeeOption = {
  id: string;
  employeeNo: string;
  displayName: string;
  jobTitle: string;
  departmentName: string | null;
  managerId: string | null;
  directReportCount: number;
};

export type OrganizationManagerLineRisk = {
  id: string;
  severity: "ready" | "warning" | "danger";
  title: string;
  detail: string;
  action: string;
};

export type OrganizationReadiness = {
  status: "ready" | "warning" | "blocked";
  blockers: string[];
  warnings: string[];
  nextActions: string[];
};

export type OrganizationCommandTone = "ready" | "warning" | "danger";

export type OrganizationCommandCard = {
  id: string;
  label: string;
  title: string;
  value: string;
  detail: string;
  tone: OrganizationCommandTone;
  href: string;
  actionLabel: string;
};

export type OrganizationActionQueueItem = {
  id: string;
  stepLabel: string;
  title: string;
  detail: string;
  tone: OrganizationCommandTone;
  href: string;
  actionLabel: string;
};

export type OrganizationSettingsView = {
  company: OrganizationCompanySettings;
  departments: OrganizationDepartmentSettings[];
  jobLevels: OrganizationJobLevelSettings[];
  jobPositions: OrganizationJobPositionSettings[];
  jobTitles: OrganizationJobTitleSummary[];
  employees: OrganizationEmployeeOption[];
  managerLines: OrganizationManagerLine[];
  managerLineRisks: OrganizationManagerLineRisk[];
  readiness: OrganizationReadiness;
  commandCards: OrganizationCommandCard[];
  actionQueue: OrganizationActionQueueItem[];
  auditScope: string[];
};

export type OrganizationCompanyInput = Partial<{
  name: string;
  legalName: string;
  taxId: string;
  timezone: string;
  currency: string;
}>;

export type OrganizationDepartmentInput = Partial<{
  id: string | null;
  code: string;
  name: string;
  parentDepartmentId: string | null;
}>;

export type OrganizationJobLevelInput = Partial<{
  id: string | null;
  code: string;
  name: string;
  rank: number;
  status: string;
  description: string | null;
}>;

export type OrganizationJobPositionInput = Partial<{
  id: string | null;
  code: string;
  title: string;
  family: string;
  status: string;
  departmentId: string | null;
  levelId: string | null;
  description: string | null;
}>;

export type OrganizationManagerLineInput = Partial<{
  employeeId: string;
  managerId: string | null;
  changeReason: string | null;
}>;

type OrganizationDemoState = {
  company: OrganizationCompanySettings;
  departments: Array<OrganizationDepartmentSettings & { parentDepartmentId: string | null }>;
  jobLevels: OrganizationJobLevelSettings[];
  jobPositions: OrganizationJobPositionSettings[];
  employees: OrganizationEmployeeRecord[];
};

type OrganizationEmployeeRecord = {
  id: string;
  employeeNo: string;
  displayName: string;
  jobTitle: string;
  jobPositionId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  directReportCount: number;
};

const globalForOrganizationSettings = globalThis as unknown as {
  hrOneOrganizationSettingsDemoState?: OrganizationDemoState;
};

export async function getOrganizationSettings(session: SessionLike): Promise<OrganizationSettingsView> {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    return getDbOrganizationSettings(session);
  }
  return buildOrganizationSettingsView(getOrganizationDemoState());
}

export async function updateOrganizationCompanySettings(
  session: SessionLike,
  input: OrganizationCompanyInput,
) {
  assertPermission(session.role, "settings:write");
  const beforeView = await getOrganizationSettings({ ...session, role: "owner" });
  const normalized = normalizeCompanyInput(input, beforeView.company);

  if (canUseDatabase(session)) {
    return updateDbCompanySettings(session, beforeView.company, normalized);
  }
  return updateDemoCompanySettings(session, beforeView.company, normalized);
}

export async function upsertOrganizationDepartment(
  session: SessionLike,
  input: OrganizationDepartmentInput,
) {
  assertPermission(session.role, "settings:write");
  const current = await getOrganizationSettings({ ...session, role: "owner" });
  const normalized = normalizeDepartmentInput(input, current.departments);

  if (canUseDatabase(session)) {
    return upsertDbDepartment(session, normalized);
  }
  return upsertDemoDepartment(session, normalized);
}

export async function upsertOrganizationJobLevel(
  session: SessionLike,
  input: OrganizationJobLevelInput,
) {
  assertPermission(session.role, "settings:write");
  const current = await getOrganizationSettings({ ...session, role: "owner" });
  const normalized = normalizeJobLevelInput(input, current.jobLevels);

  if (canUseDatabase(session)) {
    return upsertDbJobLevel(session, normalized);
  }
  return upsertDemoJobLevel(session, normalized);
}

export async function upsertOrganizationJobPosition(
  session: SessionLike,
  input: OrganizationJobPositionInput,
) {
  assertPermission(session.role, "settings:write");
  const current = await getOrganizationSettings({ ...session, role: "owner" });
  const normalized = normalizeJobPositionInput(input, current);

  if (canUseDatabase(session)) {
    return upsertDbJobPosition(session, normalized);
  }
  return upsertDemoJobPosition(session, normalized);
}

export async function updateOrganizationManagerLine(
  session: SessionLike,
  input: OrganizationManagerLineInput,
) {
  assertPermission(session.role, "settings:write");
  const current = await getOrganizationSettings({ ...session, role: "owner" });
  const normalized = normalizeManagerLineInput(input, current.employees);

  if (canUseDatabase(session)) {
    return updateDbManagerLine(session, normalized);
  }
  return updateDemoManagerLine(session, normalized);
}

export function resetOrganizationSettingsDemoState() {
  const overview = getFallbackCompanyOverview();
  const departments = overview.company.departments.map((department) => ({
    id: department.id,
    code: department.code,
    name: department.name,
    parentDepartmentId: null,
    employeeCount: department._count.employees,
    managerCount: 0,
    childDepartmentCount: 0,
  }));
  const employees = overview.company.employees.map((employee) => ({
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
    jobTitle: employee.jobTitle,
    jobPositionId: demoJobPositionId(employee.jobTitle),
    departmentId: employee.department?.id ?? null,
    departmentName: employee.department?.name ?? null,
    managerId: employee.managerId,
    directReportCount: employee.directReports.length,
  }));
  const managerCountByDepartment = countManagersByDepartment(employees);
  globalForOrganizationSettings.hrOneOrganizationSettingsDemoState = {
    company: {
      id: overview.company.id,
      name: overview.company.name,
      legalName: overview.company.legalName,
      taxId: "DEMO-TAX-ID",
      timezone: overview.company.timezone,
      currency: "TWD",
    },
    departments: departments.map((department) => ({
      ...department,
      managerCount: managerCountByDepartment.get(department.id) ?? 0,
    })),
    jobLevels: demoJobLevels(),
    jobPositions: demoJobPositions(employees),
    employees,
  };
}

function getOrganizationDemoState() {
  if (!globalForOrganizationSettings.hrOneOrganizationSettingsDemoState) {
    resetOrganizationSettingsDemoState();
  }
  return globalForOrganizationSettings.hrOneOrganizationSettingsDemoState!;
}

async function getDbOrganizationSettings(session: SessionLike) {
  const company = await getDb().company.findFirstOrThrow({
    where: {
      id: session.companyId!,
      tenantId: session.tenantId!,
    },
    include: {
      departments: {
        orderBy: [{ code: "asc" }],
      },
      jobLevels: {
        include: {
          _count: {
            select: {
              positions: true,
            },
          },
        },
        orderBy: [{ rank: "asc" }, { code: "asc" }],
      },
      jobPositions: {
        include: {
          department: {
            select: {
              name: true,
            },
          },
          level: {
            select: {
              code: true,
              name: true,
            },
          },
          _count: {
            select: {
              employees: true,
            },
          },
        },
        orderBy: [{ family: "asc" }, { code: "asc" }],
      },
      employees: {
        select: {
          id: true,
          employeeNo: true,
          displayName: true,
          jobTitle: true,
          jobPositionId: true,
          departmentId: true,
          managerId: true,
          department: {
            select: {
              name: true,
            },
          },
          directReports: {
            select: {
              id: true,
            },
          },
        },
        orderBy: {
          employeeNo: "asc",
        },
      },
    },
  });

  const employees = company.employees.map((employee) => ({
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
    jobTitle: employee.jobTitle,
    jobPositionId: employee.jobPositionId,
    departmentId: employee.departmentId,
    departmentName: employee.department?.name ?? null,
    managerId: employee.managerId,
    directReportCount: employee.directReports.length,
  }));
  const employeeCountByDepartment = countEmployeesByDepartment(employees);
  const managerCountByDepartment = countManagersByDepartment(employees);
  const childCountByDepartment = countChildDepartments(company.departments);

  return buildOrganizationSettingsView({
    company: {
      id: company.id,
      name: company.name,
      legalName: company.legalName,
      taxId: company.taxId,
      timezone: company.timezone,
      currency: company.currency,
    },
    departments: company.departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      parentDepartmentId: department.parentDepartmentId,
      employeeCount: employeeCountByDepartment.get(department.id) ?? 0,
      managerCount: managerCountByDepartment.get(department.id) ?? 0,
      childDepartmentCount: childCountByDepartment.get(department.id) ?? 0,
    })),
    jobLevels: company.jobLevels.map((level) => ({
      id: level.id,
      code: level.code,
      name: level.name,
      rank: level.rank,
      status: normalizeStatus(level.status),
      description: level.description,
      positionCount: level._count.positions,
    })),
    jobPositions: company.jobPositions.map((position) => ({
      id: position.id,
      code: position.code,
      title: position.title,
      family: position.family,
      status: normalizeStatus(position.status),
      description: position.description,
      departmentId: position.departmentId,
      departmentName: position.department?.name ?? null,
      levelId: position.levelId,
      levelCode: position.level?.code ?? null,
      levelName: position.level?.name ?? null,
      employeeCount: position._count.employees,
    })),
    employees,
  });
}

async function updateDbCompanySettings(
  session: SessionLike,
  before: OrganizationCompanySettings,
  normalized: OrganizationCompanySettings,
) {
  const db = getDb();
  const updated = await db.$transaction(async (tx) => {
    const record = await tx.company.update({
      where: {
        id: session.companyId!,
      },
      data: {
        name: normalized.name,
        legalName: normalized.legalName,
        taxId: normalized.taxId,
        timezone: normalized.timezone,
        currency: normalized.currency,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "company_profile",
      entityId: record.id,
      before,
      after: normalized,
      metadata: {
        changedFields: changedFields(before, normalized),
        taxIdChanged: before.taxId !== normalized.taxId,
      },
    });
    return record;
  });
  return {
    id: updated.id,
    name: updated.name,
    legalName: updated.legalName,
    taxId: updated.taxId,
    timezone: updated.timezone,
    currency: updated.currency,
  } satisfies OrganizationCompanySettings;
}

function updateDemoCompanySettings(
  session: SessionLike,
  before: OrganizationCompanySettings,
  normalized: OrganizationCompanySettings,
) {
  getOrganizationDemoState().company = normalized;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "company_profile",
    entityId: normalized.id,
    before,
    after: normalized,
    metadata: {
      changedFields: changedFields(before, normalized),
      taxIdChanged: before.taxId !== normalized.taxId,
    },
  });
  return normalized;
}

async function upsertDbDepartment(
  session: SessionLike,
  normalized: Required<Pick<OrganizationDepartmentInput, "code" | "name">> & {
    id: string | null;
    parentDepartmentId: string | null;
  },
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = normalized.id
      ? await tx.department.findFirst({
          where: {
            id: normalized.id,
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
        })
      : await tx.department.findFirst({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            code: normalized.code,
          },
        });
    if (normalized.parentDepartmentId) {
      const parent = await tx.department.findFirst({
        where: {
          id: normalized.parentDepartmentId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
      });
      if (!parent) throw new Error("上層部門不存在或不屬於此公司。");
    }
    const department = before
      ? await tx.department.update({
          where: { id: before.id },
          data: {
            code: normalized.code,
            name: normalized.name,
            parentDepartmentId: normalized.parentDepartmentId,
          },
        })
      : await tx.department.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            code: normalized.code,
            name: normalized.name,
            parentDepartmentId: normalized.parentDepartmentId,
          },
        });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "department",
      entityId: department.id,
      before,
      after: department,
      metadata: {
        code: department.code,
        parentDepartmentChanged: before?.parentDepartmentId !== department.parentDepartmentId,
      },
    });
    return department;
  });
}

function upsertDemoDepartment(
  session: SessionLike,
  normalized: Required<Pick<OrganizationDepartmentInput, "code" | "name">> & {
    id: string | null;
    parentDepartmentId: string | null;
  },
) {
  const state = getOrganizationDemoState();
  const index = state.departments.findIndex((department) =>
    normalized.id ? department.id === normalized.id : department.code === normalized.code,
  );
  const before = index >= 0 ? state.departments[index] : null;
  const next = {
    id: before?.id ?? crypto.randomUUID(),
    code: normalized.code,
    name: normalized.name,
    parentDepartmentId: normalized.parentDepartmentId,
    employeeCount: before?.employeeCount ?? 0,
    managerCount: before?.managerCount ?? 0,
    childDepartmentCount: 0,
  };
  if (index >= 0) {
    state.departments[index] = next;
  } else {
    state.departments.push(next);
  }
  const childCounts = countChildDepartments(state.departments);
  state.departments = state.departments.map((department) => ({
    ...department,
    childDepartmentCount: childCounts.get(department.id) ?? 0,
  }));
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: before ? "update" : "create",
    entityType: "department",
    entityId: next.id,
    before,
    after: next,
    metadata: {
      code: next.code,
      parentDepartmentChanged: before?.parentDepartmentId !== next.parentDepartmentId,
    },
  });
  return next;
}

async function upsertDbJobLevel(
  session: SessionLike,
  normalized: Required<Pick<OrganizationJobLevelInput, "code" | "name" | "rank">> & {
    id: string | null;
    status: "active" | "inactive";
    description: string | null;
  },
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = normalized.id
      ? await tx.jobLevel.findFirst({
          where: {
            id: normalized.id,
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
        })
      : await tx.jobLevel.findFirst({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            code: normalized.code,
          },
        });
    const level = before
      ? await tx.jobLevel.update({
          where: { id: before.id },
          data: {
            code: normalized.code,
            name: normalized.name,
            rank: normalized.rank,
            status: normalized.status,
            description: normalized.description,
          },
        })
      : await tx.jobLevel.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            code: normalized.code,
            name: normalized.name,
            rank: normalized.rank,
            status: normalized.status,
            description: normalized.description,
          },
        });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "job_level",
      entityId: level.id,
      before,
      after: level,
      metadata: {
        code: level.code,
        rank: level.rank,
        status: level.status,
      },
    });
    return level;
  });
}

function upsertDemoJobLevel(
  session: SessionLike,
  normalized: Required<Pick<OrganizationJobLevelInput, "code" | "name" | "rank">> & {
    id: string | null;
    status: "active" | "inactive";
    description: string | null;
  },
) {
  const state = getOrganizationDemoState();
  const index = state.jobLevels.findIndex((level) =>
    normalized.id ? level.id === normalized.id : level.code === normalized.code,
  );
  const before = index >= 0 ? state.jobLevels[index] : null;
  const next = {
    id: before?.id ?? crypto.randomUUID(),
    code: normalized.code,
    name: normalized.name,
    rank: normalized.rank,
    status: normalized.status,
    description: normalized.description,
    positionCount: before?.positionCount ?? 0,
  } satisfies OrganizationJobLevelSettings;
  if (index >= 0) {
    state.jobLevels[index] = next;
  } else {
    state.jobLevels.push(next);
  }
  refreshDemoJobCounts(state);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: before ? "update" : "create",
    entityType: "job_level",
    entityId: next.id,
    before,
    after: next,
    metadata: {
      code: next.code,
      rank: next.rank,
      status: next.status,
    },
  });
  return next;
}

async function upsertDbJobPosition(
  session: SessionLike,
  normalized: Required<Pick<OrganizationJobPositionInput, "code" | "title" | "family">> & {
    id: string | null;
    status: "active" | "inactive";
    departmentId: string | null;
    levelId: string | null;
    description: string | null;
  },
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = normalized.id
      ? await tx.jobPosition.findFirst({
          where: {
            id: normalized.id,
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
        })
      : await tx.jobPosition.findFirst({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            code: normalized.code,
          },
        });
    if (normalized.departmentId) {
      const department = await tx.department.findFirst({
        where: {
          id: normalized.departmentId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
      });
      if (!department) throw new Error("部門不存在或不屬於此公司。");
    }
    if (normalized.levelId) {
      const level = await tx.jobLevel.findFirst({
        where: {
          id: normalized.levelId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
      });
      if (!level) throw new Error("職等不存在或不屬於此公司。");
    }
    const position = before
      ? await tx.jobPosition.update({
          where: { id: before.id },
          data: {
            code: normalized.code,
            title: normalized.title,
            family: normalized.family,
            status: normalized.status,
            departmentId: normalized.departmentId,
            levelId: normalized.levelId,
            description: normalized.description,
          },
        })
      : await tx.jobPosition.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            code: normalized.code,
            title: normalized.title,
            family: normalized.family,
            status: normalized.status,
            departmentId: normalized.departmentId,
            levelId: normalized.levelId,
            description: normalized.description,
          },
        });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "job_position",
      entityId: position.id,
      before,
      after: position,
      metadata: {
        code: position.code,
        family: position.family,
        status: position.status,
        departmentChanged: before?.departmentId !== position.departmentId,
        levelChanged: before?.levelId !== position.levelId,
      },
    });
    return position;
  });
}

function upsertDemoJobPosition(
  session: SessionLike,
  normalized: Required<Pick<OrganizationJobPositionInput, "code" | "title" | "family">> & {
    id: string | null;
    status: "active" | "inactive";
    departmentId: string | null;
    levelId: string | null;
    description: string | null;
  },
) {
  const state = getOrganizationDemoState();
  const index = state.jobPositions.findIndex((position) =>
    normalized.id ? position.id === normalized.id : position.code === normalized.code,
  );
  const before = index >= 0 ? state.jobPositions[index] : null;
  const department = normalized.departmentId
    ? state.departments.find((item) => item.id === normalized.departmentId)
    : null;
  const level = normalized.levelId
    ? state.jobLevels.find((item) => item.id === normalized.levelId)
    : null;
  const next = {
    id: before?.id ?? crypto.randomUUID(),
    code: normalized.code,
    title: normalized.title,
    family: normalized.family,
    status: normalized.status,
    description: normalized.description,
    departmentId: normalized.departmentId,
    departmentName: department?.name ?? null,
    levelId: normalized.levelId,
    levelCode: level?.code ?? null,
    levelName: level?.name ?? null,
    employeeCount: before?.employeeCount ?? 0,
  } satisfies OrganizationJobPositionSettings;
  if (index >= 0) {
    state.jobPositions[index] = next;
  } else {
    state.jobPositions.push(next);
  }
  refreshDemoJobCounts(state);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: before ? "update" : "create",
    entityType: "job_position",
    entityId: next.id,
    before,
    after: next,
    metadata: {
      code: next.code,
      family: next.family,
      status: next.status,
      departmentChanged: before?.departmentId !== next.departmentId,
      levelChanged: before?.levelId !== next.levelId,
    },
  });
  return next;
}

async function updateDbManagerLine(
  session: SessionLike,
  normalized: Required<Pick<OrganizationManagerLineInput, "employeeId">> & {
    managerId: string | null;
    changeReason: string | null;
  },
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: {
        id: normalized.employeeId,
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      select: {
        id: true,
        employeeNo: true,
        displayName: true,
        managerId: true,
      },
    });
    if (!employee) throw new Error("員工不存在或不屬於此公司。");

    if (normalized.managerId) {
      const manager = await tx.employee.findFirst({
        where: {
          id: normalized.managerId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        select: {
          id: true,
          managerId: true,
        },
      });
      if (!manager) throw new Error("主管不存在或不屬於此公司。");
      await assertNoDbManagerCycle(tx, session, normalized.employeeId, normalized.managerId);
    }

    const updated = await tx.employee.update({
      where: { id: employee.id },
      data: { managerId: normalized.managerId },
      select: {
        id: true,
        employeeNo: true,
        displayName: true,
        managerId: true,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "manager_line",
      entityId: employee.id,
      before: managerLineAuditSnapshot(employee),
      after: managerLineAuditSnapshot(updated),
      metadata: {
        operation: "update_manager_line",
        previousManagerHash: employee.managerId ? managerRefHash(employee.managerId) : null,
        nextManagerHash: normalized.managerId ? managerRefHash(normalized.managerId) : null,
        changeReasonProvided: Boolean(normalized.changeReason),
        changeReasonHash: normalized.changeReason ? managerRefHash(normalized.changeReason) : null,
        rawEmployeePersonalDataStored: false,
      },
    });
    return updated;
  });
}

function updateDemoManagerLine(
  session: SessionLike,
  normalized: Required<Pick<OrganizationManagerLineInput, "employeeId">> & {
    managerId: string | null;
    changeReason: string | null;
  },
) {
  const state = getOrganizationDemoState();
  const employee = state.employees.find((item) => item.id === normalized.employeeId);
  if (!employee) throw new Error("員工不存在或不屬於此公司。");
  if (normalized.managerId && !state.employees.some((item) => item.id === normalized.managerId)) {
    throw new Error("主管不存在或不屬於此公司。");
  }
  assertNoDemoManagerCycle(state.employees, normalized.employeeId, normalized.managerId);

  const previousManagerId = employee.managerId;
  const before = managerLineAuditSnapshot(employee);
  employee.managerId = normalized.managerId;
  refreshDemoManagerCounts(state);
  const after = managerLineAuditSnapshot(employee);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "manager_line",
    entityId: employee.id,
    before,
    after,
    metadata: {
      operation: "update_manager_line",
      previousManagerHash: previousManagerId ? managerRefHash(previousManagerId) : null,
      nextManagerHash: normalized.managerId ? managerRefHash(normalized.managerId) : null,
      changeReasonProvided: Boolean(normalized.changeReason),
      changeReasonHash: normalized.changeReason ? managerRefHash(normalized.changeReason) : null,
      rawEmployeePersonalDataStored: false,
    },
  });
  return employee;
}

function buildOrganizationSettingsView(state: OrganizationDemoState): OrganizationSettingsView {
  const jobLevels = buildJobLevelsWithCounts(state);
  const jobPositions = buildJobPositionsWithCounts(state);
  const jobTitles = summarizeJobTitles(state.employees);
  const managerLineRisks = buildManagerLineRisks(state);
  const readiness = buildReadiness({ ...state, jobLevels, jobPositions }, jobTitles);
  const commandCenter = buildOrganizationCommandCenter({ ...state, jobLevels, jobPositions }, jobTitles, readiness, managerLineRisks);
  return {
    company: state.company,
    departments: [...state.departments].sort((a, b) => a.code.localeCompare(b.code)),
    jobLevels,
    jobPositions,
    jobTitles,
    employees: [...state.employees]
      .map((employee) => ({
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
        jobTitle: employee.jobTitle,
        departmentName: employee.departmentName,
        managerId: employee.managerId,
        directReportCount: employee.directReportCount,
      }))
      .sort((a, b) => a.employeeNo.localeCompare(b.employeeNo)),
    managerLines: state.employees
      .filter((employee) => employee.directReportCount > 0)
      .map((employee) => ({
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
        jobTitle: employee.jobTitle,
        departmentName: employee.departmentName,
        directReportCount: employee.directReportCount,
      })),
    managerLineRisks,
    readiness,
    commandCards: commandCenter.commandCards,
    actionQueue: commandCenter.actionQueue,
    auditScope: [
      "公司資料變更",
      "部門建立與更新",
      "上層部門調整",
      "職務/職等建立與更新",
      "主管線調整",
    ],
  };
}

function buildOrganizationCommandCenter(
  state: Pick<OrganizationDemoState, "company" | "departments" | "employees"> & {
    jobLevels: OrganizationJobLevelSettings[];
    jobPositions: OrganizationJobPositionSettings[];
  },
  jobTitles: OrganizationJobTitleSummary[],
  readiness: OrganizationReadiness,
  managerLineRisks: OrganizationManagerLineRisk[],
) {
  const gaps = buildOrganizationGapSummary(state, jobTitles, managerLineRisks);
  const commandCards: OrganizationCommandCard[] = [
    {
      id: "company_profile",
      label: "公司資料",
      title: readiness.status === "blocked" ? "公司基礎需補齊" : "公司資料可用",
      value: readiness.status === "blocked" ? `${readiness.blockers.length} 阻擋` : state.company.taxId ? "已設定" : "待補",
      detail: readiness.blockers[0] ?? "公司名稱、登記名稱、統編、時區與幣別已可支撐後續 payroll/audit 文件。",
      tone: readiness.status === "blocked" ? "danger" : "ready",
      href: "#company-profile",
      actionLabel: readiness.status === "blocked" ? "補公司資料" : "檢查公司資料",
    },
    {
      id: "manager_lines",
      label: "主管線",
      title: gaps.managerCycleDetected ? "主管線循環需立即修正" : gaps.managerLineGapCount ? "主管線需整理" : "主管線可用",
      value: gaps.managerLineGapCount ? `${gaps.managerLineGapCount} 缺口` : `${state.employees.filter((employee) => employee.directReportCount > 0).length} 主管`,
      detail: gaps.managerCycleDetected
        ? "偵測到主管線循環，統一 Inbox 與簽核流程可能卡住。"
        : gaps.managerLineGapCount
          ? `${gaps.missingManagerEmployees} 位員工缺直屬主管，${gaps.departmentsWithoutManagers} 個部門缺可推得主管。`
          : "簽核、排班、權限與主管 Inbox 可共用同一條主管線。",
      tone: gaps.managerCycleDetected ? "danger" : gaps.managerLineGapCount ? "warning" : "ready",
      href: "#manager-line-governance",
      actionLabel: "整理主管線",
    },
    {
      id: "job_architecture",
      label: "職務職等",
      title: gaps.jobArchitectureGapCount ? "標準職務需收斂" : "標準職務可用",
      value: gaps.jobArchitectureGapCount ? `${gaps.jobArchitectureGapCount} 缺口` : `${state.jobPositions.length} 職務`,
      detail: gaps.jobArchitectureGapCount
        ? `${gaps.employeesWithoutJobPosition} 位員工未連到標準職務；薪資、權限與報表仍需對齊。`
        : "職務、職等與員工主檔已能作為人事異動、薪資與報表共用語言。",
      tone: gaps.jobArchitectureGapCount ? "warning" : "ready",
      href: "#job-architecture",
      actionLabel: "整理職務職等",
    },
    {
      id: "launch_foundation",
      label: "上線基礎",
      title: readiness.status === "ready" ? "可進入上線 Gate" : "先清組織缺口",
      value: readiness.status === "ready" ? "Ready" : readiness.status === "blocked" ? "Blocked" : "待整理",
      detail: readiness.status === "ready"
        ? "公司管理基礎可交給上線 readiness 與 pilot go/no-go 接續檢查。"
        : "正式試用前先清公司資料、部門、主管線與職務架構，避免真實員工邀請後返工。",
      tone: readiness.status === "ready" ? "ready" : readiness.status === "blocked" ? "danger" : "warning",
      href: "/settings/readiness",
      actionLabel: "檢查上線 Gate",
    },
  ];

  return {
    commandCards,
    actionQueue: buildOrganizationActionQueue(gaps, readiness),
  };
}

function buildOrganizationGapSummary(
  state: Pick<OrganizationDemoState, "company" | "departments" | "employees"> & {
    jobLevels: OrganizationJobLevelSettings[];
    jobPositions: OrganizationJobPositionSettings[];
  },
  jobTitles: OrganizationJobTitleSummary[],
  managerLineRisks: OrganizationManagerLineRisk[],
) {
  const missingManagerEmployees = state.employees.filter((employee) => !employee.managerId && employee.directReportCount === 0).length;
  const departmentsWithoutManagers = state.departments.filter((department) => department.managerCount === 0).length;
  const employeesWithoutJobPosition = state.employees.filter((employee) => !employee.jobPositionId).length;
  const unmanagedJobTitleCount = Math.max(0, jobTitles.length - state.jobPositions.length);
  const managerCycleDetected = managerLineRisks.some((risk) => risk.id === "manager-cycle" && risk.severity === "danger");
  const companyProfileBlocked = !state.company.name || !state.company.legalName || !state.company.taxId || state.departments.length === 0;
  const managerLineGapCount = missingManagerEmployees + departmentsWithoutManagers + (managerCycleDetected ? 1 : 0);
  const jobArchitectureGapCount =
    employeesWithoutJobPosition +
    unmanagedJobTitleCount +
    (state.jobLevels.length === 0 ? 1 : 0) +
    (state.jobPositions.length === 0 ? 1 : 0);
  return {
    companyProfileBlocked,
    missingManagerEmployees,
    departmentsWithoutManagers,
    managerCycleDetected,
    managerLineGapCount,
    employeesWithoutJobPosition,
    unmanagedJobTitleCount,
    jobArchitectureGapCount,
  };
}

function buildOrganizationActionQueue(
  gaps: ReturnType<typeof buildOrganizationGapSummary>,
  readiness: OrganizationReadiness,
): OrganizationActionQueueItem[] {
  const tasks: OrganizationActionQueueItem[] = [];
  if (gaps.companyProfileBlocked) {
    tasks.push({
      id: "company_profile",
      stepLabel: "01 先補",
      title: "補齊公司資料與第一層部門",
      detail: readiness.blockers[0] ?? "公司名稱、登記名稱、統編與至少一個部門是 tenant 上線基礎。",
      tone: "danger",
      href: "#company-profile",
      actionLabel: "補公司資料",
    });
  }
  if (gaps.managerLineGapCount > 0) {
    tasks.push({
      id: "manager_lines",
      stepLabel: tasks.length ? "02 接著" : "01 先處理",
      title: gaps.managerCycleDetected ? "修掉主管線循環" : "清掉主管線缺口",
      detail: gaps.managerCycleDetected
        ? "主管線循環會讓簽核 Inbox 與 ABAC 判斷不可靠，必須先修。"
        : `${gaps.missingManagerEmployees} 位員工缺直屬主管，${gaps.departmentsWithoutManagers} 個部門缺主管覆蓋。`,
      tone: gaps.managerCycleDetected ? "danger" : "warning",
      href: "#manager-line-governance",
      actionLabel: "開啟主管線精靈",
    });
  }
  if (gaps.jobArchitectureGapCount > 0) {
    tasks.push({
      id: "job_architecture",
      stepLabel: tasks.length ? `0${tasks.length + 1} 再來` : "01 先處理",
      title: "把職稱收斂成標準職務/職等",
      detail: `${gaps.employeesWithoutJobPosition} 位員工未連到標準職務，後續薪資、權限、報表與人事異動會需要這個基礎。`,
      tone: "warning",
      href: "#job-architecture",
      actionLabel: "整理職務職等",
    });
  }
  tasks.push({
    id: "launch_readiness",
    stepLabel: tasks.length ? `0${tasks.length + 1} 最後` : "01 檢查",
    title: readiness.status === "ready" ? "送進上線 readiness" : "清完缺口後重跑上線 Gate",
    detail: readiness.status === "ready"
      ? "組織、主管線與職務基礎已可支撐試用導入，下一步看 production readiness。"
      : "公司管理頁清完後，再回上線戰情室檢查正式資料庫、SSO、薪資安全與法遵 Gate。",
    tone: readiness.status === "ready" ? "ready" : "warning",
    href: "/settings/readiness",
    actionLabel: "檢查上線 Gate",
  });
  return tasks.slice(0, 4);
}

function buildReadiness(
  state: Pick<OrganizationDemoState, "company" | "departments" | "employees"> & {
    jobLevels: OrganizationJobLevelSettings[];
    jobPositions: OrganizationJobPositionSettings[];
  },
  jobTitles: OrganizationJobTitleSummary[],
): OrganizationReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];
  const unassignedEmployees = state.employees.filter((employee) => !employee.departmentId).length;
  const missingManagerEmployees = state.employees.filter((employee) => !employee.managerId && employee.directReportCount === 0).length;
  const departmentsWithoutManagers = state.departments.filter((department) => department.managerCount === 0).length;
  const employeesWithoutJobPosition = state.employees.filter((employee) => !employee.jobPositionId).length;

  if (!state.company.name || !state.company.legalName) {
    blockers.push("公司名稱與登記名稱必填。");
  }
  if (!state.company.taxId) {
    blockers.push("統一編號或稅籍識別仍未設定。");
  }
  if (state.departments.length === 0) {
    blockers.push("至少需要一個部門才能建立員工與簽核線。");
  }
  if (unassignedEmployees > 0) {
    warnings.push(`${unassignedEmployees} 位員工尚未歸屬部門。`);
  }
  if (departmentsWithoutManagers > 0) {
    warnings.push(`${departmentsWithoutManagers} 個部門尚未能從主管線推得管理者。`);
  }
  if (missingManagerEmployees > 0) {
    warnings.push(`${missingManagerEmployees} 位非主管員工尚未設定直屬主管。`);
  }
  if (state.jobLevels.length === 0) {
    warnings.push("尚未建立標準職等。");
  }
  if (state.jobPositions.length === 0) {
    warnings.push("尚未建立標準職務。");
  }
  if (jobTitles.length > state.jobPositions.length) {
    warnings.push("仍有職務名稱尚未納入標準職務。");
  }
  if (employeesWithoutJobPosition > 0) {
    warnings.push(`${employeesWithoutJobPosition} 位員工尚未連到標準職務。`);
  }

  if (blockers.length > 0) {
    nextActions.push("先補齊公司資料與至少一個部門。");
  }
  if (warnings.length > 0) {
    nextActions.push("接著清理未歸屬部門、缺主管與標準職務未連結員工。");
  }
  nextActions.push("下一階段將員工異動、薪資與權限引用標準職務/職等。");

  return {
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    blockers,
    warnings,
    nextActions,
  };
}

function buildManagerLineRisks(state: Pick<OrganizationDemoState, "departments" | "employees">): OrganizationManagerLineRisk[] {
  const risks: OrganizationManagerLineRisk[] = [];
  const nonManagerMissingManager = state.employees.filter(
    (employee) => !employee.managerId && employee.directReportCount === 0,
  );
  const overloadedManagers = state.employees.filter((employee) => employee.directReportCount >= 12);
  const departmentsWithoutManagers = state.departments.filter((department) => department.managerCount === 0);
  const cycleDetected = detectDemoManagerCycle(state.employees);

  risks.push({
    id: "missing-manager",
    severity: nonManagerMissingManager.length > 0 ? "warning" : "ready",
    title: "缺直屬主管",
    detail: nonManagerMissingManager.length > 0
      ? `${nonManagerMissingManager.length} 位非主管員工尚未設定直屬主管。`
      : "非主管員工都有主管線。",
    action: "用主管線修正精靈補齊直屬主管。",
  });
  risks.push({
    id: "manager-overload",
    severity: overloadedManagers.length > 0 ? "warning" : "ready",
    title: "主管負載",
    detail: overloadedManagers.length > 0
      ? `${overloadedManagers.length} 位主管直屬人數達 12 人以上，簽核與排班風險較高。`
      : "主管直屬人數未超過風險門檻。",
    action: "必要時拆分團隊或新增部門主管。",
  });
  risks.push({
    id: "department-manager",
    severity: departmentsWithoutManagers.length > 0 ? "warning" : "ready",
    title: "部門主管覆蓋",
    detail: departmentsWithoutManagers.length > 0
      ? `${departmentsWithoutManagers.length} 個部門還沒有能從主管線推得管理者。`
      : "每個部門都可由主管線推得管理者。",
    action: "先補主管線，再跑邀請 readiness。",
  });
  risks.push({
    id: "manager-cycle",
    severity: cycleDetected ? "danger" : "ready",
    title: "循環風險",
    detail: cycleDetected ? "偵測到主管線循環，簽核 Inbox 會無法正確收斂。" : "未偵測到主管線循環。",
    action: "循環必須立即修正，避免簽核卡住。",
  });

  return risks;
}

function normalizeManagerLineInput(
  input: OrganizationManagerLineInput,
  employees: OrganizationEmployeeOption[],
) {
  const employeeId = cleanRequiredText(input.employeeId, "員工必填。");
  const managerId = cleanText(input.managerId) || null;
  const changeReason = cleanOptionalText(input.changeReason);
  if (!employees.some((employee) => employee.id === employeeId)) {
    throw new Error("員工不存在。");
  }
  if (managerId && !employees.some((employee) => employee.id === managerId)) {
    throw new Error("主管不存在。");
  }
  if (managerId === employeeId) {
    throw new Error("主管不可設定為員工本人。");
  }
  assertNoDemoManagerCycle(employees, employeeId, managerId);
  return { employeeId, managerId, changeReason };
}

function normalizeCompanyInput(
  input: OrganizationCompanyInput,
  before: OrganizationCompanySettings,
): OrganizationCompanySettings {
  const normalized = {
    id: before.id,
    name: cleanRequiredText(input.name ?? before.name, "公司名稱必填。"),
    legalName: cleanRequiredText(input.legalName ?? before.legalName, "登記名稱必填。"),
    taxId: cleanRequiredText(input.taxId ?? before.taxId, "統一編號或稅籍識別必填。"),
    timezone: normalizeTimezone(input.timezone ?? before.timezone),
    currency: normalizeCurrency(input.currency ?? before.currency),
  };
  return normalized;
}

function normalizeDepartmentInput(
  input: OrganizationDepartmentInput,
  departments: OrganizationDepartmentSettings[],
) {
  const id = cleanText(input.id) || null;
  const code = cleanRequiredText(input.code, "部門代碼必填。").toUpperCase();
  const name = cleanRequiredText(input.name, "部門名稱必填。");
  const parentDepartmentId = cleanText(input.parentDepartmentId) || null;
  if (!/^[A-Z0-9_-]{2,24}$/.test(code)) {
    throw new Error("部門代碼需為 2-24 個英數字、底線或連字號。");
  }
  if (id && parentDepartmentId === id) {
    throw new Error("上層部門不可選擇自己。");
  }
  const duplicate = departments.find((department) => department.code === code && department.id !== id);
  if (duplicate) {
    throw new Error("部門代碼已存在。");
  }
  if (parentDepartmentId && !departments.some((department) => department.id === parentDepartmentId)) {
    throw new Error("上層部門不存在。");
  }
  return { id, code, name, parentDepartmentId };
}

function normalizeJobLevelInput(
  input: OrganizationJobLevelInput,
  levels: OrganizationJobLevelSettings[],
) {
  const id = cleanText(input.id) || null;
  const code = cleanRequiredText(input.code, "職等代碼必填。").toUpperCase();
  const name = cleanRequiredText(input.name, "職等名稱必填。");
  const rank = normalizeInteger(input.rank, "職等排序必須是數字。", 0, 999);
  const status = normalizeStatus(input.status);
  const description = cleanOptionalText(input.description);
  if (!/^[A-Z0-9_-]{1,24}$/.test(code)) {
    throw new Error("職等代碼需為 1-24 個英數字、底線或連字號。");
  }
  const duplicate = levels.find((level) => level.code === code && level.id !== id);
  if (duplicate) {
    throw new Error("職等代碼已存在。");
  }
  return { id, code, name, rank, status, description };
}

function normalizeJobPositionInput(
  input: OrganizationJobPositionInput,
  current: OrganizationSettingsView,
) {
  const id = cleanText(input.id) || null;
  const code = cleanRequiredText(input.code, "職務代碼必填。").toUpperCase();
  const title = cleanRequiredText(input.title, "職務名稱必填。");
  const family = cleanRequiredText(input.family ?? "general", "職務族群必填。");
  const status = normalizeStatus(input.status);
  const departmentId = cleanText(input.departmentId) || null;
  const levelId = cleanText(input.levelId) || null;
  const description = cleanOptionalText(input.description);
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw new Error("職務代碼需為 2-32 個英數字、底線或連字號。");
  }
  const duplicate = current.jobPositions.find((position) => position.code === code && position.id !== id);
  if (duplicate) {
    throw new Error("職務代碼已存在。");
  }
  if (departmentId && !current.departments.some((department) => department.id === departmentId)) {
    throw new Error("部門不存在。");
  }
  if (levelId && !current.jobLevels.some((level) => level.id === levelId)) {
    throw new Error("職等不存在。");
  }
  return { id, code, title, family, status, departmentId, levelId, description };
}

function buildJobLevelsWithCounts(state: Pick<OrganizationDemoState, "jobLevels" | "jobPositions">) {
  const positionCountByLevel = new Map<string, number>();
  for (const position of state.jobPositions) {
    if (!position.levelId) continue;
    positionCountByLevel.set(position.levelId, (positionCountByLevel.get(position.levelId) ?? 0) + 1);
  }
  return [...state.jobLevels]
    .map((level) => ({
      ...level,
      positionCount: positionCountByLevel.get(level.id) ?? 0,
    }))
    .sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));
}

function buildJobPositionsWithCounts(
  state: Pick<OrganizationDemoState, "jobLevels" | "jobPositions" | "departments" | "employees">,
) {
  const employeeCountByPosition = new Map<string, number>();
  for (const employee of state.employees) {
    if (!employee.jobPositionId) continue;
    employeeCountByPosition.set(employee.jobPositionId, (employeeCountByPosition.get(employee.jobPositionId) ?? 0) + 1);
  }
  return [...state.jobPositions]
    .map((position) => {
      const department = position.departmentId
        ? state.departments.find((item) => item.id === position.departmentId)
        : null;
      const level = position.levelId ? state.jobLevels.find((item) => item.id === position.levelId) : null;
      return {
        ...position,
        departmentName: department?.name ?? null,
        levelCode: level?.code ?? null,
        levelName: level?.name ?? null,
        employeeCount: employeeCountByPosition.get(position.id) ?? 0,
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code));
}

function refreshDemoJobCounts(state: OrganizationDemoState) {
  state.jobPositions = buildJobPositionsWithCounts(state);
  state.jobLevels = buildJobLevelsWithCounts(state);
}

function summarizeJobTitles(employees: OrganizationEmployeeRecord[]) {
  const titleMap = new Map<string, { employeeIds: Set<string>; departmentIds: Set<string> }>();
  for (const employee of employees) {
    const title = employee.jobTitle.trim() || "未設定職務";
    const bucket = titleMap.get(title) ?? { employeeIds: new Set<string>(), departmentIds: new Set<string>() };
    bucket.employeeIds.add(employee.id);
    if (employee.departmentId) bucket.departmentIds.add(employee.departmentId);
    titleMap.set(title, bucket);
  }
  return [...titleMap.entries()]
    .map(([title, bucket]) => ({
      title,
      employeeCount: bucket.employeeIds.size,
      departmentCount: bucket.departmentIds.size,
    }))
    .sort((a, b) => b.employeeCount - a.employeeCount || a.title.localeCompare(b.title));
}

function countEmployeesByDepartment(employees: OrganizationEmployeeRecord[]) {
  const counts = new Map<string, number>();
  for (const employee of employees) {
    if (!employee.departmentId) continue;
    counts.set(employee.departmentId, (counts.get(employee.departmentId) ?? 0) + 1);
  }
  return counts;
}

function countManagersByDepartment(employees: OrganizationEmployeeRecord[]) {
  const counts = new Map<string, number>();
  for (const employee of employees) {
    if (!employee.departmentId || employee.directReportCount === 0) continue;
    counts.set(employee.departmentId, (counts.get(employee.departmentId) ?? 0) + 1);
  }
  return counts;
}

function countChildDepartments(departments: Array<{ id: string; parentDepartmentId: string | null }>) {
  const counts = new Map<string, number>();
  for (const department of departments) {
    if (!department.parentDepartmentId) continue;
    counts.set(department.parentDepartmentId, (counts.get(department.parentDepartmentId) ?? 0) + 1);
  }
  return counts;
}

async function assertNoDbManagerCycle(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  employeeId: string,
  managerId: string | null,
) {
  if (!managerId) return;
  if (employeeId === managerId) throw new Error("主管不可設定為員工本人。");
  let cursor: string | null = managerId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === employeeId) throw new Error("主管線不可形成循環。");
    if (visited.has(cursor)) throw new Error("主管線不可形成循環。");
    visited.add(cursor);
    const manager: { managerId: string | null } | null = await tx.employee.findFirst({
      where: {
        id: cursor,
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      select: {
        managerId: true,
      },
    });
    cursor = manager?.managerId ?? null;
  }
}

function assertNoDemoManagerCycle(
  employees: Array<{ id: string; managerId: string | null }>,
  employeeId: string,
  managerId: string | null,
) {
  if (!managerId) return;
  if (employeeId === managerId) throw new Error("主管不可設定為員工本人。");
  let cursor: string | null = managerId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === employeeId) throw new Error("主管線不可形成循環。");
    if (visited.has(cursor)) throw new Error("主管線不可形成循環。");
    visited.add(cursor);
    cursor = employees.find((employee) => employee.id === cursor)?.managerId ?? null;
  }
}

function detectDemoManagerCycle(employees: Array<{ id: string; managerId: string | null }>) {
  for (const employee of employees) {
    try {
      assertNoDemoManagerCycle(employees, employee.id, employee.managerId);
    } catch {
      return true;
    }
  }
  return false;
}

function refreshDemoManagerCounts(state: OrganizationDemoState) {
  const directReportCounts = new Map<string, number>();
  for (const employee of state.employees) {
    if (!employee.managerId) continue;
    directReportCounts.set(employee.managerId, (directReportCounts.get(employee.managerId) ?? 0) + 1);
  }
  state.employees = state.employees.map((employee) => ({
    ...employee,
    directReportCount: directReportCounts.get(employee.id) ?? 0,
  }));
  const managerCountByDepartment = countManagersByDepartment(state.employees);
  const employeeCountByDepartment = countEmployeesByDepartment(state.employees);
  state.departments = state.departments.map((department) => ({
    ...department,
    employeeCount: employeeCountByDepartment.get(department.id) ?? 0,
    managerCount: managerCountByDepartment.get(department.id) ?? 0,
  }));
}

function managerLineAuditSnapshot(employee: {
  id: string;
  employeeNo?: string;
  displayName?: string;
  managerId: string | null;
}) {
  return {
    employeeId: employee.id,
    employeeNoHash: employee.employeeNo ? stableHash({ employeeNo: employee.employeeNo }) : null,
    displayNameHash: employee.displayName ? stableHash({ displayName: employee.displayName }) : null,
    managerHash: employee.managerId ? managerRefHash(employee.managerId) : null,
  };
}

function managerRefHash(value: string) {
  return String(stableHash({ value })).slice(0, 16);
}

function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return Object.keys(after).filter((key) => before[key] !== after[key]);
}

function cleanRequiredText(value: unknown, message: string) {
  const text = cleanText(value);
  if (!text) throw new Error(message);
  return text.slice(0, 120);
}

function cleanOptionalText(value: unknown) {
  const text = cleanText(value);
  return text ? text.slice(0, 500) : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInteger(value: unknown, message: string, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(cleanText(value));
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(message);
  }
  return number;
}

function normalizeStatus(value: unknown): "active" | "inactive" {
  return cleanText(value) === "inactive" ? "inactive" : "active";
}

function normalizeTimezone(value: unknown) {
  const timezone = cleanText(value) || "Asia/Taipei";
  return /^[A-Za-z_]+\/[A-Za-z_]+$/.test(timezone) ? timezone : "Asia/Taipei";
}

function normalizeCurrency(value: unknown) {
  const currency = (cleanText(value) || "TWD").toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TWD";
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}

function demoJobLevels(): OrganizationJobLevelSettings[] {
  return [
    {
      id: "demo-level-l1",
      code: "L1",
      name: "專員 / Associate",
      rank: 1,
      status: "active",
      description: "可獨立完成日常任務的初階到中階職務。",
      positionCount: 0,
    },
    {
      id: "demo-level-l2",
      code: "L2",
      name: "資深專員 / Specialist",
      rank: 2,
      status: "active",
      description: "可負責跨部門任務或核心模組的資深職務。",
      positionCount: 0,
    },
    {
      id: "demo-level-m1",
      code: "M1",
      name: "主管 / Manager",
      rank: 10,
      status: "active",
      description: "具備直屬團隊管理與簽核責任的主管職等。",
      positionCount: 0,
    },
  ];
}

function demoJobPositions(employees: OrganizationEmployeeRecord[]): OrganizationJobPositionSettings[] {
  const titleMap = new Map<string, OrganizationEmployeeRecord>();
  for (const employee of employees) {
    if (!titleMap.has(employee.jobTitle)) {
      titleMap.set(employee.jobTitle, employee);
    }
  }
  return [...titleMap.entries()].map(([title, employee]) => {
    const levelId = demoLevelIdForTitle(title);
    return {
      id: demoJobPositionId(title),
      code: demoJobPositionCode(title),
      title,
      family: demoJobFamily(title),
      status: "active",
      description: `${title} 示範職務，正式導入前請由 HR 檢查職責與職等。`,
      departmentId: employee.departmentId,
      departmentName: employee.departmentName,
      levelId,
      levelCode: levelId === "demo-level-m1" ? "M1" : levelId === "demo-level-l2" ? "L2" : "L1",
      levelName: levelId === "demo-level-m1"
        ? "主管 / Manager"
        : levelId === "demo-level-l2"
          ? "資深專員 / Specialist"
          : "專員 / Associate",
      employeeCount: 0,
    };
  });
}

function demoJobPositionId(title: string) {
  return `demo-position-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function demoJobPositionCode(title: string) {
  const abbreviation = title
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return abbreviation || "JOB";
}

function demoJobFamily(title: string) {
  if (/engineer|engineering|qa/i.test(title)) return "Engineering";
  if (/hr|people/i.test(title)) return "People";
  if (/designer|product|service/i.test(title)) return "Product";
  if (/finance/i.test(title)) return "Finance";
  if (/care/i.test(title)) return "Care";
  return "Operations";
}

function demoLevelIdForTitle(title: string) {
  if (/manager/i.test(title)) return "demo-level-m1";
  if (/admin|engineer|designer/i.test(title)) return "demo-level-l2";
  return "demo-level-l1";
}
