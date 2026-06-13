import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { getSalaryProfileWorkspace } from "@/server/payroll/salary-profiles";
import { getPaymentProfileWorkspace } from "@/server/payroll/payment-profiles";
import { listPayrollComplianceProfiles } from "@/server/payroll/compliance";
import { getTaiwanLaborStandardsConfig, getActiveTaiwanLaborStandardsConfig } from "@/server/rules/settings";
import type { TaiwanStatutoryOnboardingConfig } from "@/server/rules/taiwan-labor-standards";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type OnboardingCheckStatus = "ready" | "action_required" | "blocked";

export type OnboardingCheck = {
  id: string;
  title: string;
  status: OnboardingCheckStatus;
  detail: string;
  actionLabel: string;
  actionHref: string;
  missingEmployees?: Array<{ id: string; employeeNo: string; displayName: string }>;
};

export type OnboardingReadinessSnapshot = {
  employeeCount: number;
  departmentCount: number;
  managerCount: number;
  employeesMissingDepartment: Array<{ id: string; employeeNo: string; displayName: string }>;
  employeesMissingManager: Array<{ id: string; employeeNo: string; displayName: string }>;
  activeAttendancePolicyCount: number;
  activeShiftTemplateCount: number;
  leavePolicyCount: number;
  companyCalendarDayCount: number;
  activeRuleVersionCount: number;
  salaryProfileEmployeeIds: string[];
  paymentProfileEmployeeIds: string[];
  payrollComplianceProfileEmployeeIds: string[];
  statutoryOnboarding: TaiwanStatutoryOnboardingConfig;
  activeEmployees: Array<{ id: string; employeeNo: string; displayName: string; hireDate: Date }>;
};

export type OnboardingReadinessReport = {
  readyForProductionVerify: boolean;
  readyCount: number;
  actionRequiredCount: number;
  blockedCount: number;
  checks: OnboardingCheck[];
};

export async function getOnboardingReadinessReport(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  const snapshot = canUseDatabase(session)
    ? await buildDbSnapshot(session).catch(() => buildDemoSnapshot(session))
    : await buildDemoSnapshot(session);
  return buildOnboardingReadinessReport(snapshot);
}

export function buildOnboardingReadinessReport(
  snapshot: OnboardingReadinessSnapshot,
): OnboardingReadinessReport {
  const activeEmployeeIds = new Set(snapshot.activeEmployees.map((employee) => employee.id));
  const missingSalary = missingEmployees(snapshot, snapshot.salaryProfileEmployeeIds);
  const missingPayment = missingEmployees(snapshot, snapshot.paymentProfileEmployeeIds);
  const missingCompliance = missingEmployees(snapshot, snapshot.payrollComplianceProfileEmployeeIds);
  const statutoryEnrollmentMissing = missingEmployees(snapshot, snapshot.payrollComplianceProfileEmployeeIds);
  const checks: OnboardingCheck[] = [
    {
      id: "employees",
      title: "Employee master data",
      status: snapshot.employeeCount > 0 && snapshot.departmentCount >= 1 ? "ready" : "blocked",
      detail: `${snapshot.employeeCount} active employee(s), ${snapshot.departmentCount} department(s).`,
      actionLabel: "Import employees",
      actionHref: "/hr/employee-import",
    },
    {
      id: "organization",
      title: "Organization and managers",
      status: snapshot.managerCount >= 1 && snapshot.employeesMissingDepartment.length === 0
        ? snapshot.employeesMissingManager.length === 0 ? "ready" : "action_required"
        : "blocked",
      detail: `${snapshot.managerCount} manager(s), ${snapshot.employeesMissingDepartment.length} missing department, ${snapshot.employeesMissingManager.length} missing manager.`,
      actionLabel: "Review lifecycle",
      actionHref: "/hr/employee-lifecycle",
      missingEmployees: uniqueEmployees([...snapshot.employeesMissingDepartment, ...snapshot.employeesMissingManager]),
    },
    {
      id: "salary_profiles",
      title: "Salary profiles",
      status: missingSalary.length === 0 && activeEmployeeIds.size > 0 ? "ready" : "blocked",
      detail: `${activeEmployeeIds.size - missingSalary.length}/${activeEmployeeIds.size} active employee(s) have current salary profiles.`,
      actionLabel: "Import payroll profiles",
      actionHref: "/hr/payroll-profile-import",
      missingEmployees: missingSalary,
    },
    {
      id: "payment_profiles",
      title: "Payment profiles",
      status: missingPayment.length === 0 && activeEmployeeIds.size > 0 ? "ready" : "blocked",
      detail: `${activeEmployeeIds.size - missingPayment.length}/${activeEmployeeIds.size} active employee(s) have active payment destinations.`,
      actionLabel: "Import payroll profiles",
      actionHref: "/hr/payroll-profile-import",
      missingEmployees: missingPayment,
    },
    {
      id: "payroll_compliance_profiles",
      title: "Payroll compliance profiles",
      status: missingCompliance.length === 0 && activeEmployeeIds.size > 0 ? "ready" : "blocked",
      detail: `${activeEmployeeIds.size - missingCompliance.length}/${activeEmployeeIds.size} active employee(s) have explicit payroll compliance profiles.`,
      actionLabel: "Import payroll profiles",
      actionHref: "/hr/payroll-profile-import",
      missingEmployees: missingCompliance,
    },
    {
      id: "statutory_insurance_enrollment",
      title: "Statutory insurance enrollment",
      status: statutoryEnrollmentMissing.length === 0 && activeEmployeeIds.size > 0 ? "ready" : "blocked",
      detail: `${activeEmployeeIds.size - statutoryEnrollmentMissing.length}/${activeEmployeeIds.size} active employee(s) have payroll compliance data for labor/employment/occupational accident insurance enrollment; due days from hire ${snapshot.statutoryOnboarding.laborInsuranceEnrollmentDueDaysFromHire}/${snapshot.statutoryOnboarding.employmentInsuranceEnrollmentDueDaysFromHire}/${snapshot.statutoryOnboarding.occupationalAccidentInsuranceEnrollmentDueDaysFromHire}.`,
      actionLabel: "Review compliance profiles",
      actionHref: "/hr/payroll-compliance",
      missingEmployees: statutoryEnrollmentMissing,
    },
    {
      id: "time_setup",
      title: "Time and leave setup",
      status: snapshot.activeAttendancePolicyCount >= 1 &&
        snapshot.activeShiftTemplateCount >= 1 &&
        snapshot.leavePolicyCount >= 1 &&
        snapshot.companyCalendarDayCount >= 1
        ? "ready"
        : "action_required",
      detail: `${snapshot.activeAttendancePolicyCount} attendance policy, ${snapshot.activeShiftTemplateCount} shift template, ${snapshot.leavePolicyCount} leave policy, ${snapshot.companyCalendarDayCount} calendar day(s).`,
      actionLabel: "Review time setup",
      actionHref: "/hr/attendance-policies",
    },
    {
      id: "rule_versions",
      title: "Taiwan rule versions",
      status: snapshot.activeRuleVersionCount >= 3 ? "ready" : "blocked",
      detail: `${snapshot.activeRuleVersionCount} active rule version(s) are available.`,
      actionLabel: "Review law rules",
      actionHref: "/settings#law-rules-setup",
    },
  ];

  const readyCount = checks.filter((item) => item.status === "ready").length;
  const actionRequiredCount = checks.filter((item) => item.status === "action_required").length;
  const blockedCount = checks.filter((item) => item.status === "blocked").length;
  return {
    readyForProductionVerify: blockedCount === 0,
    readyCount,
    actionRequiredCount,
    blockedCount,
    checks,
  };
}

async function buildDbSnapshot(session: SessionLike): Promise<OnboardingReadinessSnapshot> {
  const db = getDb();
  const [
    laborConfig,
    employees,
    departmentCount,
    attendancePolicyCount,
    shiftTemplateCount,
    leavePolicyCount,
    calendarDayCount,
    activeRuleVersionCount,
    salaryProfiles,
    paymentProfiles,
    complianceProfiles,
  ] = await Promise.all([
    getTaiwanLaborStandardsConfig({
      ...session,
      tenantId: session.tenantId ?? null,
      companyId: session.companyId ?? null,
    }),
    db.employee.findMany({
      where: { tenantId: session.tenantId!, companyId: session.companyId!, employmentStatus: "active" },
      include: { directReports: true },
      orderBy: { employeeNo: "asc" },
    }),
    db.department.count({ where: { tenantId: session.tenantId!, companyId: session.companyId! } }),
    db.attendancePolicy.count({ where: { tenantId: session.tenantId!, companyId: session.companyId!, status: "active" } }),
    db.shiftTemplate.count({ where: { tenantId: session.tenantId!, companyId: session.companyId!, status: "active" } }),
    db.leavePolicy.count({ where: { tenantId: session.tenantId!, companyId: session.companyId!, status: "active" } }),
    db.companyCalendarDay.count({ where: { tenantId: session.tenantId!, companyId: session.companyId! } }),
    db.ruleVersion.count({ where: { tenantId: session.tenantId!, companyId: session.companyId!, status: "active" } }),
    db.salaryProfile.findMany({
      where: { tenantId: session.tenantId!, companyId: session.companyId!, effectiveTo: null },
      select: { employeeId: true },
    }),
    db.employeePaymentProfile.findMany({
      where: { tenantId: session.tenantId!, companyId: session.companyId!, status: "active", effectiveTo: null },
      select: { employeeId: true },
    }),
    db.payrollComplianceProfile.findMany({
      where: { tenantId: session.tenantId!, companyId: session.companyId!, effectiveTo: null },
      select: { employeeId: true },
    }),
  ]);
  return {
    employeeCount: employees.length,
    departmentCount,
    managerCount: employees.filter((employee) => employee.directReports.length > 0).length,
    employeesMissingDepartment: employees.filter((employee) => !employee.departmentId).map(toEmployeeRef),
    employeesMissingManager: employees
      .filter((employee) => !employee.managerId && employee.directReports.length === 0)
      .map(toEmployeeRef),
    activeAttendancePolicyCount: attendancePolicyCount,
    activeShiftTemplateCount: shiftTemplateCount,
    leavePolicyCount,
    companyCalendarDayCount: calendarDayCount,
    activeRuleVersionCount,
    statutoryOnboarding: laborConfig.statutoryOnboarding,
    salaryProfileEmployeeIds: salaryProfiles.map((profile) => profile.employeeId),
    paymentProfileEmployeeIds: paymentProfiles.map((profile) => profile.employeeId),
    payrollComplianceProfileEmployeeIds: complianceProfiles.map((profile) => profile.employeeId),
    activeEmployees: employees.map(toEmployeeRef),
  };
}

async function buildDemoSnapshot(session: SessionLike): Promise<OnboardingReadinessSnapshot> {
  const overview = getFallbackCompanyOverview();
  const [salaryWorkspace, paymentWorkspace, complianceRows] = await Promise.all([
    getSalaryProfileWorkspace({
      role: "hr_admin",
      tenantId: session.tenantId ?? "demo-tenant",
      companyId: session.companyId ?? "demo-company",
      user: session.user,
      employee: session.employee,
    }),
    getPaymentProfileWorkspace({
      role: "hr_admin",
      tenantId: session.tenantId ?? "demo-tenant",
      companyId: session.companyId ?? "demo-company",
      user: session.user,
      employee: session.employee,
    }),
    listPayrollComplianceProfiles({
      role: "hr_admin",
      tenantId: session.tenantId ?? "demo-tenant",
      companyId: session.companyId ?? "demo-company",
      user: session.user,
      employee: session.employee,
    }),
  ]);
  return {
    employeeCount: overview.employeeCount,
    departmentCount: overview.company.departments.length,
    managerCount: overview.managerCount,
    employeesMissingDepartment: overview.company.employees.filter((employee) => !employee.department).map(toEmployeeRef),
    employeesMissingManager: overview.company.employees
      .filter((employee) => !employee.managerId && employee.directReports.length === 0)
      .map(toEmployeeRef),
    activeAttendancePolicyCount: 1,
    activeShiftTemplateCount: 1,
    leavePolicyCount: 1,
    companyCalendarDayCount: 1,
    activeRuleVersionCount: overview.activeRuleCount,
    statutoryOnboarding: getActiveTaiwanLaborStandardsConfig().statutoryOnboarding,
    salaryProfileEmployeeIds: salaryWorkspace.profiles.filter((profile) => !profile.effectiveTo).map((profile) => profile.employeeId),
    paymentProfileEmployeeIds: paymentWorkspace.profiles
      .filter((profile) => profile.status === "active" && !profile.effectiveTo)
      .map((profile) => profile.employeeId),
    payrollComplianceProfileEmployeeIds: complianceRows.map((row) => row.employeeId),
    activeEmployees: overview.company.employees.map(toEmployeeRef),
  };
}

function missingEmployees(
  snapshot: OnboardingReadinessSnapshot,
  configuredEmployeeIds: string[],
) {
  const configured = new Set(configuredEmployeeIds);
  return snapshot.activeEmployees.flatMap((employee) => {
    if (configured.has(employee.id)) return [];
    return employee;
  });
}

function toEmployeeRef(employee: { id: string; employeeNo: string; displayName: string; hireDate?: Date }) {
  return {
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
    hireDate: employee.hireDate ?? new Date(),
  };
}

function uniqueEmployees(employees: Array<{ id: string; employeeNo: string; displayName: string }>) {
  return Array.from(new Map(employees.map((employee) => [employee.id, employee])).values());
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
