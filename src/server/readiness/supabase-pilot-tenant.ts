import { createHash } from "node:crypto";
import { normalizePrivateSchemaName } from "./supabase-bootstrap";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";
import {
  buildRuleVersionTestCases,
  evaluateLegalSourceFreshness,
  summarizeLegalSourceFreshness,
  validateTaiwanLaborStandardsRuleSet,
} from "@/server/rules/validation";

export type SupabasePilotTenantSeedOptions = {
  schemaName?: string;
  referenceDate?: Date;
};

export type SupabasePilotTenantSeedSummary = {
  tenantSlug: string;
  companyCode: string;
  employeeCount: number;
  managerCount: number;
  departmentCount: number;
  roleCount: number;
  workScheduleCount: number;
  leavePolicyCount: number;
  leaveBalanceCount: number;
  payrollRunCount: number;
  releasedPayslipCount: number;
  auditLogCount: number;
};

export type SupabasePilotTenantSeedPlan = {
  sql: string;
  summary: SupabasePilotTenantSeedSummary;
};

export type SupabasePilotTenantVerificationSnapshot = {
  tenantCount: number;
  companyCount: number;
  employeeCount: number;
  managerCount: number;
  departmentCount: number;
  userCount: number;
  userRoleCount: number;
  roleKeys: string[];
  roleAssignmentKeys: string[];
  attendancePolicyCount: number;
  shiftTemplateCount: number;
  workScheduleCount: number;
  leavePolicyCount: number;
  leaveBalanceCount: number;
  salaryProfileCount: number;
  payrollComplianceProfileCount: number;
  statutoryInsuranceReadyEmployeeCount: number;
  paymentProfileCount: number;
  releasedPayrollRunCount: number;
  payrollItemCount: number;
  releasedPayslipCount: number;
  announcementCount: number;
  announcementReceiptCount: number;
  formTemplateCount: number;
  workflowStepCount: number;
  activeRuleVersionCount: number;
  telemetryEventCount: number;
  betaPilotTrialRunCount: number;
  auditLogCount: number;
  auditEntityTypes: string[];
  exposedTablePrivilegeCount: number;
  anonUsage: boolean;
  authenticatedUsage: boolean;
  publicSecurityDefinerExecuteCount: number;
};

export type SupabasePilotTenantVerificationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

type SqlValue = string | number | boolean | Date | null | { json: unknown };

type PilotEmployee = {
  id: string;
  userId: string;
  employeeNo: string;
  displayName: string;
  email: string;
  departmentId: string;
  managerId: string | null;
  jobTitle: string;
  roleKey: "owner" | "hr_admin" | "manager" | "employee";
  hireDate: Date;
  baseSalary: number;
  allowance: number;
  deduction: number;
};

const pilotTenantId = "tenant_suiyuecare_pilot";
const pilotTenantSlug = "suiyuecare-pilot";
const pilotCompanyId = "company_suiyuecare_pilot";
const pilotCompanyCode = "suiyuecare-pilot";
const pilotOwnerUserId = "user_suiyuecare_pilot_owner";
const payrollRuleVersionId = "rule_version_suiyuecare_pilot_payroll_2026_06";

export function buildSupabasePilotTenantSeedPlan(
  options: SupabasePilotTenantSeedOptions = {},
): SupabasePilotTenantSeedPlan {
  const schemaName = normalizePrivateSchemaName(options.schemaName ?? "hr_one");
  const referenceDate = startOfUtcDay(options.referenceDate ?? new Date());
  const departments = buildDepartments();
  const employees = buildEmployees();
  const managers = new Set(employees.map((employee) => employee.managerId).filter(Boolean));
  const scheduleDates = buildWeekdayScheduleDates(referenceDate, 15);
  const leavePolicies = buildLeavePolicies();
  const payroll = buildPayrollRows(employees, referenceDate);
  const auditLogs = buildAuditLogs(referenceDate);
  const telemetryEvents = buildTelemetryEvents(referenceDate);
  const sqlSections = [
    "-- HR One Supabase pilot tenant seed.",
    "-- Synthetic data only. Output and audit metadata stay aggregate-only.",
    `SET search_path TO ${quoteIdentifier(schemaName)};`,
    "",
    buildCollisionGuardSql(),
    upsertRows("Tenant", [
      "id",
      "name",
      "slug",
      "status",
      "plan",
      "createdAt",
      "updatedAt",
    ], [[
      pilotTenantId,
      "Suiyuecare HR One Pilot",
      pilotTenantSlug,
      "active",
      "pilot",
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("Company", [
      "id",
      "tenantId",
      "name",
      "legalName",
      "taxId",
      "timezone",
      "currency",
      "createdAt",
      "updatedAt",
    ], [[
      pilotCompanyId,
      pilotTenantId,
      "Suiyuecare Pilot Company",
      "Suiyuecare Pilot Co., Ltd.",
      "50700001",
      "Asia/Taipei",
      "TWD",
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("TenantSubscription", [
      "id",
      "tenantId",
      "plan",
      "status",
      "seatLimit",
      "activeSeatCount",
      "trialEndsAt",
      "billingContactEmail",
      "verificationStatus",
      "createdAt",
      "updatedAt",
    ], [[
      "subscription_suiyuecare_pilot",
      pilotTenantId,
      "pilot",
      "trial",
      50,
      employees.length,
      addDays(referenceDate, 14),
      "hr-pilot@suiyuecare.com",
      "pilot_ready",
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("Department", [
      "id",
      "tenantId",
      "companyId",
      "parentDepartmentId",
      "name",
      "code",
      "createdAt",
      "updatedAt",
    ], departments.map((department) => [
      department.id,
      pilotTenantId,
      pilotCompanyId,
      department.parentDepartmentId,
      department.name,
      department.code,
      referenceDate,
      referenceDate,
    ])),
    upsertRows("Role", [
      "id",
      "tenantId",
      "key",
      "name",
      "description",
      "createdAt",
      "updatedAt",
    ], buildRoles().map((role) => [
      roleId(role.key),
      pilotTenantId,
      role.key,
      role.name,
      role.description,
      referenceDate,
      referenceDate,
    ])),
    upsertRows("User", [
      "id",
      "tenantId",
      "email",
      "displayName",
      "status",
      "createdAt",
      "updatedAt",
    ], employees.map((employee) => [
      employee.userId,
      pilotTenantId,
      employee.email,
      employee.displayName,
      "active",
      referenceDate,
      referenceDate,
    ])),
    upsertRows("UserExternalIdentity", [
      "id",
      "tenantId",
      "userId",
      "provider",
      "issuer",
      "subject",
      "emailAtLink",
      "lastSeenAt",
      "createdAt",
      "updatedAt",
    ], employees.map((employee) => [
      `identity_${employee.userId}`,
      pilotTenantId,
      employee.userId,
      "pilot_oidc",
      "https://login.suiyuecare.com/hr-one-pilot",
      `pilot:${employee.employeeNo}`,
      employee.email,
      referenceDate,
      referenceDate,
      referenceDate,
    ])),
    upsertRows("Employee", [
      "id",
      "tenantId",
      "companyId",
      "userId",
      "departmentId",
      "managerId",
      "employeeNo",
      "displayName",
      "jobTitle",
      "employmentStatus",
      "hireDate",
      "createdAt",
      "updatedAt",
    ], employees.map((employee) => [
      employee.id,
      pilotTenantId,
      pilotCompanyId,
      employee.userId,
      employee.departmentId,
      employee.managerId,
      employee.employeeNo,
      employee.displayName,
      employee.jobTitle,
      "active",
      employee.hireDate,
      referenceDate,
      referenceDate,
    ])),
    insertRows("UserRole", [
      "id",
      "tenantId",
      "companyId",
      "userId",
      "roleId",
      "scopeType",
      "scopeId",
      "createdAt",
    ], employees.map((employee) => [
      `user_role_${employee.employeeNo.toLowerCase()}`,
      pilotTenantId,
      pilotCompanyId,
      employee.userId,
      roleId(employee.roleKey),
      "company",
      pilotCompanyId,
      referenceDate,
    ]), 'ON CONFLICT ("companyId", "userId", "roleId") DO NOTHING'),
    upsertRows("CompanySecuritySetting", [
      "id",
      "tenantId",
      "companyId",
      "mfaRequiredForAdmins",
      "mfaRequiredForEmployees",
      "ssoEnabled",
      "ssoProvider",
      "ssoIssuerUrl",
      "ssoClientId",
      "ssoJwksUrl",
      "passwordMinLength",
      "passwordRequiresNumber",
      "passwordRequiresSymbol",
      "sessionTimeoutMinutes",
      "idleTimeoutMinutes",
      "allowedEmailDomainsJson",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "security_suiyuecare_pilot",
      pilotTenantId,
      pilotCompanyId,
      true,
      false,
      false,
      null,
      null,
      null,
      null,
      12,
      true,
      true,
      480,
      60,
      json(["suiyuecare.com"]),
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("CompanyNotificationSetting", [
      "id",
      "tenantId",
      "companyId",
      "inAppEnabled",
      "emailEnabled",
      "lineEnabled",
      "slackEnabled",
      "teamsEnabled",
      "externalSummaryOnly",
      "approvalSubmittedEnabled",
      "approvalDecisionEnabled",
      "payrollReleasedEnabled",
      "systemAlertEnabled",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "notifications_suiyuecare_pilot",
      pilotTenantId,
      pilotCompanyId,
      true,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("CompanyPayrollRecordkeepingSetting", [
      "id",
      "tenantId",
      "companyId",
      "wageRosterRetentionDays",
      "employeePayslipEnabled",
      "wageCalculationDetailsEnabled",
      "laborInspectionExportEnabled",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "payroll_recordkeeping_suiyuecare_pilot",
      pilotTenantId,
      pilotCompanyId,
      1825,
      true,
      true,
      true,
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("AttendancePolicy", [
      "id",
      "tenantId",
      "companyId",
      "name",
      "status",
      "regularDailyMinutes",
      "overtimeWarningDailyMinutes",
      "clockInGraceMinutes",
      "clockOutGraceMinutes",
      "requireOvertimeApproval",
      "requirePunchCorrectionApproval",
      "allowMobilePunch",
      "allowRemotePunch",
      "requireOfficeNetworkPunch",
      "allowedOfficeIpCidrsJson",
      "requireGpsProximityPunch",
      "gpsRadiusMeters",
      "punchPolicyNote",
      "attendanceRecordRetentionDays",
      "employeeSelfServiceEnabled",
      "employeeExportEnabled",
      "effectiveFrom",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "attendance_policy_suiyuecare_pilot",
      pilotTenantId,
      pilotCompanyId,
      "Pilot standard attendance",
      "active",
      480,
      720,
      5,
      5,
      true,
      true,
      true,
      true,
      false,
      json([]),
      false,
      300,
      "Pilot policy: employees use mobile or web punch; HR reviews exceptions before payroll close.",
      1825,
      true,
      true,
      referenceDate,
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("ShiftTemplate", [
      "id",
      "tenantId",
      "companyId",
      "code",
      "name",
      "status",
      "startTime",
      "endTime",
      "breakMinutes",
      "scheduledMinutes",
      "crossesMidnight",
      "eligibleWeekdays",
      "notes",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "shift_suiyuecare_day",
      pilotTenantId,
      pilotCompanyId,
      "DAY",
      "Pilot day shift",
      "active",
      "09:00",
      "18:00",
      60,
      480,
      false,
      json([1, 2, 3, 4, 5]),
      "Synthetic pilot schedule template.",
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    insertRows("WorkSchedule", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "shiftTemplateId",
      "workDate",
      "scheduledStart",
      "scheduledEnd",
      "shiftName",
      "createdAt",
      "updatedAt",
    ], employees.flatMap((employee) =>
      scheduleDates.map((workDate) => [
        `schedule_${employee.employeeNo.toLowerCase()}_${dateKey(workDate)}`,
        pilotTenantId,
        pilotCompanyId,
        employee.id,
        "shift_suiyuecare_day",
        workDate,
        withUtcTime(workDate, 1),
        withUtcTime(workDate, 10),
        "Pilot day shift",
        referenceDate,
        referenceDate,
      ]),
    ), 'ON CONFLICT ("employeeId", "workDate") DO NOTHING'),
    insertRows("AttendanceRecord", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "workDate",
      "clockInAt",
      "clockOutAt",
      "clockInSource",
      "clockOutSource",
      "status",
      "createdAt",
      "updatedAt",
    ], employees.slice(0, 10).flatMap((employee) =>
      scheduleDates.slice(0, 3).map((workDate) => [
        `attendance_${employee.employeeNo.toLowerCase()}_${dateKey(workDate)}`,
        pilotTenantId,
        pilotCompanyId,
        employee.id,
        workDate,
        withUtcTime(workDate, 1, employee.employeeNo === "E005" ? 8 : 0),
        withUtcTime(workDate, 10, 0),
        "mobile",
        "mobile",
        "closed",
        referenceDate,
        referenceDate,
      ]),
    ), 'ON CONFLICT ("employeeId", "workDate") DO NOTHING'),
    upsertRows("LeavePolicy", [
      "id",
      "tenantId",
      "companyId",
      "code",
      "name",
      "annualUnits",
      "unit",
      "attachmentRequired",
      "status",
      "statutoryCategory",
      "eligibilityRule",
      "payRatePercent",
      "annualLimitNote",
      "requiresLegalReview",
      "accrualMethod",
      "minNoticeDays",
      "carryoverLimitUnits",
      "paid",
      "syncBalancesOnUpdate",
      "createdAt",
      "updatedAt",
    ], leavePolicies.map((policy) => [
      policy.id,
      pilotTenantId,
      pilotCompanyId,
      policy.code,
      policy.name,
      policy.annualUnits,
      "day",
      policy.attachmentRequired,
      "active",
      policy.statutoryCategory,
      policy.eligibilityRule,
      policy.payRatePercent,
      policy.annualLimitNote,
      false,
      "annual_grant",
      policy.minNoticeDays,
      policy.carryoverLimitUnits,
      policy.paid,
      false,
      referenceDate,
      referenceDate,
    ])),
    insertRows("LeaveBalance", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "leavePolicyId",
      "grantedUnits",
      "usedUnits",
      "pendingUnits",
      "settledUnits",
      "carryoverUnits",
      "carryoverUsedUnits",
      "currentYearUnits",
      "currentYearUsedUnits",
      "remainingUnits",
      "updatedAt",
    ], employees.flatMap((employee, employeeIndex) =>
      leavePolicies.map((policy) => {
        const usedUnits = policy.code === "annual" ? employeeIndex % 3 : 0;
        return [
          `leave_balance_${employee.employeeNo.toLowerCase()}_${policy.code}`,
          pilotTenantId,
          pilotCompanyId,
          employee.id,
          policy.id,
          policy.annualUnits,
          usedUnits,
          0,
          0,
          0,
          0,
          policy.annualUnits,
          usedUnits,
          Math.max(0, policy.annualUnits - usedUnits),
          referenceDate,
        ];
      }),
    ), 'ON CONFLICT ("employeeId", "leavePolicyId") DO NOTHING'),
    insertRows("SalaryProfile", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "baseSalary",
      "hourlyWage",
      "recurringAllowances",
      "recurringDeductions",
      "effectiveFrom",
      "createdAt",
      "updatedAt",
    ], employees.map((employee) => [
      `salary_profile_${employee.employeeNo.toLowerCase()}`,
      pilotTenantId,
      pilotCompanyId,
      employee.id,
      employee.baseSalary,
      null,
      json([{ code: "meal", name: "Meal allowance", amount: employee.allowance }]),
      json([{ code: "welfare", name: "Welfare deduction", amount: employee.deduction }]),
      new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1)),
      referenceDate,
      referenceDate,
    ]), 'ON CONFLICT ("id") DO NOTHING'),
    insertRows("PayrollComplianceProfile", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "taxResidency",
      "dependentCount",
      "laborInsuranceMonthlyWage",
      "healthInsuranceMonthlyWage",
      "laborPensionMonthlyWage",
      "incomeTaxWithholdingMethod",
      "nonResidentWithholdingRate",
      "effectiveFrom",
      "createdAt",
      "updatedAt",
    ], employees.map((employee, index) => [
      `payroll_compliance_${employee.employeeNo.toLowerCase()}`,
      pilotTenantId,
      pilotCompanyId,
      employee.id,
      "resident",
      index % 3,
      null,
      null,
      null,
      "annualized_progressive",
      null,
      new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1)),
      referenceDate,
      referenceDate,
    ]), 'ON CONFLICT ("id") DO NOTHING'),
    insertRows("EmployeePaymentProfile", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "paymentMethod",
      "bankCode",
      "bankBranchCode",
      "accountName",
      "accountNumberHash",
      "accountNumberLast4",
      "status",
      "effectiveFrom",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ], employees.map((employee) => [
      `payment_profile_${employee.employeeNo.toLowerCase()}`,
      pilotTenantId,
      pilotCompanyId,
      employee.id,
      "bank_transfer",
      "004",
      "0123",
      `HR One Pilot ${employee.employeeNo}`,
      hash(`pilot-payment:${employee.employeeNo}:synthetic`),
      String(9000 + Number(employee.employeeNo.slice(1))).slice(-4),
      "active",
      new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1)),
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]), 'ON CONFLICT ("id") DO NOTHING'),
    insertRows("StatutoryInsuranceRecord", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "insuranceType",
      "status",
      "dueDate",
      "enrolledAt",
      "evidenceRef",
      "evidenceHash",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], employees.flatMap((employee) =>
      statutoryInsuranceTypes.map((insuranceType) => {
        const evidenceRef = `pilot://${employee.employeeNo}/${insuranceType}`;
        return [
          `insurance_${employee.employeeNo.toLowerCase()}_${insuranceType}`,
          pilotTenantId,
          pilotCompanyId,
          employee.id,
          insuranceType,
          "enrolled",
          employee.hireDate,
          employee.hireDate,
          evidenceRef,
          hash(evidenceRef),
          pilotOwnerUserId,
          referenceDate,
          referenceDate,
        ];
      }),
    ), 'ON CONFLICT ("companyId", "employeeId", "insuranceType") DO NOTHING'),
    ...buildLawRuleSql(referenceDate),
    upsertRows("FormTemplate", [
      "id",
      "tenantId",
      "companyId",
      "title",
      "description",
      "category",
      "fieldsJson",
      "visibilityRulesJson",
      "status",
      "createdAt",
      "updatedAt",
    ], [[
      "form_template_pilot_equipment",
      pilotTenantId,
      pilotCompanyId,
      "Pilot equipment request",
      "Synthetic low-code form for the two-week pilot.",
      "general",
      json([
        { id: "needed_date", label: "Needed date", type: "date", required: true },
        { id: "item", label: "Requested item", type: "select", required: true, options: ["Laptop", "Phone", "Badge"] },
        { id: "reason", label: "Reason", type: "textarea", required: true },
      ]),
      json([]),
      "active",
      referenceDate,
      referenceDate,
    ]]),
    insertRows("WorkflowTemplateStep", [
      "id",
      "tenantId",
      "companyId",
      "formTemplateId",
      "stepOrder",
      "approverType",
      "approverRef",
      "conditionJson",
      "createdAt",
    ], [
      [
        "workflow_step_pilot_equipment_manager",
        pilotTenantId,
        pilotCompanyId,
        "form_template_pilot_equipment",
        1,
        "direct_manager",
        null,
        json({}),
        referenceDate,
      ],
      [
        "workflow_step_pilot_equipment_hr",
        pilotTenantId,
        pilotCompanyId,
        "form_template_pilot_equipment",
        2,
        "hr_admin",
        null,
        json({}),
        referenceDate,
      ],
    ], 'ON CONFLICT ("id") DO NOTHING'),
    insertRows("PayrollRun", [
      "id",
      "tenantId",
      "companyId",
      "periodStart",
      "periodEnd",
      "payDate",
      "status",
      "attendanceComplete",
      "pendingApprovalCount",
      "exceptionCount",
      "ruleVersionId",
      "grossTotal",
      "deductionTotal",
      "netTotal",
      "lockedAt",
      "releasedAt",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      payroll.runId,
      pilotTenantId,
      pilotCompanyId,
      payroll.periodStart,
      payroll.periodEnd,
      payroll.payDate,
      "released",
      true,
      0,
      0,
      payrollRuleVersionId,
      payroll.grossTotal,
      payroll.deductionTotal,
      payroll.netTotal,
      addHours(payroll.payDate, 1),
      addHours(payroll.payDate, 2),
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]], 'ON CONFLICT ("companyId", "periodStart", "periodEnd") DO NOTHING'),
    insertRows("PayrollItem", [
      "id",
      "tenantId",
      "companyId",
      "payrollRunId",
      "employeeId",
      "kind",
      "code",
      "name",
      "amount",
      "quantity",
      "ruleVersionId",
      "metadataJson",
      "createdAt",
    ], payroll.items, 'ON CONFLICT ("id") DO NOTHING'),
    insertRows("Payslip", [
      "id",
      "tenantId",
      "companyId",
      "payrollRunId",
      "employeeId",
      "grossPay",
      "deductions",
      "netPay",
      "status",
      "releasedAt",
      "createdAt",
      "updatedAt",
    ], payroll.payslips, 'ON CONFLICT ("payrollRunId", "employeeId") DO NOTHING'),
    upsertRows("CompanyAnnouncement", [
      "id",
      "tenantId",
      "companyId",
      "title",
      "body",
      "category",
      "status",
      "requireReceipt",
      "publishedAt",
      "publishedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "announcement_suiyuecare_pilot_day1",
      pilotTenantId,
      pilotCompanyId,
      "Pilot day 1 announcement",
      "Please use HR One for clock-in, leave requests, approvals, announcements, and payslip checks during the two-week pilot.",
      "pilot",
      "published",
      true,
      referenceDate,
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    insertRows("EmployeeAnnouncementReceipt", [
      "id",
      "tenantId",
      "companyId",
      "announcementId",
      "employeeId",
      "receiptHash",
      "acknowledgedAt",
      "source",
    ], employees.map((employee) => [
      `announcement_receipt_${employee.employeeNo.toLowerCase()}`,
      pilotTenantId,
      pilotCompanyId,
      "announcement_suiyuecare_pilot_day1",
      employee.id,
      hash(`announcement_suiyuecare_pilot_day1:${employee.id}`),
      addMinutes(referenceDate, Number(employee.employeeNo.slice(1))),
      "pilot_seed",
    ]), 'ON CONFLICT ("announcementId", "employeeId") DO NOTHING'),
    insertRows("ProductTelemetryEvent", [
      "id",
      "tenantId",
      "companyId",
      "actorUserId",
      "actorEmployeeId",
      "eventName",
      "workflow",
      "step",
      "durationMs",
      "success",
      "metadataJson",
      "occurredAt",
      "createdAt",
    ], telemetryEvents, 'ON CONFLICT ("id") DO NOTHING'),
    insertRows("BetaPilotTrialRun", [
      "id",
      "tenantId",
      "companyId",
      "status",
      "targetEmployeeMin",
      "targetEmployeeMax",
      "expectedEmployeeCount",
      "managerCount",
      "startsAt",
      "endsAt",
      "latestReadinessStatus",
      "openBlockedCount",
      "openActionRequiredCount",
      "evidenceSummaryHash",
      "notesHash",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "beta_pilot_trial_suiyuecare_2026",
      pilotTenantId,
      pilotCompanyId,
      "planned",
      20,
      50,
      employees.length,
      managers.size,
      referenceDate,
      addDays(referenceDate, 13),
      "seeded_ready_for_preflight",
      0,
      0,
      hash("pilot-seed:aggregate-evidence-only"),
      hash("pilot-seed:planned-trial"),
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]], 'ON CONFLICT ("id") DO NOTHING'),
    insertRows("AuditLog", [
      "id",
      "tenantId",
      "companyId",
      "actorUserId",
      "actorEmployeeId",
      "action",
      "entityType",
      "entityId",
      "beforeHash",
      "afterHash",
      "metadataJson",
      "createdAt",
    ], auditLogs, 'ON CONFLICT ("id") DO NOTHING'),
    buildSummarySelectSql(),
    "",
  ];

  return {
    sql: sqlSections.join("\n\n"),
    summary: {
      tenantSlug: pilotTenantSlug,
      companyCode: pilotCompanyCode,
      employeeCount: employees.length,
      managerCount: managers.size,
      departmentCount: departments.length,
      roleCount: 4,
      workScheduleCount: employees.length * scheduleDates.length,
      leavePolicyCount: leavePolicies.length,
      leaveBalanceCount: employees.length * leavePolicies.length,
      payrollRunCount: 1,
      releasedPayslipCount: employees.length,
      auditLogCount: auditLogs.length,
    },
  };
}

export function buildSupabasePilotTenantVerificationSql(schemaName = "hr_one", tenantSlug = pilotTenantSlug): string {
  const normalizedSchemaName = normalizePrivateSchemaName(schemaName);
  const schemaLiteral = sqlStringLiteral(normalizedSchemaName);
  const slugLiteral = sqlStringLiteral(tenantSlug);

  return [
    `SET search_path TO ${quoteIdentifier(normalizedSchemaName)};`,
    "WITH target AS (",
    `  SELECT t.id AS tenant_id, c.id AS company_id FROM "Tenant" t JOIN "Company" c ON c."tenantId" = t.id WHERE t.slug = ${slugLiteral} LIMIT 1`,
    ")",
    "SELECT",
    "  (SELECT count(*)::int FROM target) AS \"tenantCount\",",
    "  (SELECT count(*)::int FROM \"Company\" c JOIN target ON target.company_id = c.id) AS \"companyCount\",",
    "  (SELECT count(*)::int FROM \"Employee\" e JOIN target ON target.company_id = e.\"companyId\" WHERE e.\"employmentStatus\" = 'active') AS \"employeeCount\",",
    "  (SELECT count(*)::int FROM \"Employee\" e JOIN target ON target.company_id = e.\"companyId\" WHERE EXISTS (SELECT 1 FROM \"Employee\" report WHERE report.\"managerId\" = e.id)) AS \"managerCount\",",
    "  (SELECT count(*)::int FROM \"Department\" d JOIN target ON target.company_id = d.\"companyId\") AS \"departmentCount\",",
    "  (SELECT count(*)::int FROM \"User\" u JOIN target ON target.tenant_id = u.\"tenantId\") AS \"userCount\",",
    "  (SELECT count(*)::int FROM \"UserRole\" ur JOIN target ON target.company_id = ur.\"companyId\") AS \"userRoleCount\",",
    "  (SELECT coalesce(array_agg(DISTINCT r.key::text ORDER BY r.key::text), ARRAY[]::text[]) FROM \"Role\" r JOIN target ON target.tenant_id = r.\"tenantId\") AS \"roleKeys\",",
    "  (SELECT coalesce(array_agg(DISTINCT r.key::text ORDER BY r.key::text), ARRAY[]::text[]) FROM \"UserRole\" ur JOIN \"Role\" r ON r.id = ur.\"roleId\" JOIN target ON target.company_id = ur.\"companyId\") AS \"roleAssignmentKeys\",",
    "  (SELECT count(*)::int FROM \"AttendancePolicy\" p JOIN target ON target.company_id = p.\"companyId\" WHERE p.status = 'active') AS \"attendancePolicyCount\",",
    "  (SELECT count(*)::int FROM \"ShiftTemplate\" st JOIN target ON target.company_id = st.\"companyId\" WHERE st.status = 'active') AS \"shiftTemplateCount\",",
    "  (SELECT count(*)::int FROM \"WorkSchedule\" ws JOIN target ON target.company_id = ws.\"companyId\") AS \"workScheduleCount\",",
    "  (SELECT count(*)::int FROM \"LeavePolicy\" lp JOIN target ON target.company_id = lp.\"companyId\" WHERE lp.status = 'active') AS \"leavePolicyCount\",",
    "  (SELECT count(*)::int FROM \"LeaveBalance\" lb JOIN target ON target.company_id = lb.\"companyId\") AS \"leaveBalanceCount\",",
    "  (SELECT count(*)::int FROM \"SalaryProfile\" sp JOIN target ON target.company_id = sp.\"companyId\") AS \"salaryProfileCount\",",
    "  (SELECT count(*)::int FROM \"PayrollComplianceProfile\" pcp JOIN target ON target.company_id = pcp.\"companyId\") AS \"payrollComplianceProfileCount\",",
    "  (SELECT count(DISTINCT sir.\"employeeId\")::int FROM \"StatutoryInsuranceRecord\" sir JOIN target ON target.company_id = sir.\"companyId\" WHERE sir.status = 'enrolled') AS \"statutoryInsuranceReadyEmployeeCount\",",
    "  (SELECT count(*)::int FROM \"EmployeePaymentProfile\" pp JOIN target ON target.company_id = pp.\"companyId\" WHERE pp.status = 'active') AS \"paymentProfileCount\",",
    "  (SELECT count(*)::int FROM \"PayrollRun\" pr JOIN target ON target.company_id = pr.\"companyId\" WHERE pr.status = 'released') AS \"releasedPayrollRunCount\",",
    "  (SELECT count(*)::int FROM \"PayrollItem\" pi JOIN target ON target.company_id = pi.\"companyId\") AS \"payrollItemCount\",",
    "  (SELECT count(*)::int FROM \"Payslip\" ps JOIN target ON target.company_id = ps.\"companyId\" WHERE ps.status = 'released') AS \"releasedPayslipCount\",",
    "  (SELECT count(*)::int FROM \"CompanyAnnouncement\" ca JOIN target ON target.company_id = ca.\"companyId\" WHERE ca.status = 'published') AS \"announcementCount\",",
    "  (SELECT count(*)::int FROM \"EmployeeAnnouncementReceipt\" ar JOIN target ON target.company_id = ar.\"companyId\") AS \"announcementReceiptCount\",",
    "  (SELECT count(*)::int FROM \"FormTemplate\" ft JOIN target ON target.company_id = ft.\"companyId\" WHERE ft.status = 'active') AS \"formTemplateCount\",",
    "  (SELECT count(*)::int FROM \"WorkflowTemplateStep\" wts JOIN target ON target.company_id = wts.\"companyId\") AS \"workflowStepCount\",",
    "  (SELECT count(*)::int FROM \"RuleVersion\" rv JOIN target ON target.company_id = rv.\"companyId\" WHERE rv.status = 'active') AS \"activeRuleVersionCount\",",
    "  (SELECT count(*)::int FROM \"ProductTelemetryEvent\" pte JOIN target ON target.company_id = pte.\"companyId\") AS \"telemetryEventCount\",",
    "  (SELECT count(*)::int FROM \"BetaPilotTrialRun\" bptr JOIN target ON target.company_id = bptr.\"companyId\") AS \"betaPilotTrialRunCount\",",
    "  (SELECT count(*)::int FROM \"AuditLog\" al JOIN target ON target.company_id = al.\"companyId\") AS \"auditLogCount\",",
    "  (SELECT coalesce(array_agg(DISTINCT al.\"entityType\" ORDER BY al.\"entityType\"), ARRAY[]::text[]) FROM \"AuditLog\" al JOIN target ON target.company_id = al.\"companyId\") AS \"auditEntityTypes\",",
    "  (SELECT count(*)::int FROM information_schema.table_privileges WHERE table_schema = current_schema() AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')) AS \"exposedTablePrivilegeCount\",",
    `  has_schema_privilege('anon', ${schemaLiteral}, 'USAGE') AS "anonUsage",`,
    `  has_schema_privilege('authenticated', ${schemaLiteral}, 'USAGE') AS "authenticatedUsage",`,
    "  (",
    "    SELECT count(*)::int",
    "    FROM pg_proc p",
    "    JOIN pg_namespace n ON n.oid = p.pronamespace",
    "    WHERE n.nspname = 'public'",
    "      AND p.prosecdef",
    "      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))",
    "  ) AS \"publicSecurityDefinerExecuteCount\";",
    "",
  ].join("\n");
}

export function buildSupabasePilotTenantVerificationChecks(
  snapshot: SupabasePilotTenantVerificationSnapshot,
): SupabasePilotTenantVerificationCheck[] {
  const coreRoles = ["employee", "hr_admin", "manager", "owner"];
  const missingRoles = coreRoles.filter((role) => !snapshot.roleKeys.includes(role));
  const missingAssignments = coreRoles.filter((role) => !snapshot.roleAssignmentKeys.includes(role));
  const missingAuditTypes = [
    "pilot_seed",
    "employee",
    "salary_profile",
    "employee_payment_profile",
    "payroll_run",
    "payslip",
    "law_rule",
  ].filter((entityType) => !snapshot.auditEntityTypes.includes(entityType));

  return [
    check("pilot tenant", snapshot.tenantCount === 1 && snapshot.companyCount === 1, `${snapshot.tenantCount} tenant, ${snapshot.companyCount} company`),
    check("20-50 person cohort", snapshot.employeeCount >= 20 && snapshot.employeeCount <= 50, `${snapshot.employeeCount} active employee(s)`),
    check("manager reporting line", snapshot.managerCount >= 1, `${snapshot.managerCount} manager(s) with direct reports`),
    check("departments", snapshot.departmentCount >= 2, `${snapshot.departmentCount} department(s)`),
    check("users and roles", snapshot.userCount >= snapshot.employeeCount && missingRoles.length === 0 && missingAssignments.length === 0, missingRoles.length || missingAssignments.length ? `missing roles=${missingRoles.join(",") || "none"} assignments=${missingAssignments.join(",") || "none"}` : `${snapshot.userCount} user(s), ${snapshot.userRoleCount} assignment(s)`),
    check("attendance foundation", snapshot.attendancePolicyCount >= 1 && snapshot.shiftTemplateCount >= 1 && snapshot.workScheduleCount >= snapshot.employeeCount * 5, `${snapshot.attendancePolicyCount} policy, ${snapshot.shiftTemplateCount} shift, ${snapshot.workScheduleCount} schedule row(s)`),
    check("leave foundation", snapshot.leavePolicyCount >= 3 && snapshot.leaveBalanceCount >= snapshot.employeeCount * 3, `${snapshot.leavePolicyCount} policies, ${snapshot.leaveBalanceCount} balances`),
    check("payroll profile coverage", snapshot.salaryProfileCount >= snapshot.employeeCount && snapshot.payrollComplianceProfileCount >= snapshot.employeeCount && snapshot.paymentProfileCount >= snapshot.employeeCount && snapshot.statutoryInsuranceReadyEmployeeCount >= snapshot.employeeCount, `${snapshot.salaryProfileCount} salary, ${snapshot.paymentProfileCount} payment, ${snapshot.statutoryInsuranceReadyEmployeeCount} statutory ready`),
    check("released payroll rehearsal", snapshot.releasedPayrollRunCount >= 1 && snapshot.payrollItemCount >= snapshot.employeeCount * 3 && snapshot.releasedPayslipCount >= snapshot.employeeCount, `${snapshot.releasedPayrollRunCount} released run, ${snapshot.payrollItemCount} item(s), ${snapshot.releasedPayslipCount} payslip(s)`),
    check("announcement and forms", snapshot.announcementCount >= 1 && snapshot.announcementReceiptCount >= snapshot.employeeCount && snapshot.formTemplateCount >= 1 && snapshot.workflowStepCount >= 1, `${snapshot.announcementCount} announcement, ${snapshot.announcementReceiptCount} receipt(s), ${snapshot.formTemplateCount} form(s)`),
    check("rules and telemetry", snapshot.activeRuleVersionCount >= 3 && snapshot.telemetryEventCount >= 10 && snapshot.betaPilotTrialRunCount >= 1, `${snapshot.activeRuleVersionCount} active rule version(s), ${snapshot.telemetryEventCount} telemetry event(s), ${snapshot.betaPilotTrialRunCount} trial run(s)`),
    check("audit coverage", snapshot.auditLogCount >= 7 && missingAuditTypes.length === 0, missingAuditTypes.length ? `missing ${missingAuditTypes.join(", ")}` : `${snapshot.auditLogCount} audit event(s)`),
    check("Supabase browser role schema usage", !snapshot.anonUsage && !snapshot.authenticatedUsage, `anon=${snapshot.anonUsage ? "allowed" : "blocked"}, authenticated=${snapshot.authenticatedUsage ? "allowed" : "blocked"}`),
    check("Supabase browser table grants", snapshot.exposedTablePrivilegeCount === 0, `${snapshot.exposedTablePrivilegeCount} anon/authenticated table privilege(s)`),
    check("Supabase public security-definer RPC exposure", snapshot.publicSecurityDefinerExecuteCount === 0, `${snapshot.publicSecurityDefinerExecuteCount} callable public security-definer function(s)`),
  ];
}

export function supabasePilotTenantVerificationPassed(checks: SupabasePilotTenantVerificationCheck[]) {
  return checks.every((item) => item.passed);
}

function buildDepartments() {
  return [
    { id: "dept_suiyuecare_exec", parentDepartmentId: null, name: "Executive Office", code: "EXEC" },
    { id: "dept_suiyuecare_hr", parentDepartmentId: "dept_suiyuecare_exec", name: "People Operations", code: "HR" },
    { id: "dept_suiyuecare_ops", parentDepartmentId: "dept_suiyuecare_exec", name: "Administration", code: "OPS" },
    { id: "dept_suiyuecare_care", parentDepartmentId: "dept_suiyuecare_exec", name: "Care Services", code: "CARE" },
  ];
}

function buildRoles() {
  return [
    { key: "owner" as const, name: "Owner", description: "Company owner and executive administrator." },
    { key: "hr_admin" as const, name: "HR Admin", description: "HR operations and payroll administrator." },
    { key: "manager" as const, name: "Manager", description: "People manager with approval inbox." },
    { key: "employee" as const, name: "Employee", description: "Employee self-service access." },
  ];
}

function buildEmployees(): PilotEmployee[] {
  const leadership: PilotEmployee[] = [
    employee("E001", "owner", "Pilot Owner", "Executive Owner", "dept_suiyuecare_exec", null, "owner", 88_000, 3_000, 1_500),
    employee("E002", "hr", "Pilot HR Admin", "HR Manager", "dept_suiyuecare_hr", "employee_suiyuecare_e001", "hr_admin", 62_000, 2_500, 1_100),
    employee("E003", "ops_manager", "Pilot Admin Director", "Administration Director", "dept_suiyuecare_ops", "employee_suiyuecare_e001", "manager", 70_000, 2_500, 1_200),
    employee("E004", "care_manager", "Pilot Care Director", "Care Services Director", "dept_suiyuecare_care", "employee_suiyuecare_e001", "manager", 68_000, 2_500, 1_200),
  ];
  const employees = Array.from({ length: 21 }, (_, index) => {
    const sequence = index + 5;
    const departmentId = sequence <= 14 ? "dept_suiyuecare_ops" : "dept_suiyuecare_care";
    const managerId = sequence <= 14 ? "employee_suiyuecare_e003" : "employee_suiyuecare_e004";
    return employee(
      `E${String(sequence).padStart(3, "0")}`,
      `employee_${String(sequence).padStart(3, "0")}`,
      `Pilot Employee ${String(sequence - 4).padStart(2, "0")}`,
      sequence <= 14 ? "Operations Specialist" : "Care Specialist",
      departmentId,
      managerId,
      "employee",
      36_000 + ((sequence - 5) % 7) * 1_500,
      2_000,
      800,
    );
  });
  return [...leadership, ...employees];
}

function employee(
  employeeNo: string,
  alias: string,
  displayName: string,
  jobTitle: string,
  departmentId: string,
  managerId: string | null,
  roleKey: PilotEmployee["roleKey"],
  baseSalary: number,
  allowance: number,
  deduction: number,
): PilotEmployee {
  const sequence = Number(employeeNo.slice(1));
  return {
    id: `employee_suiyuecare_${employeeNo.toLowerCase()}`,
    userId: alias === "owner" ? pilotOwnerUserId : `user_suiyuecare_pilot_${alias}`,
    employeeNo,
    displayName,
    email: `${alias}@suiyuecare.com`,
    departmentId,
    managerId,
    jobTitle,
    roleKey,
    hireDate: new Date(Date.UTC(2022 + (sequence % 4), sequence % 12, 1)),
    baseSalary,
    allowance,
    deduction,
  };
}

function buildLeavePolicies() {
  return [
    {
      id: "leave_policy_suiyuecare_annual",
      code: "annual",
      name: "Annual leave",
      annualUnits: 7,
      attachmentRequired: false,
      statutoryCategory: "annual_leave",
      eligibilityRule: "after_six_months",
      payRatePercent: 100,
      annualLimitNote: "Pilot baseline; HR reviews entitlement with active rule versions.",
      minNoticeDays: 1,
      carryoverLimitUnits: 10,
      paid: true,
    },
    {
      id: "leave_policy_suiyuecare_sick",
      code: "sick",
      name: "Sick leave",
      annualUnits: 30,
      attachmentRequired: true,
      statutoryCategory: "sick_leave",
      eligibilityRule: "all_employees",
      payRatePercent: 50,
      annualLimitNote: "Pilot baseline for ordinary sick leave.",
      minNoticeDays: 0,
      carryoverLimitUnits: null,
      paid: true,
    },
    {
      id: "leave_policy_suiyuecare_personal",
      code: "personal",
      name: "Personal leave",
      annualUnits: 14,
      attachmentRequired: false,
      statutoryCategory: "personal_leave",
      eligibilityRule: "all_employees",
      payRatePercent: 0,
      annualLimitNote: "Pilot baseline for personal leave.",
      minNoticeDays: 1,
      carryoverLimitUnits: null,
      paid: false,
    },
  ];
}

function buildPayrollRows(employees: PilotEmployee[], referenceDate: Date) {
  const periodStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1));
  const periodEnd = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 0));
  const payDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 5));
  const runId = `payroll_run_suiyuecare_${dateKey(periodStart)}_${dateKey(periodEnd)}`;
  const itemRows: SqlValue[][] = [];
  const payslipRows: SqlValue[][] = [];
  let grossTotal = 0;
  let deductionTotal = 0;
  let netTotal = 0;

  for (const employee of employees) {
    const tax = Math.round(employee.baseSalary * 0.03);
    const grossPay = employee.baseSalary + employee.allowance;
    const deductions = employee.deduction + tax;
    const netPay = grossPay - deductions;
    grossTotal += grossPay;
    deductionTotal += deductions;
    netTotal += netPay;
    itemRows.push(
      [
        `payroll_item_${employee.employeeNo.toLowerCase()}_base`,
        pilotTenantId,
        pilotCompanyId,
        runId,
        employee.id,
        "earning",
        "base_salary",
        "Base salary",
        employee.baseSalary,
        1,
        payrollRuleVersionId,
        json({ source: "pilot_seed", amount: "redacted_in_logs" }),
        referenceDate,
      ],
      [
        `payroll_item_${employee.employeeNo.toLowerCase()}_meal`,
        pilotTenantId,
        pilotCompanyId,
        runId,
        employee.id,
        "allowance",
        "meal",
        "Meal allowance",
        employee.allowance,
        1,
        payrollRuleVersionId,
        json({ source: "pilot_seed", amount: "redacted_in_logs" }),
        referenceDate,
      ],
      [
        `payroll_item_${employee.employeeNo.toLowerCase()}_deduction`,
        pilotTenantId,
        pilotCompanyId,
        runId,
        employee.id,
        "deduction",
        "pilot_deductions",
        "Pilot deductions",
        deductions,
        1,
        payrollRuleVersionId,
        json({ source: "pilot_seed", amount: "redacted_in_logs" }),
        referenceDate,
      ],
    );
    payslipRows.push([
      `payslip_${employee.employeeNo.toLowerCase()}_${dateKey(periodStart)}`,
      pilotTenantId,
      pilotCompanyId,
      runId,
      employee.id,
      grossPay,
      deductions,
      netPay,
      "released",
      addHours(payDate, 2),
      referenceDate,
      referenceDate,
    ]);
  }

  return {
    runId,
    periodStart,
    periodEnd,
    payDate,
    grossTotal,
    deductionTotal,
    netTotal,
    items: itemRows,
    payslips: payslipRows,
  };
}

function buildLawRuleSql(referenceDate: Date) {
  const validation = validateTaiwanLaborStandardsRuleSet(defaultTaiwanLaborStandardsConfig, referenceDate.toISOString());
  const sourceFreshness = summarizeLegalSourceFreshness(
    evaluateLegalSourceFreshness(defaultTaiwanLaborStandardsConfig.sources, { now: referenceDate }),
  );
  const testCases = buildRuleVersionTestCases(validation);
  const rules = [
    {
      id: "law_rule_suiyuecare_overtime",
      ruleKey: "tw_labor_standards_overtime",
      name: "Taiwan Labor Standards Act overtime",
      description: "Configurable Article 24 overtime tiers with official source references.",
      category: "overtime",
      versionId: "rule_version_suiyuecare_pilot_overtime_2026_06",
      version: "2026.06-pilot",
      definition: {
        type: "taiwan_labor_standards_overtime",
        regularDayOvertimeTiers: defaultTaiwanLaborStandardsConfig.regularDayOvertimeTiers,
        emergencyOvertimeMultiplier: defaultTaiwanLaborStandardsConfig.emergencyOvertimeMultiplier,
        sources: defaultTaiwanLaborStandardsConfig.sources.filter((source) => source.id === "tw-lsa-article-24"),
        inputs: ["regularMinutes", "overtimeMinutes", "workDate"],
        outputs: ["overtimeBuckets"],
        aiUse: "assistive_explanations_only",
        validationSummary: validation,
        sourceFreshness,
      },
    },
    {
      id: "law_rule_suiyuecare_labor_settings",
      ruleKey: "tw_labor_standards_settings",
      name: "Taiwan labor standards settings",
      description: "Company-adjustable Taiwan labor standards configuration with official source references.",
      category: "labor_standards",
      versionId: "rule_version_suiyuecare_pilot_labor_2026_01",
      version: defaultTaiwanLaborStandardsConfig.version,
      definition: {
        type: "taiwan_labor_standards_settings",
        taiwanLaborStandards: defaultTaiwanLaborStandardsConfig,
        sources: defaultTaiwanLaborStandardsConfig.sources,
        validationSummary: validation,
        sourceFreshness,
      },
    },
    {
      id: "law_rule_suiyuecare_payroll",
      ruleKey: "tw_payroll_mvp",
      name: "Taiwan payroll MVP formula",
      description: "Configurable payroll formula placeholder for monthly salary, allowances, deductions, and overtime.",
      category: "payroll",
      versionId: payrollRuleVersionId,
      version: "2026.06-pilot",
      definition: {
        type: "taiwan_payroll_mvp",
        taiwanLaborStandards: defaultTaiwanLaborStandardsConfig,
        standardMonthlyHours: defaultTaiwanLaborStandardsConfig.payrollStandardMonthlyHours,
        formulas: ["baseSalary", "recurringAllowances", "approvedOvertime", "recurringDeductions"],
        validationSummary: validation,
        sourceFreshness,
      },
    },
  ];

  return [
    upsertRows("LawRule", [
      "id",
      "tenantId",
      "companyId",
      "jurisdiction",
      "ruleKey",
      "name",
      "description",
      "category",
      "status",
      "createdAt",
      "updatedAt",
    ], rules.map((rule) => [
      rule.id,
      pilotTenantId,
      pilotCompanyId,
      "TW",
      rule.ruleKey,
      rule.name,
      rule.description,
      rule.category,
      "active",
      referenceDate,
      referenceDate,
    ])),
    insertRows("RuleVersion", [
      "id",
      "tenantId",
      "companyId",
      "lawRuleId",
      "version",
      "effectiveFrom",
      "definitionJson",
      "testCasesJson",
      "status",
      "createdAt",
      "updatedAt",
    ], rules.map((rule) => [
      rule.versionId,
      pilotTenantId,
      pilotCompanyId,
      rule.id,
      rule.version,
      new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1)),
      json(rule.definition),
      json(testCases),
      "active",
      referenceDate,
      referenceDate,
    ]), 'ON CONFLICT ("lawRuleId", "version") DO NOTHING'),
  ];
}

function buildAuditLogs(referenceDate: Date): SqlValue[][] {
  const entityTypes = [
    "pilot_seed",
    "employee",
    "salary_profile",
    "payroll_compliance_profile",
    "employee_payment_profile",
    "payroll_run",
    "payslip",
    "law_rule",
  ];
  return entityTypes.map((entityType, index) => [
    `audit_suiyuecare_pilot_${entityType}`,
    pilotTenantId,
    pilotCompanyId,
    pilotOwnerUserId,
    "employee_suiyuecare_e001",
    "create",
    entityType,
    entityType === "pilot_seed" ? pilotTenantId : `${pilotCompanyId}:${entityType}`,
    null,
    hash(`${pilotCompanyId}:${entityType}:seeded`),
    json({
      source: "supabase_pilot_seed",
      seedType: entityType,
      pii: "not_logged",
      salary: "not_logged",
      bankAccount: "not_logged",
      nationalId: "not_logged",
      healthData: "not_logged",
    }),
    addMinutes(referenceDate, index),
  ]);
}

function buildTelemetryEvents(referenceDate: Date): SqlValue[][] {
  const baseEvents: Array<[string, string, string, number | null, boolean, Record<string, unknown>]> = [
    ["leave_request_success", "leave", "first_success", 52_000, true, {}],
    ["leave_request_success", "leave", "first_success", 56_000, true, {}],
    ["manager_approval_done", "approval", "manager_leave", 12_000, true, {}],
    ["manager_approval_done", "approval", "manager_leave", 14_000, true, {}],
    ["form_template_created", "form_builder", "hr_self_serve", null, true, { engineeringSupport: false }],
    ["form_template_created", "form_builder", "hr_self_serve", null, true, { engineeringSupport: false }],
    ["form_template_created", "form_builder", "hr_self_serve", null, true, { engineeringSupport: false }],
    ["form_template_created", "form_builder", "hr_self_serve", null, true, { engineeringSupport: false }],
    ["form_template_created", "form_builder", "hr_self_serve", null, true, { engineeringSupport: true }],
  ];
  const mobileEvents = Array.from({ length: 20 }, (_, index) => [
    index % 2 === 0 ? "mobile_task_started" : "mobile_task_completed",
    "mobile_task",
    "employee_self_service",
    null,
    true,
    {},
  ] as [string, string, string, number | null, boolean, Record<string, unknown>]);

  return [...baseEvents, ...mobileEvents].map(([eventName, workflow, step, durationMs, success, metadata], index) => [
    `telemetry_suiyuecare_pilot_${index + 1}`,
    pilotTenantId,
    pilotCompanyId,
    pilotOwnerUserId,
    "employee_suiyuecare_e001",
    eventName,
    workflow,
    step,
    durationMs,
    success,
    json(metadata),
    addMinutes(referenceDate, index),
    addMinutes(referenceDate, index),
  ]);
}

const statutoryInsuranceTypes = [
  "labor_insurance",
  "employment_insurance",
  "occupational_accident_insurance",
  "national_health_insurance",
  "labor_pension",
];

function buildWeekdayScheduleDates(referenceDate: Date, weekdayCount: number) {
  const monday = addDays(referenceDate, -((referenceDate.getUTCDay() + 6) % 7));
  const dates: Date[] = [];
  for (let offset = 0; dates.length < weekdayCount; offset += 1) {
    const date = addDays(monday, offset);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(date);
  }
  return dates;
}

function buildCollisionGuardSql() {
  return [
    "DO $$",
    "BEGIN",
    `  IF EXISTS (SELECT 1 FROM "Tenant" WHERE slug = ${sqlStringLiteral(pilotTenantSlug)} AND id <> ${sqlStringLiteral(pilotTenantId)}) THEN`,
    "    RAISE EXCEPTION 'HR One pilot tenant slug already exists with a different id.';",
    "  END IF;",
    "END $$;",
  ].join("\n");
}

function buildSummarySelectSql() {
  return [
    "SELECT",
    "  (SELECT count(*)::int FROM \"Employee\" WHERE \"companyId\" = 'company_suiyuecare_pilot') AS \"employeeCount\",",
    "  (SELECT count(*)::int FROM \"WorkSchedule\" WHERE \"companyId\" = 'company_suiyuecare_pilot') AS \"workScheduleCount\",",
    "  (SELECT count(*)::int FROM \"Payslip\" WHERE \"companyId\" = 'company_suiyuecare_pilot' AND status = 'released') AS \"releasedPayslipCount\",",
    "  (SELECT count(*)::int FROM \"AuditLog\" WHERE \"companyId\" = 'company_suiyuecare_pilot') AS \"auditLogCount\";",
  ].join("\n");
}

function upsertRows(tableName: string, columns: string[], rows: SqlValue[][]) {
  const updates = columns
    .filter((column) => column !== "id" && column !== "createdAt")
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(", ");
  return insertRows(tableName, columns, rows, updates ? `ON CONFLICT ("id") DO UPDATE SET ${updates}` : 'ON CONFLICT ("id") DO NOTHING');
}

function insertRows(tableName: string, columns: string[], rows: SqlValue[][], conflictSql: string) {
  if (rows.length === 0) return "";
  return [
    `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(", ")}) VALUES`,
    rows.map((row) => `  (${row.map(sqlValue).join(", ")})`).join(",\n"),
    `${conflictSql};`,
  ].join("\n");
}

function check(name: string, passed: boolean, detail: string): SupabasePilotTenantVerificationCheck {
  return { name, passed, detail };
}

function roleId(roleKey: PilotEmployee["roleKey"]) {
  return `role_suiyuecare_${roleKey}`;
}

function json(value: unknown): SqlValue {
  return { json: value };
}

function sqlValue(value: SqlValue): string {
  if (value === null) return "NULL";
  if (value instanceof Date) return `${sqlStringLiteral(value.toISOString())}::timestamptz`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot serialize non-finite number.");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object" && "json" in value) {
    return `${sqlStringLiteral(JSON.stringify(value.json))}::jsonb`;
  }
  return sqlStringLiteral(value);
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function withUtcTime(date: Date, hours: number, minutes = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
