import { getFallbackSession } from "@/server/demo/fallback";
import { canViewPayrollRun, canViewPayslip, getPayrollDashboard } from "@/server/payroll/service";
import { getDb } from "@/server/db/client";
import { assertPermission, roleKeys, type RoleKey } from "@/server/auth/rbac";
import { recordBetaPilotAutomatedEvidence } from "./beta-pilot-checkpoints";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

type ReviewSession = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user: { id: string; displayName: string } | null;
  employee: { id: string; displayName: string } | null;
};

export type BetaPilotAccessReviewCheck = {
  id: string;
  title: string;
  status: "passed" | "failed";
  detail: string;
};

export type BetaPilotAccessReviewReport = {
  id: string;
  status: "passed" | "failed";
  checkCount: number;
  passedCount: number;
  failedCount: number;
  checks: BetaPilotAccessReviewCheck[];
  reviewedAt: Date;
};

export async function runBetaPilotAccessReview(session: SessionLike): Promise<BetaPilotAccessReviewReport> {
  assertPermission(session.role, "pilot:manage");
  const roleSessions = await getRoleReviewSessions(session);
  const checks = await buildAccessChecks(roleSessions);
  const failedChecks = checks.filter((check) => check.status === "failed");
  const report: BetaPilotAccessReviewReport = {
    id: crypto.randomUUID(),
    status: failedChecks.length === 0 ? "passed" : "failed",
    checkCount: checks.length,
    passedCount: checks.length - failedChecks.length,
    failedCount: failedChecks.length,
    checks,
    reviewedAt: new Date(),
  };

  await recordBetaPilotAutomatedEvidence(session, {
    checkpointId: "preflight",
    evidenceType: "access_review",
    evidenceRef: `access-review:${report.id}`,
    requiredEvidenceTypes: ["access_review"],
    statusOverride: report.status === "passed" ? "verified" : "blocked",
    metadata: {
      checkCount: report.checkCount,
      passedCount: report.passedCount,
      failedCount: report.failedCount,
      failedCheckIds: failedChecks.map((check) => check.id),
      testedRoles: roleKeys,
      rawSensitiveDataRead: false,
      amountValuesRead: false,
      destinationValuesRead: false,
      identityNumberValuesRead: false,
      wellnessValuesRead: false,
    },
  });

  if (report.status === "failed") {
    throw new Error(`權限防漏檢查未通過：${failedChecks.map((check) => check.title).join("、")}`);
  }

  return report;
}

async function buildAccessChecks(roleSessions: Record<RoleKey, ReviewSession | null>) {
  const manager = roleSessions.manager;
  const employee = roleSessions.employee;
  const employeeId = employee?.employee?.id ?? "employee";
  const managerId = manager?.employee?.id ?? "manager";
  return [
    expected("owner_payroll_dashboard_allowed", "老闆可進入薪資管理", canViewPayrollRun("owner")),
    expected("hr_payroll_dashboard_allowed", "人資可進入薪資管理", canViewPayrollRun("hr_admin")),
    expected("manager_payroll_dashboard_blocked", "主管不可進入薪資管理", !canViewPayrollRun("manager")),
    expected("employee_payroll_dashboard_blocked", "員工不可進入薪資管理", !canViewPayrollRun("employee")),
    expected("employee_own_payslip_allowed", "員工只能看自己的薪資單", Boolean(employee) && canViewPayslip(employee!, employeeId)),
    expected("employee_other_payslip_blocked", "員工不可看他人薪資單", Boolean(employee) && !canViewPayslip(employee!, managerId)),
    expected("manager_subordinate_payslip_blocked", "主管預設不可看部屬薪資單", Boolean(manager) && !canViewPayslip(manager!, employeeId)),
    await serviceRejects("manager_payroll_service_rejects", "薪資服務拒絕主管讀取 payroll dashboard", manager),
    await serviceRejects("employee_payroll_service_rejects", "薪資服務拒絕員工讀取 payroll dashboard", employee),
  ];
}

function expected(id: string, title: string, passed: boolean): BetaPilotAccessReviewCheck {
  return {
    id,
    title,
    status: passed ? "passed" : "failed",
    detail: passed ? "權限矩陣符合預期。" : "權限矩陣與預期不符，需修正角色或服務層 guard。",
  };
}

async function serviceRejects(
  id: string,
  title: string,
  session: ReviewSession | null,
): Promise<BetaPilotAccessReviewCheck> {
  if (!session) {
    return {
      id,
      title,
      status: "failed",
      detail: "找不到可測試的角色帳號。",
    };
  }

  try {
    await getPayrollDashboard(session);
    return {
      id,
      title,
      status: "failed",
      detail: "未授權角色可呼叫薪資服務，需立即修正。",
    };
  } catch {
    return {
      id,
      title,
      status: "passed",
      detail: "服務層拒絕未授權角色。",
    };
  }
}

async function getRoleReviewSessions(session: SessionLike): Promise<Record<RoleKey, ReviewSession | null>> {
  if (!canUseDatabase(session)) {
    return Object.fromEntries(
      roleKeys.map((role) => [role, normalizeFallbackSession(role)]),
    ) as Record<RoleKey, ReviewSession>;
  }

  const userRoles = await getDb().userRole.findMany({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      role: {
        key: { in: [...roleKeys] },
      },
    },
    include: {
      role: true,
      user: {
        include: {
          employee: true,
        },
      },
    },
  });

  return Object.fromEntries(
    roleKeys.map((role) => {
      const matched = userRoles.find((userRole) => userRole.role.key === role);
      return [
        role,
        matched
          ? {
              role,
              tenantId: matched.tenantId,
              companyId: matched.companyId,
              user: {
                id: matched.user.id,
                displayName: matched.user.displayName,
              },
              employee: matched.user.employee
                ? {
                    id: matched.user.employee.id,
                    displayName: matched.user.employee.displayName,
                  }
                : null,
            }
          : null,
      ];
    }),
  ) as Record<RoleKey, ReviewSession | null>;
}

function normalizeFallbackSession(role: RoleKey): ReviewSession {
  const session = getFallbackSession(role);
  return {
    role,
    tenantId: session.tenantId,
    companyId: session.companyId,
    user: {
      id: session.user.id,
      displayName: session.user.displayName,
    },
    employee: session.employee
      ? {
          id: session.employee.id,
          displayName: session.employee.displayName,
        }
      : null,
  };
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
