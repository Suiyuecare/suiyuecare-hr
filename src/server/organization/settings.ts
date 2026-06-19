import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
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

export type OrganizationManagerLine = {
  employeeId: string;
  employeeNo: string;
  displayName: string;
  jobTitle: string;
  departmentName: string | null;
  directReportCount: number;
};

export type OrganizationReadiness = {
  status: "ready" | "warning" | "blocked";
  blockers: string[];
  warnings: string[];
  nextActions: string[];
};

export type OrganizationSettingsView = {
  company: OrganizationCompanySettings;
  departments: OrganizationDepartmentSettings[];
  jobTitles: OrganizationJobTitleSummary[];
  managerLines: OrganizationManagerLine[];
  readiness: OrganizationReadiness;
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

type OrganizationDemoState = {
  company: OrganizationCompanySettings;
  departments: Array<OrganizationDepartmentSettings & { parentDepartmentId: string | null }>;
  employees: OrganizationEmployeeRecord[];
};

type OrganizationEmployeeRecord = {
  id: string;
  employeeNo: string;
  displayName: string;
  jobTitle: string;
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
      employees: {
        select: {
          id: true,
          employeeNo: true,
          displayName: true,
          jobTitle: true,
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

function buildOrganizationSettingsView(state: OrganizationDemoState): OrganizationSettingsView {
  const jobTitles = summarizeJobTitles(state.employees);
  const readiness = buildReadiness(state, jobTitles);
  return {
    company: state.company,
    departments: [...state.departments].sort((a, b) => a.code.localeCompare(b.code)),
    jobTitles,
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
    readiness,
    auditScope: [
      "公司資料變更",
      "部門建立與更新",
      "上層部門調整",
      "未來職務表與主管線調整",
    ],
  };
}

function buildReadiness(
  state: Pick<OrganizationDemoState, "company" | "departments" | "employees">,
  jobTitles: OrganizationJobTitleSummary[],
): OrganizationReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];
  const unassignedEmployees = state.employees.filter((employee) => !employee.departmentId).length;
  const missingManagerEmployees = state.employees.filter((employee) => !employee.managerId && employee.directReportCount === 0).length;
  const departmentsWithoutManagers = state.departments.filter((department) => department.managerCount === 0).length;

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
  if (jobTitles.length > 12) {
    warnings.push("職務名稱較分散，建議建立職務表與標準職稱。");
  }

  if (blockers.length > 0) {
    nextActions.push("先補齊公司資料與至少一個部門。");
  }
  if (warnings.length > 0) {
    nextActions.push("接著清理未歸屬部門、缺主管與職務名稱標準化。");
  }
  nextActions.push("下一階段建立獨立職務/職等資料表，讓薪資、權限與簽核能引用標準職務。");

  return {
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    blockers,
    warnings,
    nextActions,
  };
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

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
