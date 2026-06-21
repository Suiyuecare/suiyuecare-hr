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

export type EmployeeMasterRow = {
  id: string;
  employeeNo: string;
  displayName: string;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  jobTitle: string;
  jobPositionId: string | null;
  jobPositionTitle: string | null;
  jobLevelCode: string | null;
  managerId: string | null;
  managerName: string | null;
  directReportCount: number;
  employmentStatus: "active" | "on_leave" | "terminated";
  hireDate: Date;
  userLinked: boolean;
  userStatus: string | null;
  roleLabels: string[];
  externalIdentityLinked: boolean;
  laborRosterStatus: "complete" | "needs_review" | "incomplete" | "missing";
  employmentTermsStatus: "acknowledged" | "published" | "draft" | "missing";
  payrollSetupStatus: "ready" | "partial" | "missing";
  statutoryInsuranceStatus: "ready" | "partial" | "missing";
  profileGapLabels: string[];
};

export type EmployeeMasterJobPosition = {
  id: string;
  code: string;
  title: string;
  family: string;
  departmentId: string | null;
  departmentName: string | null;
  levelCode: string | null;
};

export type EmployeeMasterJobArchitectureTone = "ready" | "warning" | "danger";

export type EmployeeMasterJobArchitectureCard = {
  id: string;
  label: string;
  title: string;
  value: string;
  detail: string;
  tone: EmployeeMasterJobArchitectureTone;
  href: string;
};

export type EmployeeMasterJobArchitectureAction = {
  id: string;
  stepLabel: string;
  title: string;
  detail: string;
  tone: EmployeeMasterJobArchitectureTone;
  href: string;
  actionLabel: string;
};

export type EmployeeMasterJobArchitectureReadiness = {
  status: "ready" | "warning" | "blocked";
  title: string;
  detail: string;
  coverageLabel: string;
  cards: EmployeeMasterJobArchitectureCard[];
  actionQueue: EmployeeMasterJobArchitectureAction[];
};

export type EmployeeMasterWorkspace = {
  scopeLabel: string;
  companyName: string;
  departments: Array<{
    id: string;
    code: string;
    name: string;
    employeeCount: number;
  }>;
  jobPositions: EmployeeMasterJobPosition[];
  employees: EmployeeMasterRow[];
  summary: {
    visibleEmployeeCount: number;
    activeCount: number;
    managerCount: number;
    departmentCount: number;
    missingDepartmentCount: number;
    missingManagerCount: number;
    missingJobArchitectureCount: number;
    missingLoginCount: number;
    laborRosterGapCount: number;
    employmentTermsGapCount: number;
    payrollSetupGapCount: number;
    statutoryInsuranceGapCount: number;
  };
  readiness: {
    status: "ready" | "warning" | "blocked";
    title: string;
    detail: string;
    nextActions: string[];
  };
  jobArchitecture: EmployeeMasterJobArchitectureReadiness;
};

export type EmployeeMasterUpdateInput = {
  employeeId: string;
  departmentId?: string | null;
  managerId?: string | null;
  jobPositionId?: string | null;
  jobTitle: string;
  changeReason?: string | null;
};

export type EmployeeMasterCreateInput = {
  employeeNo: string;
  displayName: string;
  hireDate: Date;
  departmentId?: string | null;
  managerId?: string | null;
  jobPositionId?: string | null;
  jobTitle: string;
  onboardingNote?: string | null;
};

type EmployeeMasterDemoOverride = {
  departmentId?: string | null;
  managerId?: string | null;
  jobPositionId?: string | null;
  jobTitle?: string;
};

type EmployeeMasterDemoState = {
  overrides: Record<string, EmployeeMasterDemoOverride>;
  createdRecords: DemoMasterRecord[];
};

type DemoMasterRecord = {
  id: string;
  index: number;
  employeeNo: string;
  displayName: string;
  hireDate?: Date;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  jobTitle: string;
  jobPositionId: string | null;
  jobPositionTitle: string | null;
  jobLevelCode: string | null;
  managerId: string | null;
  managerName: string | null;
  directReportCount: number;
};

type SafeAuditEmployee = {
  id: string;
  employeeNo: string;
  departmentId: string | null;
  managerId: string | null;
  jobPositionId: string | null;
  jobTitle: string;
};

const globalForEmployeeMaster = globalThis as unknown as {
  hrOneEmployeeMasterDemoState?: EmployeeMasterDemoState;
};

export async function getEmployeeMasterWorkspace(
  session: SessionLike,
): Promise<EmployeeMasterWorkspace> {
  assertPermission(session.role, "employee:read");
  if (canUseDatabase(session)) {
    return getDbEmployeeMasterWorkspace(session);
  }
  return getDemoEmployeeMasterWorkspace(session);
}

export async function updateEmployeeMasterProfile(
  session: SessionLike,
  input: EmployeeMasterUpdateInput,
) {
  assertPermission(session.role, "employee:write");
  const normalized = normalizeUpdateInput(input);
  if (canUseDatabase(session)) {
    return updateDbEmployeeMasterProfile(session, normalized);
  }
  return updateDemoEmployeeMasterProfile(session, normalized);
}

export async function createEmployeeMasterProfile(
  session: SessionLike,
  input: EmployeeMasterCreateInput,
) {
  assertPermission(session.role, "employee:write");
  const normalized = normalizeCreateInput(input);
  if (canUseDatabase(session)) {
    return createDbEmployeeMasterProfile(session, normalized);
  }
  return createDemoEmployeeMasterProfile(session, normalized);
}

export function resetEmployeeMasterDemoState() {
  globalForEmployeeMaster.hrOneEmployeeMasterDemoState = {
    overrides: {},
    createdRecords: [],
  };
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}

async function getDbEmployeeMasterWorkspace(session: SessionLike) {
  const visibilityWhere = managerVisibilityWhere(session);
  const company = await getDb().company.findFirstOrThrow({
    where: {
      id: session.companyId!,
      tenantId: session.tenantId!,
    },
    include: {
      departments: {
        include: {
          _count: {
            select: {
              employees: true,
            },
          },
        },
        orderBy: {
          code: "asc",
        },
      },
      jobPositions: {
        where: {
          status: "active",
        },
        include: {
          department: {
            select: {
              name: true,
            },
          },
          level: {
            select: {
              code: true,
            },
          },
        },
        orderBy: [{ family: "asc" }, { code: "asc" }],
      },
      employees: {
        where: visibilityWhere,
        include: {
          department: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          jobPosition: {
            include: {
              level: {
                select: {
                  code: true,
                },
              },
            },
          },
          manager: {
            select: {
              id: true,
              displayName: true,
            },
          },
          directReports: {
            select: {
              id: true,
            },
          },
          user: {
            select: {
              status: true,
              externalIdentities: {
                select: {
                  provider: true,
                },
              },
              userRoles: {
                where: {
                  companyId: session.companyId!,
                },
                select: {
                  role: {
                    select: {
                      key: true,
                    },
                  },
                },
              },
            },
          },
          laborRosterProfile: {
            select: {
              status: true,
              verificationStatus: true,
              missingFieldsJson: true,
            },
          },
          employmentTerms: {
            orderBy: {
              effectiveFrom: "desc",
            },
            take: 1,
            select: {
              status: true,
              acknowledgedAt: true,
            },
          },
          salaryProfiles: {
            orderBy: {
              effectiveFrom: "desc",
            },
            take: 1,
            select: {
              id: true,
              effectiveTo: true,
            },
          },
          payrollComplianceProfiles: {
            orderBy: {
              effectiveFrom: "desc",
            },
            take: 1,
            select: {
              id: true,
              effectiveTo: true,
            },
          },
          paymentProfiles: {
            orderBy: {
              effectiveFrom: "desc",
            },
            take: 1,
            select: {
              id: true,
              status: true,
              effectiveTo: true,
            },
          },
          statutoryInsuranceRecords: {
            select: {
              insuranceType: true,
              status: true,
            },
          },
        },
        orderBy: {
          employeeNo: "asc",
        },
      },
    },
  });

  const rows = company.employees.map((employee) => {
    const payrollStatus = payrollSetupStatus({
      salaryConfigured: hasActiveEffectiveRecord(employee.salaryProfiles),
      complianceConfigured: hasActiveEffectiveRecord(employee.payrollComplianceProfiles),
      paymentConfigured: employee.paymentProfiles.some(
        (profile) => profile.status === "active" && !profile.effectiveTo,
      ),
    });
    const statutoryStatus = statutoryInsuranceStatus(employee.statutoryInsuranceRecords);
    const laborStatus = laborRosterStatus(employee.laborRosterProfile);
    const termsStatus = employmentTermsStatus(employee.employmentTerms[0]);
    return {
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      departmentId: employee.departmentId,
      departmentCode: employee.department?.code ?? null,
      departmentName: employee.department?.name ?? null,
      jobTitle: employee.jobTitle,
      jobPositionId: employee.jobPositionId,
      jobPositionTitle: employee.jobPosition?.title ?? null,
      jobLevelCode: employee.jobPosition?.level?.code ?? null,
      managerId: employee.managerId,
      managerName: employee.manager?.displayName ?? null,
      directReportCount: employee.directReports.length,
      employmentStatus: employee.employmentStatus,
      hireDate: employee.hireDate,
      userLinked: Boolean(employee.user),
      userStatus: employee.user?.status ?? null,
      roleLabels: employee.user?.userRoles.map((role) => roleLabel(role.role.key)) ?? [],
      externalIdentityLinked: Boolean(employee.user?.externalIdentities.length),
      laborRosterStatus: laborStatus,
      employmentTermsStatus: termsStatus,
      payrollSetupStatus: payrollStatus,
      statutoryInsuranceStatus: statutoryStatus,
      profileGapLabels: profileGapLabels({
        departmentMissing: !employee.departmentId,
        managerMissing: !employee.managerId && employee.directReports.length === 0,
        jobArchitectureMissing: !employee.jobPositionId,
        loginMissing: !employee.user,
        laborRosterStatus: laborStatus,
        employmentTermsStatus: termsStatus,
        payrollSetupStatus: payrollStatus,
        statutoryInsuranceStatus: statutoryStatus,
      }),
    } satisfies EmployeeMasterRow;
  });

  return buildWorkspace({
    companyName: company.name,
    scopeLabel: scopeLabel(session.role),
    departments: company.departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      employeeCount: department._count.employees,
    })),
    jobPositions: company.jobPositions.map((position) => ({
      id: position.id,
      code: position.code,
      title: position.title,
      family: position.family,
      departmentId: position.departmentId,
      departmentName: position.department?.name ?? null,
      levelCode: position.level?.code ?? null,
    })),
    employees: rows,
  });
}

function managerVisibilityWhere(session: SessionLike) {
  if (session.role !== "manager") return undefined;
  if (!session.employee?.id) {
    return {
      id: "__no_visible_employee__",
    };
  }
  return {
    OR: [
      {
        id: session.employee.id,
      },
      {
        managerId: session.employee.id,
      },
    ],
  };
}

function getDemoEmployeeMasterWorkspace(session: SessionLike) {
  const { departments, jobPositions, records } = getDemoMasterRecords();
  const visibleEmployees = records
    .filter((employee) => canSeeDemoEmployee(session, employee.id, employee.managerId))
    .map((employee) => {
      const laborRoster = employee.index < 20 ? "complete" : employee.index < 23 ? "needs_review" : "missing";
      const terms = employee.index < 18 ? "acknowledged" : employee.index < 22 ? "published" : "missing";
      const payroll = employee.index < 20 ? "ready" : employee.index < 24 ? "partial" : "missing";
      const statutory = employee.index < 21 ? "ready" : employee.index < 24 ? "partial" : "missing";
      const loginMissing = employee.index > 8;
      return {
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
        departmentId: employee.departmentId,
        departmentCode: employee.departmentCode,
        departmentName: employee.departmentName,
        jobTitle: employee.jobTitle,
        jobPositionId: employee.jobPositionId,
        jobPositionTitle: employee.jobPositionTitle,
        jobLevelCode: employee.jobLevelCode,
        managerId: employee.managerId,
        managerName: employee.managerName,
        directReportCount: employee.directReportCount,
        employmentStatus: "active",
        hireDate: employee.hireDate ?? new Date(Date.UTC(2025, employee.index % 12, 1)),
        userLinked: !loginMissing,
        userStatus: loginMissing ? null : "active",
        roleLabels: demoRoleLabels(employee.id),
        externalIdentityLinked: employee.index < 6,
        laborRosterStatus: laborRoster,
        employmentTermsStatus: terms,
        payrollSetupStatus: payroll,
        statutoryInsuranceStatus: statutory,
        profileGapLabels: profileGapLabels({
          departmentMissing: !employee.departmentId,
          managerMissing: !employee.managerId && employee.directReportCount === 0,
          jobArchitectureMissing: !employee.jobPositionId,
          loginMissing,
          laborRosterStatus: laborRoster,
          employmentTermsStatus: terms,
          payrollSetupStatus: payroll,
          statutoryInsuranceStatus: statutory,
        }),
      } satisfies EmployeeMasterRow;
    });

  return buildWorkspace({
    companyName: getFallbackCompanyOverview().company.name,
    scopeLabel: scopeLabel(session.role),
    departments,
    jobPositions,
    employees: visibleEmployees,
  });
}

function buildWorkspace(input: {
  companyName: string;
  scopeLabel: string;
  departments: EmployeeMasterWorkspace["departments"];
  jobPositions: EmployeeMasterWorkspace["jobPositions"];
  employees: EmployeeMasterRow[];
}): EmployeeMasterWorkspace {
  const summary = summarizeRows(input.employees, input.departments.length);
  return {
    ...input,
    summary,
    readiness: readinessFor(summary),
    jobArchitecture: jobArchitectureReadinessFor(input.employees, input.jobPositions),
  };
}

async function updateDbEmployeeMasterProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizeUpdateInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = await tx.employee.findFirstOrThrow({
      where: {
        id: input.employeeId,
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      select: {
        id: true,
        employeeNo: true,
        jobTitle: true,
        departmentId: true,
        managerId: true,
        jobPositionId: true,
      },
    });

    if (input.departmentId) {
      await tx.department.findFirstOrThrow({
        where: {
          id: input.departmentId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
      });
    }
    if (input.jobPositionId) {
      await tx.jobPosition.findFirstOrThrow({
        where: {
          id: input.jobPositionId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          status: "active",
        },
      });
    }
    if (input.managerId) {
      await tx.employee.findFirstOrThrow({
        where: {
          id: input.managerId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employmentStatus: "active",
        },
      });
      await assertNoDbManagerCycle(tx, session, input.employeeId, input.managerId);
    }

    const updated = await tx.employee.update({
      where: {
        id: input.employeeId,
      },
      data: {
        departmentId: input.departmentId,
        managerId: input.managerId,
        jobPositionId: input.jobPositionId,
        jobTitle: input.jobTitle,
      },
      select: {
        id: true,
        employeeNo: true,
        jobTitle: true,
        departmentId: true,
        managerId: true,
        jobPositionId: true,
      },
    });

    const beforePayload = safeAuditPayload(before);
    const afterPayload = safeAuditPayload(updated);
    const changed = changedFields(beforePayload, afterPayload);
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "employee_master_profile",
      entityId: updated.id,
      before: beforePayload,
      after: afterPayload,
      metadata: updateAuditMetadata(changed, input.changeReason),
    });

    return updated;
  });
}

function updateDemoEmployeeMasterProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizeUpdateInput>,
) {
  const { departments, jobPositions, records } = getDemoMasterRecords();
  const employee = records.find((record) => record.id === input.employeeId);
  if (!employee) throw new Error("Employee not found.");
  if (input.departmentId && !departments.some((department) => department.id === input.departmentId)) {
    throw new Error("Department not found.");
  }
  if (input.jobPositionId && !jobPositions.some((position) => position.id === input.jobPositionId)) {
    throw new Error("Job position not found.");
  }
  if (input.managerId) {
    if (input.managerId === input.employeeId) throw new Error("Employee cannot be their own manager.");
    if (!records.some((record) => record.id === input.managerId)) throw new Error("Manager not found.");
    assertNoDemoManagerCycle(records, input.employeeId, input.managerId);
  }

  const state = getEmployeeMasterDemoState();
  const beforePayload = safeAuditPayload(employee);
  state.overrides[input.employeeId] = {
    departmentId: input.departmentId,
    managerId: input.managerId,
    jobPositionId: input.jobPositionId,
    jobTitle: input.jobTitle,
  };

  const afterRecord = getDemoMasterRecords().records.find((record) => record.id === input.employeeId);
  if (!afterRecord) throw new Error("Employee not found after update.");
  const afterPayload = safeAuditPayload(afterRecord);
  const changed = changedFields(beforePayload, afterPayload);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "employee_master_profile",
    entityId: input.employeeId,
    before: beforePayload,
    after: afterPayload,
    metadata: updateAuditMetadata(changed, input.changeReason),
  });
  return afterRecord;
}

async function createDbEmployeeMasterProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizeCreateInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const existing = await tx.employee.findFirst({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeNo: input.employeeNo,
      },
      select: { id: true },
    });
    if (existing) throw new Error("Employee number already exists.");

    if (input.departmentId) {
      await tx.department.findFirstOrThrow({
        where: {
          id: input.departmentId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
      });
    }
    if (input.jobPositionId) {
      await tx.jobPosition.findFirstOrThrow({
        where: {
          id: input.jobPositionId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          status: "active",
        },
      });
    }
    if (input.managerId) {
      await tx.employee.findFirstOrThrow({
        where: {
          id: input.managerId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employmentStatus: "active",
        },
      });
    }

    const created = await tx.employee.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeNo: input.employeeNo,
        displayName: input.displayName,
        hireDate: input.hireDate,
        departmentId: input.departmentId,
        managerId: input.managerId,
        jobPositionId: input.jobPositionId,
        jobTitle: input.jobTitle,
        employmentStatus: "active",
      },
      select: {
        id: true,
        employeeNo: true,
        jobTitle: true,
        departmentId: true,
        managerId: true,
        jobPositionId: true,
      },
    });

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "employee_master_profile",
      entityId: created.id,
      before: null,
      after: safeAuditPayload(created),
      metadata: createAuditMetadata(input),
    });

    return created;
  });
}

function createDemoEmployeeMasterProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizeCreateInput>,
) {
  const { departments, jobPositions, records } = getDemoMasterRecords();
  if (records.some((record) => record.employeeNo === input.employeeNo)) {
    throw new Error("Employee number already exists.");
  }
  const department = input.departmentId ? departments.find((item) => item.id === input.departmentId) : null;
  if (input.departmentId && !department) throw new Error("Department not found.");
  const jobPosition = input.jobPositionId ? jobPositions.find((item) => item.id === input.jobPositionId) : null;
  if (input.jobPositionId && !jobPosition) throw new Error("Job position not found.");
  if (input.managerId && !records.some((record) => record.id === input.managerId)) {
    throw new Error("Manager not found.");
  }

  const created: DemoMasterRecord = {
    id: `demo-employee-manual-${crypto.randomUUID()}`,
    index: records.length + 1,
    employeeNo: input.employeeNo,
    displayName: input.displayName,
    hireDate: input.hireDate,
    departmentId: input.departmentId,
    departmentCode: department?.code ?? null,
    departmentName: department?.name ?? null,
    jobTitle: input.jobTitle,
    jobPositionId: input.jobPositionId,
    jobPositionTitle: jobPosition?.title ?? null,
    jobLevelCode: jobPosition?.levelCode ?? null,
    managerId: input.managerId,
    managerName: null,
    directReportCount: 0,
  };
  getEmployeeMasterDemoState().createdRecords.push(created);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "employee_master_profile",
    entityId: created.id,
    before: null,
    after: safeAuditPayload(created),
    metadata: createAuditMetadata(input),
  });
  return created;
}

function summarizeRows(
  rows: EmployeeMasterRow[],
  departmentCount: number,
): EmployeeMasterWorkspace["summary"] {
  return {
    visibleEmployeeCount: rows.length,
    activeCount: rows.filter((row) => row.employmentStatus === "active").length,
    managerCount: rows.filter((row) => row.directReportCount > 0).length,
    departmentCount,
    missingDepartmentCount: rows.filter((row) => !row.departmentId).length,
    missingManagerCount: rows.filter((row) => !row.managerId && row.directReportCount === 0).length,
    missingJobArchitectureCount: rows.filter((row) => !row.jobPositionTitle).length,
    missingLoginCount: rows.filter((row) => !row.userLinked || row.userStatus !== "active").length,
    laborRosterGapCount: rows.filter((row) => row.laborRosterStatus !== "complete").length,
    employmentTermsGapCount: rows.filter((row) => row.employmentTermsStatus !== "acknowledged").length,
    payrollSetupGapCount: rows.filter((row) => row.payrollSetupStatus !== "ready").length,
    statutoryInsuranceGapCount: rows.filter((row) => row.statutoryInsuranceStatus !== "ready").length,
  };
}

function readinessFor(summary: EmployeeMasterWorkspace["summary"]): EmployeeMasterWorkspace["readiness"] {
  const blockers = [
    summary.visibleEmployeeCount === 0 ? "尚未建立員工主檔，無法啟用假勤、排班與薪資流程。" : null,
    summary.missingLoginCount > 0 ? `${summary.missingLoginCount} 位員工尚未完成登入/SSO 連結。` : null,
    summary.laborRosterGapCount > 0 ? `${summary.laborRosterGapCount} 位員工勞工名卡仍需補齊或複核。` : null,
  ].filter(Boolean) as string[];
  const warnings = [
    summary.missingManagerCount > 0 ? `${summary.missingManagerCount} 位員工尚未確認主管線。` : null,
    summary.missingJobArchitectureCount > 0 ? `${summary.missingJobArchitectureCount} 位員工尚未對應標準職務/職等。` : null,
    summary.employmentTermsGapCount > 0 ? `${summary.employmentTermsGapCount} 位員工尚未完成工作條件發布或確認。` : null,
    summary.payrollSetupGapCount > 0 ? `${summary.payrollSetupGapCount} 位員工薪資/付款/所得稅設定尚未完整。` : null,
    summary.statutoryInsuranceGapCount > 0 ? `${summary.statutoryInsuranceGapCount} 位員工法定投保資料尚未完整。` : null,
  ].filter(Boolean) as string[];

  if (blockers.length > 0) {
    return {
      status: "blocked",
      title: "人事主檔尚未達上線 Gate",
      detail: blockers[0],
      nextActions: [
        "先完成員工匯入、登入/SSO 連結與勞工名卡複核。",
        "再補主管線、標準職務、工作條件與薪資前置資料。",
      ],
    };
  }
  if (warnings.length > 0) {
    return {
      status: "warning",
      title: "可試用，但主檔仍需整理",
      detail: warnings[0],
      nextActions: [
        "優先處理會阻擋月結或簽核的主管線與職務缺口。",
        "薪資月結前確認工作條件、投保與付款設定都已完成。",
      ],
    };
  }
  return {
    status: "ready",
    title: "人事主檔可支撐營運",
    detail: "員工、主管線、職務、登入、法定名卡與薪資前置資料已可串接日常流程。",
    nextActions: [
      "持續用人事異動流程維護調部、升遷、留停、復職與離職。",
      "定期複核權限、稽核紀錄與員工自助可見資料。",
    ],
  };
}

function jobArchitectureReadinessFor(
  rows: EmployeeMasterRow[],
  jobPositions: EmployeeMasterJobPosition[],
): EmployeeMasterJobArchitectureReadiness {
  const missingRows = rows.filter((row) => !row.jobPositionId);
  const activeRows = rows.filter((row) => row.employmentStatus === "active");
  const positionsWithoutLevel = jobPositions.filter((position) => !position.levelCode);
  const positionsWithoutDepartment = jobPositions.filter((position) => !position.departmentId);
  const standardTitleSet = new Set(jobPositions.map((position) => normalizeComparableTitle(position.title)));
  const freeTextTitles = new Set(
    rows
      .filter((row) => !row.jobPositionId && !standardTitleSet.has(normalizeComparableTitle(row.jobTitle)))
      .map((row) => row.jobTitle.trim())
      .filter(Boolean),
  );
  const coveredCount = rows.length - missingRows.length;
  const coverageLabel = rows.length ? `${coveredCount}/${rows.length}` : "0/0";
  const standardLevelCount = new Set(jobPositions.map((position) => position.levelCode).filter(Boolean)).size;
  const blocked = jobPositions.length === 0;
  const warning =
    missingRows.length > 0 ||
    positionsWithoutLevel.length > 0 ||
    positionsWithoutDepartment.length > 0 ||
    freeTextTitles.size > 0;
  const status: EmployeeMasterJobArchitectureReadiness["status"] = blocked ? "blocked" : warning ? "warning" : "ready";

  return {
    status,
    title: blocked
      ? "尚未建立標準職務"
      : warning
        ? "職務架構仍需收斂"
        : "職務架構已可支撐營運",
    detail: blocked
      ? "請先到公司組織設定建立標準職務與職等，再回到人事主檔對應員工。"
      : warning
        ? `${missingRows.length} 位員工未對應標準職務，${positionsWithoutLevel.length} 個職務缺職等，${positionsWithoutDepartment.length} 個職務缺預設部門。`
        : "員工主檔已引用標準職務與職等，能支撐薪資、權限、報表與人事異動流程。",
    coverageLabel,
    cards: [
      {
        id: "employee_coverage",
        label: "員工對應",
        title: missingRows.length ? "仍有員工未對應" : "員工已對應",
        value: coverageLabel,
        detail: missingRows.length
          ? `先處理 ${formatEmployeeSample(missingRows)}，避免報表與薪資前置使用自由文字。`
          : `${activeRows.length} 位在職員工可引用標準職務。`,
        tone: missingRows.length ? "warning" : "ready",
        href: "#employee-master-update",
      },
      {
        id: "position_catalog",
        label: "標準職務",
        title: jobPositions.length ? "職務目錄可用" : "缺標準職務",
        value: `${jobPositions.length}`,
        detail: jobPositions.length
          ? `${standardLevelCount} 個職等已被職務引用；職務目錄由公司組織設定維護。`
          : "尚未建立任何標準職務，員工只能留下自由文字職稱。",
        tone: jobPositions.length ? "ready" : "danger",
        href: "/settings/organization#job-architecture",
      },
      {
        id: "level_department_links",
        label: "職等/部門",
        title: positionsWithoutLevel.length || positionsWithoutDepartment.length ? "職務設定待補" : "職務設定完整",
        value: `${positionsWithoutLevel.length + positionsWithoutDepartment.length}`,
        detail: positionsWithoutLevel.length || positionsWithoutDepartment.length
          ? `${positionsWithoutLevel.length} 個職務缺職等，${positionsWithoutDepartment.length} 個職務缺預設部門。`
          : "職務已連到職等與預設部門，後續可被權限、薪資與報表共用。",
        tone: positionsWithoutLevel.length || positionsWithoutDepartment.length ? "warning" : "ready",
        href: "/settings/organization#job-architecture",
      },
      {
        id: "free_text_titles",
        label: "自由文字",
        title: freeTextTitles.size ? "職稱仍未收斂" : "職稱已收斂",
        value: `${freeTextTitles.size}`,
        detail: freeTextTitles.size
          ? `仍有 ${freeTextTitles.size} 種職稱找不到對應標準職務。`
          : "自由文字職稱已能對應標準職務，清單只保留顯示名稱。",
        tone: freeTextTitles.size ? "warning" : "ready",
        href: freeTextTitles.size ? "/settings/organization#job-architecture" : "#employee-master-list",
      },
    ],
    actionQueue: buildJobArchitectureActions({
      blocked,
      missingRows,
      positionsWithoutLevel,
      positionsWithoutDepartment,
      freeTextTitleCount: freeTextTitles.size,
      status,
    }),
  };
}

function buildJobArchitectureActions(input: {
  blocked: boolean;
  missingRows: EmployeeMasterRow[];
  positionsWithoutLevel: EmployeeMasterJobPosition[];
  positionsWithoutDepartment: EmployeeMasterJobPosition[];
  freeTextTitleCount: number;
  status: EmployeeMasterJobArchitectureReadiness["status"];
}) {
  const actions: EmployeeMasterJobArchitectureAction[] = [];
  if (input.blocked) {
    actions.push({
      id: "create_standard_positions",
      stepLabel: "01 先建立",
      title: "建立標準職務與職等",
      detail: "公司沒有標準職務時，人事主檔、薪資、權限與報表都只能靠自由文字職稱。",
      tone: "danger",
      href: "/settings/organization#job-architecture",
      actionLabel: "開啟組織設定",
    });
  }
  if (input.missingRows.length > 0) {
    actions.push({
      id: "map_employees_to_positions",
      stepLabel: actions.length ? "02 接著" : "01 先處理",
      title: "把員工對應到標準職務",
      detail: `${input.missingRows.length} 位員工待對應，先處理 ${formatEmployeeSample(input.missingRows)}。`,
      tone: "warning",
      href: "#employee-master-update",
      actionLabel: "開啟主檔修正",
    });
  }
  if (input.positionsWithoutLevel.length > 0 || input.positionsWithoutDepartment.length > 0) {
    actions.push({
      id: "complete_position_metadata",
      stepLabel: actions.length ? `0${actions.length + 1} 再來` : "01 先處理",
      title: "補齊職務的職等與預設部門",
      detail: `${input.positionsWithoutLevel.length} 個職務缺職等，${input.positionsWithoutDepartment.length} 個職務缺預設部門。`,
      tone: "warning",
      href: "/settings/organization#job-architecture",
      actionLabel: "補職務設定",
    });
  }
  if (input.freeTextTitleCount > 0) {
    actions.push({
      id: "standardize_free_text_titles",
      stepLabel: actions.length ? `0${actions.length + 1} 再來` : "01 先處理",
      title: "把自由文字職稱收斂到職務目錄",
      detail: `${input.freeTextTitleCount} 種職稱尚未納入標準職務，會讓報表與權限分類不穩定。`,
      tone: "warning",
      href: "/settings/organization#job-architecture",
      actionLabel: "新增標準職務",
    });
  }
  actions.push({
    id: "keep_lifecycle_aligned",
    stepLabel: actions.length ? `0${actions.length + 1} 最後` : "01 維護",
    title: input.status === "ready" ? "用人事異動維護後續變更" : "清完後改由人事異動維護",
    detail: input.status === "ready"
      ? "調部、升遷、留停、復職與離職都應回到人事異動流程，避免主檔與薪資/權限脫鉤。"
      : "職務架構收斂後，後續調部與升遷請走人事異動流程，保留 audit log。",
    tone: input.status === "ready" ? "ready" : "warning",
    href: "/hr/employee-lifecycle",
    actionLabel: "開啟人事異動",
  });
  return actions.slice(0, 4);
}

function normalizeComparableTitle(value: string) {
  return value.trim().toLowerCase();
}

function formatEmployeeSample(rows: EmployeeMasterRow[]) {
  const sample = rows.slice(0, 3).map((row) => `${row.employeeNo} ${row.displayName}`);
  const suffix = rows.length > sample.length ? ` 等 ${rows.length} 位` : "";
  return `${sample.join("、")}${suffix}`;
}

function getDemoMasterRecords() {
  const overview = getFallbackCompanyOverview();
  const state = getEmployeeMasterDemoState();
  const jobPositions = buildDemoJobPositions(overview.company.employees);
  const baseDepartments = overview.company.departments.map((department) => ({
    id: department.id,
    code: department.code,
    name: department.name,
    employeeCount: 0,
  }));
  const departmentById = new Map(baseDepartments.map((department) => [department.id, department]));
  const jobPositionById = new Map(jobPositions.map((position) => [position.id, position]));

  const baseRecords: DemoMasterRecord[] = overview.company.employees.map((employee, index) => {
    const override = state.overrides[employee.id] ?? {};
    const defaultJobPositionId = index > 18 ? null : demoJobPositionId(employee.jobTitle);
    const jobPositionId = override.jobPositionId !== undefined ? override.jobPositionId : defaultJobPositionId;
    const jobPosition = jobPositionId ? jobPositionById.get(jobPositionId) ?? null : null;
    const departmentId = override.departmentId !== undefined ? override.departmentId : employee.department?.id ?? null;
    const department = departmentId ? departmentById.get(departmentId) ?? null : null;
    return {
      id: employee.id,
      index,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      departmentId,
      departmentCode: department?.code ?? null,
      departmentName: department?.name ?? null,
      jobTitle: override.jobTitle ?? employee.jobTitle,
      jobPositionId,
      jobPositionTitle: jobPosition?.title ?? null,
      jobLevelCode: jobPosition?.levelCode ?? null,
      managerId: override.managerId !== undefined ? override.managerId : employee.managerId,
      managerName: null,
      directReportCount: 0,
    } satisfies DemoMasterRecord;
  });
  const records: DemoMasterRecord[] = [...baseRecords, ...state.createdRecords];

  const recordById = new Map(records.map((record) => [record.id, record]));
  const directReportCountByManager = new Map<string, number>();
  const employeeCountByDepartment = new Map<string, number>();
  for (const record of records) {
    if (record.managerId) {
      directReportCountByManager.set(record.managerId, (directReportCountByManager.get(record.managerId) ?? 0) + 1);
    }
    if (record.departmentId) {
      employeeCountByDepartment.set(record.departmentId, (employeeCountByDepartment.get(record.departmentId) ?? 0) + 1);
    }
  }

  return {
    departments: baseDepartments.map((department) => ({
      ...department,
      employeeCount: employeeCountByDepartment.get(department.id) ?? 0,
    })),
    jobPositions,
    records: records.map((record) => ({
      ...record,
      managerName: record.managerId ? recordById.get(record.managerId)?.displayName ?? null : null,
      directReportCount: directReportCountByManager.get(record.id) ?? 0,
    })),
  };
}

function getEmployeeMasterDemoState() {
  if (!globalForEmployeeMaster.hrOneEmployeeMasterDemoState) {
    resetEmployeeMasterDemoState();
  }
  globalForEmployeeMaster.hrOneEmployeeMasterDemoState!.createdRecords ??= [];
  return globalForEmployeeMaster.hrOneEmployeeMasterDemoState!;
}

function canSeeDemoEmployee(
  session: SessionLike,
  employeeId: string,
  managerId: string | null,
) {
  if (session.role !== "manager") return true;
  return employeeId === session.employee?.id || managerId === session.employee?.id;
}

function normalizeUpdateInput(input: EmployeeMasterUpdateInput) {
  const employeeId = cleanRequired(input.employeeId, "Employee is required.");
  const jobTitle = cleanRequired(input.jobTitle, "Job title is required.");
  if (jobTitle.length > 80) throw new Error("Job title is too long.");
  return {
    employeeId,
    departmentId: cleanOptionalId(input.departmentId),
    managerId: cleanOptionalId(input.managerId),
    jobPositionId: cleanOptionalId(input.jobPositionId),
    jobTitle,
    changeReason: cleanOptionalText(input.changeReason, 500),
  };
}

function normalizeCreateInput(input: EmployeeMasterCreateInput) {
  const employeeNo = cleanRequired(input.employeeNo, "Employee number is required.");
  if (employeeNo.length > 40) throw new Error("Employee number is too long.");
  const displayName = cleanRequired(input.displayName, "Display name is required.");
  if (displayName.length > 80) throw new Error("Display name is too long.");
  const jobTitle = cleanRequired(input.jobTitle, "Job title is required.");
  if (jobTitle.length > 80) throw new Error("Job title is too long.");
  if (!(input.hireDate instanceof Date) || Number.isNaN(input.hireDate.getTime())) {
    throw new Error("Invalid hire date.");
  }
  return {
    employeeNo,
    displayName,
    hireDate: startOfUtcDate(input.hireDate),
    departmentId: cleanOptionalId(input.departmentId),
    managerId: cleanOptionalId(input.managerId),
    jobPositionId: cleanOptionalId(input.jobPositionId),
    jobTitle,
    onboardingNote: cleanOptionalText(input.onboardingNote, 500),
  };
}

function cleanRequired(value: unknown, message: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(message);
  return text;
}

function cleanOptionalId(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function cleanOptionalText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

async function assertNoDbManagerCycle(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  employeeId: string,
  managerId: string,
) {
  if (employeeId === managerId) throw new Error("Employee cannot be their own manager.");
  let cursor: string | null = managerId;
  const seen = new Set<string>();
  for (let depth = 0; cursor && depth < 100; depth += 1) {
    if (cursor === employeeId) throw new Error("Manager line cannot create a reporting cycle.");
    if (seen.has(cursor)) throw new Error("Manager line contains a reporting cycle.");
    seen.add(cursor);
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
  records: DemoMasterRecord[],
  employeeId: string,
  managerId: string,
) {
  let cursor: string | null = managerId;
  const managerByEmployee = new Map(records.map((record) => [record.id, record.managerId]));
  const seen = new Set<string>();
  for (let depth = 0; cursor && depth < 100; depth += 1) {
    if (cursor === employeeId) throw new Error("Manager line cannot create a reporting cycle.");
    if (seen.has(cursor)) throw new Error("Manager line contains a reporting cycle.");
    seen.add(cursor);
    cursor = managerByEmployee.get(cursor) ?? null;
  }
}

function changedFields(before: SafeAuditEmployee, after: SafeAuditEmployee) {
  return (Object.keys(after) as Array<keyof SafeAuditEmployee>).filter((key) => before[key] !== after[key]);
}

function safeAuditPayload(input: SafeAuditEmployee): SafeAuditEmployee {
  return {
    id: input.id,
    employeeNo: input.employeeNo,
    departmentId: input.departmentId,
    managerId: input.managerId,
    jobPositionId: input.jobPositionId,
    jobTitle: input.jobTitle,
  };
}

function createAuditMetadata(input: ReturnType<typeof normalizeCreateInput>) {
  return {
    source: "employee_master_workspace",
    employeeNoHash: stableHash({ employeeNo: input.employeeNo }),
    displayNameHash: stableHash({ displayName: input.displayName }),
    hireDate: input.hireDate.toISOString().slice(0, 10),
    onboardingNoteProvided: Boolean(input.onboardingNote),
    onboardingNoteHash: input.onboardingNote ? stableHash(input.onboardingNote) : null,
    nextSteps: [
      "link_login_sso",
      "complete_labor_roster",
      "publish_employment_terms",
      "configure_payroll_and_insurance",
    ],
    rawSensitiveValuesStored: false,
  };
}

function updateAuditMetadata(changedFields: Array<keyof SafeAuditEmployee>, changeReason: string | null) {
  return {
    source: "employee_master_workspace",
    changedFields,
    changeReasonProvided: Boolean(changeReason),
    changeReasonHash: changeReason ? stableHash(changeReason) : null,
    rawSensitiveValuesStored: false,
  };
}

function startOfUtcDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function hasActiveEffectiveRecord(records: Array<{ effectiveTo: Date | null }>) {
  return records.some((record) => !record.effectiveTo);
}

function payrollSetupStatus(input: {
  salaryConfigured: boolean;
  complianceConfigured: boolean;
  paymentConfigured: boolean;
}): EmployeeMasterRow["payrollSetupStatus"] {
  const completed = [
    input.salaryConfigured,
    input.complianceConfigured,
    input.paymentConfigured,
  ].filter(Boolean).length;
  if (completed === 3) return "ready";
  if (completed > 0) return "partial";
  return "missing";
}

function statutoryInsuranceStatus(
  records: Array<{ insuranceType: string; status: string }>,
): EmployeeMasterRow["statutoryInsuranceStatus"] {
  const requiredTypes = ["labor", "employment", "occupational_accident", "health", "labor_pension"];
  const completed = requiredTypes.filter((type) =>
    records.some((record) => record.insuranceType === type && record.status === "enrolled"),
  ).length;
  if (completed === requiredTypes.length) return "ready";
  if (completed > 0) return "partial";
  return "missing";
}

function laborRosterStatus(
  profile: {
    status: string;
    verificationStatus: string;
    missingFieldsJson: unknown;
  } | null,
): EmployeeMasterRow["laborRosterStatus"] {
  if (!profile) return "missing";
  if (profile.status === "complete" && profile.verificationStatus === "verified") return "complete";
  if (Array.isArray(profile.missingFieldsJson) && profile.missingFieldsJson.length > 0) {
    return "incomplete";
  }
  return "needs_review";
}

function employmentTermsStatus(
  terms: { status: string; acknowledgedAt: Date | null } | undefined,
): EmployeeMasterRow["employmentTermsStatus"] {
  if (!terms) return "missing";
  if (terms.acknowledgedAt) return "acknowledged";
  if (terms.status === "published") return "published";
  return "draft";
}

function profileGapLabels(input: {
  departmentMissing: boolean;
  managerMissing: boolean;
  jobArchitectureMissing: boolean;
  loginMissing: boolean;
  laborRosterStatus: EmployeeMasterRow["laborRosterStatus"];
  employmentTermsStatus: EmployeeMasterRow["employmentTermsStatus"];
  payrollSetupStatus: EmployeeMasterRow["payrollSetupStatus"];
  statutoryInsuranceStatus: EmployeeMasterRow["statutoryInsuranceStatus"];
}) {
  return [
    input.departmentMissing ? "缺部門" : null,
    input.managerMissing ? "缺主管線" : null,
    input.jobArchitectureMissing ? "缺標準職務" : null,
    input.loginMissing ? "缺登入/SSO" : null,
    input.laborRosterStatus !== "complete" ? "名卡待補" : null,
    input.employmentTermsStatus !== "acknowledged" ? "工作條件待確認" : null,
    input.payrollSetupStatus !== "ready" ? "薪資前置待補" : null,
    input.statutoryInsuranceStatus !== "ready" ? "投保待補" : null,
  ].filter(Boolean) as string[];
}

function scopeLabel(role: RoleKey) {
  if (role === "owner") return "全公司";
  if (role === "hr_admin") return "全公司 HR 視圖";
  if (role === "manager") return "主管團隊視圖";
  return "本人";
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    owner: "Owner",
    hr_admin: "HR",
    manager: "主管",
    employee: "員工",
  };
  return labels[role] ?? role;
}

function demoRoleLabels(employeeId: string) {
  if (employeeId === "demo-hr-employee") return ["HR"];
  if (employeeId === "demo-manager-employee") return ["主管"];
  return ["員工"];
}

type FallbackEmployee = ReturnType<typeof getFallbackCompanyOverview>["company"]["employees"][number];

function buildDemoJobPositions(employees: FallbackEmployee[]): EmployeeMasterJobPosition[] {
  const titleMap = new Map<string, FallbackEmployee>();
  for (const employee of employees) {
    if (!titleMap.has(employee.jobTitle)) {
      titleMap.set(employee.jobTitle, employee);
    }
  }
  return [...titleMap.entries()].map(([title, employee]) => {
    const levelCode = demoLevelCodeForTitle(title);
    return {
      id: demoJobPositionId(title),
      code: demoJobPositionCode(title),
      title,
      family: demoJobFamily(title),
      departmentId: employee.department?.id ?? null,
      departmentName: employee.department?.name ?? null,
      levelCode,
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

function demoLevelCodeForTitle(title: string) {
  if (/manager/i.test(title)) return "M1";
  if (/admin|engineer|designer/i.test(title)) return "L2";
  return "L1";
}
