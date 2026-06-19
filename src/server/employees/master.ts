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

export type EmployeeMasterWorkspace = {
  scopeLabel: string;
  companyName: string;
  departments: Array<{
    id: string;
    code: string;
    name: string;
    employeeCount: number;
  }>;
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
  const overview = getFallbackCompanyOverview();
  const visibleEmployees = overview.company.employees
    .filter((employee) => canSeeDemoEmployee(session, employee.id, employee.managerId))
    .map((employee, index) => {
      const laborRoster = index < 20 ? "complete" : index < 23 ? "needs_review" : "missing";
      const terms = index < 18 ? "acknowledged" : index < 22 ? "published" : "missing";
      const payroll = index < 20 ? "ready" : index < 24 ? "partial" : "missing";
      const statutory = index < 21 ? "ready" : index < 24 ? "partial" : "missing";
      const jobArchitectureMissing = index > 18;
      const loginMissing = index > 8;
      return {
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
        departmentId: employee.department?.id ?? null,
        departmentCode: employee.department?.code ?? null,
        departmentName: employee.department?.name ?? null,
        jobTitle: employee.jobTitle,
        jobPositionTitle: jobArchitectureMissing ? null : employee.jobTitle,
        jobLevelCode: index < 2 ? "L4" : index < 8 ? "L3" : "L2",
        managerId: employee.managerId,
        managerName: employee.managerId ? "陳主管" : null,
        directReportCount: employee.directReports.length,
        employmentStatus: "active",
        hireDate: new Date(Date.UTC(2025, index % 12, 1)),
        userLinked: !loginMissing,
        userStatus: loginMissing ? null : "active",
        roleLabels: demoRoleLabels(employee.id),
        externalIdentityLinked: index < 6,
        laborRosterStatus: laborRoster,
        employmentTermsStatus: terms,
        payrollSetupStatus: payroll,
        statutoryInsuranceStatus: statutory,
        profileGapLabels: profileGapLabels({
          departmentMissing: !employee.department,
          managerMissing: !employee.managerId && employee.directReports.length === 0,
          jobArchitectureMissing,
          loginMissing,
          laborRosterStatus: laborRoster,
          employmentTermsStatus: terms,
          payrollSetupStatus: payroll,
          statutoryInsuranceStatus: statutory,
        }),
      } satisfies EmployeeMasterRow;
    });

  return buildWorkspace({
    companyName: overview.company.name,
    scopeLabel: scopeLabel(session.role),
    departments: overview.company.departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      employeeCount: department._count.employees,
    })),
    employees: visibleEmployees,
  });
}

function buildWorkspace(input: {
  companyName: string;
  scopeLabel: string;
  departments: EmployeeMasterWorkspace["departments"];
  employees: EmployeeMasterRow[];
}): EmployeeMasterWorkspace {
  const summary = summarizeRows(input.employees, input.departments.length);
  return {
    ...input,
    summary,
    readiness: readinessFor(summary),
  };
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

function canSeeDemoEmployee(
  session: SessionLike,
  employeeId: string,
  managerId: string | null,
) {
  if (session.role !== "manager") return true;
  return employeeId === session.employee?.id || managerId === session.employee?.id;
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
