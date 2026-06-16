import { createHash } from "node:crypto";
import { normalizePrivateSchemaName } from "./supabase-bootstrap";
import { taiwanStatutoryLeaveRequirements } from "@/server/leave/statutory";
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
  calendarDayCount: number;
  approvedCalendarReviewCount: number;
  completeLaborRosterProfileCount: number;
  approvedPolicyDocumentCount: number;
  activeWorkRuleCount: number;
  workRuleAcknowledgementCount: number;
  verifiedFileStorageCount: number;
  externalNotificationSettingCount: number;
  verifiedPayrollPaymentSecurityCount: number;
  readyWorktimeAgreementCount: number;
  commercialSubscriptionCount: number;
  backupPostureConfiguredCount: number;
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
  const currentYear = referenceDate.getUTCFullYear();
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
      "business_pilot",
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
      "contractStartsAt",
      "contractEndsAt",
      "renewalNoticeDays",
      "billingContactEmail",
      "contractRef",
      "contractHash",
      "paymentCollectionMode",
      "verificationStatus",
      "lastReviewedAt",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "subscription_suiyuecare_pilot",
      pilotTenantId,
      "business_pilot",
      "active",
      50,
      employees.length,
      addDays(referenceDate, 14),
      referenceDate,
      addDays(referenceDate, 365),
      30,
      "hr-pilot@suiyuecare.com",
      "contract://suiyuecare/hr-one-pilot-2026",
      hash("suiyuecare:hr-one:business-pilot:contract:2026"),
      "manual_invoice",
      "verified",
      referenceDate,
      pilotOwnerUserId,
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
      true,
      "Supabase Auth",
      "https://aruncclorusswpfnpgsn.supabase.co/auth/v1",
      "authenticated",
      "https://aruncclorusswpfnpgsn.supabase.co/auth/v1/.well-known/jwks.json",
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
      true,
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
    upsertRows("CompanyFileStorageSetting", [
      "id",
      "tenantId",
      "companyId",
      "provider",
      "bucketName",
      "region",
      "basePrefix",
      "kmsKeyRef",
      "malwareScanningRequired",
      "signedUrlTtlMinutes",
      "maxFileSizeMb",
      "allowedMimeTypesJson",
      "retentionDays",
      "verificationStatus",
      "lastVerifiedAt",
      "verificationNote",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "file_storage_suiyuecare_pilot",
      pilotTenantId,
      pilotCompanyId,
      "supabase_storage",
      "suiyuecare-hrone-documents",
      "ap-northeast-2",
      "hr-one/pilot",
      "vault://suiyuecare/hr-one/document-storage-key",
      true,
      10,
      25,
      json(["application/pdf", "image/jpeg", "image/png", "text/csv"]),
      2555,
      "verified",
      referenceDate,
      "Pilot object-storage references verified without exposing storage secrets.",
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("CompanyPayrollPaymentSecuritySetting", [
      "id",
      "tenantId",
      "companyId",
      "tokenVaultProvider",
      "tokenVaultRef",
      "kmsKeyRef",
      "bankFileFormat",
      "bankFormatVersion",
      "bankFileColumnOrder",
      "bankFormatVerified",
      "verificationStatus",
      "lastVerifiedAt",
      "verificationNote",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "payroll_payment_security_suiyuecare_pilot",
      pilotTenantId,
      pilotCompanyId,
      "supabase_vault",
      "vault://suiyuecare/hr-one/payroll-payment",
      "vault://suiyuecare/hr-one/payroll-payment-key",
      "tw_bank_transfer_csv",
      "2026.06",
      "employee_no,bank_code,branch_code,account_token_ref,amount,currency",
      true,
      "verified",
      referenceDate,
      "Pilot bank-export format stores token references only; raw account numbers stay outside HR One logs.",
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    upsertRows("CompanyOperationalResilienceSetting", [
      "id",
      "tenantId",
      "companyId",
      "backupProvider",
      "backupRegion",
      "backupSchedule",
      "backupRetentionDays",
      "backupEncryptionKeyRef",
      "backupEnabled",
      "lastBackupCompletedAt",
      "restoreDrillTestedAt",
      "restoreDrillStatus",
      "restoreDrillTicket",
      "recoveryTimeObjectiveHours",
      "recoveryPointObjectiveHours",
      "verificationStatus",
      "verificationNote",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "operational_resilience_suiyuecare_pilot",
      pilotTenantId,
      pilotCompanyId,
      "supabase_managed_postgres",
      "ap-northeast-2",
      "daily",
      30,
      "vault://suiyuecare/hr-one/backup-key",
      true,
      referenceDate,
      null,
      "not_tested",
      null,
      24,
      24,
      "pending_restore_drill",
      "Managed backup posture is configured; a real restore drill must be completed before production launch.",
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
    upsertRows("CompanyWorktimeAgreementSetting", [
      "id",
      "tenantId",
      "companyId",
      "approvalType",
      "approvalOnFile",
      "evidenceRef",
      "effectiveFrom",
      "effectiveTo",
      "monthlyOvertimeLimitMinutes",
      "threeMonthOvertimeLimitMinutes",
      "localAuthorityReportRequired",
      "localAuthorityReportFiled",
      "verificationStatus",
      "verificationNote",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "worktime_agreement_suiyuecare_pilot",
      pilotTenantId,
      pilotCompanyId,
      "labor_management_conference",
      true,
      "evidence://suiyuecare/worktime-agreement/2026-06",
      new Date(Date.UTC(currentYear, 0, 1)),
      new Date(Date.UTC(currentYear, 11, 31)),
      54 * 60,
      138 * 60,
      false,
      false,
      "verified",
      "Pilot labor-management conference evidence reference verified by HR.",
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    ...buildCompanyCalendarSql(referenceDate, currentYear),
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
      policy.accrualMethod,
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
    insertRows("EmployeeLaborRosterProfile", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "status",
      "legalNameHash",
      "nationalIdHash",
      "birthDate",
      "gender",
      "nationality",
      "registeredAddressHash",
      "emergencyContactHash",
      "educationSummary",
      "workExperienceSummary",
      "rosterSourceRef",
      "requiredFieldsJson",
      "missingFieldsJson",
      "verificationStatus",
      "lastReviewedAt",
      "reviewedByUserId",
      "createdAt",
      "updatedAt",
    ], employees.map((employee, index) => [
      `labor_roster_${employee.employeeNo.toLowerCase()}`,
      pilotTenantId,
      pilotCompanyId,
      employee.id,
      "complete",
      hash(`labor-roster:legal-name:${employee.employeeNo}`),
      hash(`labor-roster:national-id:${employee.employeeNo}`),
      new Date(Date.UTC(1988 + (index % 16), index % 12, 1)),
      index % 2 === 0 ? "not_disclosed" : "not_disclosed",
      "TW",
      hash(`labor-roster:registered-address:${employee.employeeNo}`),
      hash(`labor-roster:emergency-contact:${employee.employeeNo}`),
      "verified-summary-only",
      "verified-summary-only",
      `evidence://suiyuecare/labor-roster/${employee.employeeNo}`,
      json(["legalName", "nationalId", "birthDate", "nationality", "registeredAddress", "emergencyContact"]),
      json([]),
      "verified",
      referenceDate,
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]), [
      'ON CONFLICT ("employeeId") DO UPDATE SET',
      '  "status" = EXCLUDED."status",',
      '  "legalNameHash" = EXCLUDED."legalNameHash",',
      '  "nationalIdHash" = EXCLUDED."nationalIdHash",',
      '  "birthDate" = EXCLUDED."birthDate",',
      '  "gender" = EXCLUDED."gender",',
      '  "nationality" = EXCLUDED."nationality",',
      '  "registeredAddressHash" = EXCLUDED."registeredAddressHash",',
      '  "emergencyContactHash" = EXCLUDED."emergencyContactHash",',
      '  "educationSummary" = EXCLUDED."educationSummary",',
      '  "workExperienceSummary" = EXCLUDED."workExperienceSummary",',
      '  "rosterSourceRef" = EXCLUDED."rosterSourceRef",',
      '  "requiredFieldsJson" = EXCLUDED."requiredFieldsJson",',
      '  "missingFieldsJson" = EXCLUDED."missingFieldsJson",',
      '  "verificationStatus" = EXCLUDED."verificationStatus",',
      '  "lastReviewedAt" = EXCLUDED."lastReviewedAt",',
      '  "reviewedByUserId" = EXCLUDED."reviewedByUserId",',
      '  "updatedAt" = EXCLUDED."updatedAt"',
    ].join("\n")),
    ...buildLawRuleSql(referenceDate),
    upsertRows("CompanyPolicyDocument", [
      "id",
      "tenantId",
      "companyId",
      "title",
      "category",
      "status",
      "version",
      "sourceRef",
      "excerpt",
      "keywordsJson",
      "approvedByUserId",
      "approvedAt",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], buildPolicyDocuments(referenceDate)),
    upsertRows("CompanyWorkRule", [
      "id",
      "tenantId",
      "companyId",
      "title",
      "category",
      "summary",
      "version",
      "status",
      "reviewStatus",
      "sourceRef",
      "contentHash",
      "acknowledgementRequired",
      "effectiveFrom",
      "publishedAt",
      "createdByUserId",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      "work_rule_suiyuecare_employee_handbook_2026",
      pilotTenantId,
      pilotCompanyId,
      "Pilot employee handbook",
      "work_rules",
      "Clock in/out, leave, overtime, announcements, privacy, and AI-assisted HR decisions remain human-reviewed.",
      "2026.06",
      "active",
      "approved",
      "policy://suiyuecare/employee-handbook/2026.06",
      hash("suiyuecare:employee-handbook:2026.06"),
      true,
      referenceDate,
      referenceDate,
      pilotOwnerUserId,
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]]),
    insertRows("EmployeeWorkRuleAcknowledgement", [
      "id",
      "tenantId",
      "companyId",
      "employeeId",
      "workRuleId",
      "version",
      "acknowledgementHash",
      "source",
      "acknowledgedAt",
      "createdAt",
    ], employees.map((employee, index) => [
      `work_rule_ack_${employee.employeeNo.toLowerCase()}_handbook_2026`,
      pilotTenantId,
      pilotCompanyId,
      employee.id,
      "work_rule_suiyuecare_employee_handbook_2026",
      "2026.06",
      hash(`work-rule-ack:${employee.employeeNo}:2026.06`),
      "pilot_seed",
      addMinutes(referenceDate, index + 1),
      referenceDate,
    ]), 'ON CONFLICT ("employeeId", "workRuleId") DO NOTHING'),
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
    "  (SELECT count(*)::int FROM \"CompanyCalendarDay\" ccd JOIN target ON target.company_id = ccd.\"companyId\") AS \"calendarDayCount\",",
    "  (SELECT count(*)::int FROM \"CompanyCalendarReview\" ccr JOIN target ON target.company_id = ccr.\"companyId\" WHERE ccr.\"reviewStatus\" = 'approved') AS \"approvedCalendarReviewCount\",",
    "  (SELECT count(*)::int FROM \"EmployeeLaborRosterProfile\" elrp JOIN target ON target.company_id = elrp.\"companyId\" WHERE elrp.status = 'complete' AND elrp.\"verificationStatus\" = 'verified') AS \"completeLaborRosterProfileCount\",",
    "  (SELECT count(*)::int FROM \"CompanyPolicyDocument\" cpd JOIN target ON target.company_id = cpd.\"companyId\" WHERE cpd.status = 'approved') AS \"approvedPolicyDocumentCount\",",
    "  (SELECT count(*)::int FROM \"CompanyWorkRule\" cwr JOIN target ON target.company_id = cwr.\"companyId\" WHERE cwr.status = 'active' AND cwr.\"reviewStatus\" = 'approved' AND cwr.\"acknowledgementRequired\" = TRUE) AS \"activeWorkRuleCount\",",
    "  (SELECT count(*)::int FROM \"EmployeeWorkRuleAcknowledgement\" ewra JOIN target ON target.company_id = ewra.\"companyId\") AS \"workRuleAcknowledgementCount\",",
    "  (SELECT count(*)::int FROM \"CompanyFileStorageSetting\" cfss JOIN target ON target.company_id = cfss.\"companyId\" WHERE cfss.provider <> 'demo_object_storage' AND cfss.\"kmsKeyRef\" IS NOT NULL AND cfss.\"verificationStatus\" = 'verified' AND cfss.\"lastVerifiedAt\" IS NOT NULL) AS \"verifiedFileStorageCount\",",
    "  (SELECT count(*)::int FROM \"CompanyNotificationSetting\" cns JOIN target ON target.company_id = cns.\"companyId\" WHERE cns.\"externalSummaryOnly\" = TRUE AND (cns.\"emailEnabled\" OR cns.\"lineEnabled\" OR cns.\"slackEnabled\" OR cns.\"teamsEnabled\")) AS \"externalNotificationSettingCount\",",
    "  (SELECT count(*)::int FROM \"CompanyPayrollPaymentSecuritySetting\" cppss JOIN target ON target.company_id = cppss.\"companyId\" WHERE cppss.\"tokenVaultProvider\" <> 'not_configured' AND cppss.\"tokenVaultRef\" IS NOT NULL AND cppss.\"kmsKeyRef\" IS NOT NULL AND cppss.\"bankFileFormat\" <> 'tw_bank_csv_placeholder' AND cppss.\"bankFormatVerified\" = TRUE AND cppss.\"verificationStatus\" = 'verified' AND cppss.\"lastVerifiedAt\" IS NOT NULL) AS \"verifiedPayrollPaymentSecurityCount\",",
    "  (SELECT count(*)::int FROM \"CompanyWorktimeAgreementSetting\" cwas JOIN target ON target.company_id = cwas.\"companyId\" WHERE cwas.\"approvalOnFile\" = TRUE AND cwas.\"evidenceRef\" IS NOT NULL AND cwas.\"verificationStatus\" = 'verified') AS \"readyWorktimeAgreementCount\",",
    "  (SELECT count(*)::int FROM \"TenantSubscription\" ts JOIN target ON target.tenant_id = ts.\"tenantId\" WHERE ts.plan <> 'demo' AND ts.status = 'active' AND ts.\"verificationStatus\" = 'verified' AND ts.\"contractRef\" IS NOT NULL AND ts.\"contractHash\" IS NOT NULL) AS \"commercialSubscriptionCount\",",
    "  (SELECT count(*)::int FROM \"CompanyOperationalResilienceSetting\" cors JOIN target ON target.company_id = cors.\"companyId\" WHERE cors.\"backupEnabled\" = TRUE AND cors.\"backupProvider\" <> 'not_configured' AND cors.\"backupRetentionDays\" >= 30 AND cors.\"backupEncryptionKeyRef\" IS NOT NULL AND cors.\"lastBackupCompletedAt\" IS NOT NULL) AS \"backupPostureConfiguredCount\",",
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
    "employee_import",
    "salary_profile",
    "payroll_compliance_profile",
    "employee_payment_profile",
    "payroll_profile_import",
    "employee_labor_roster_profile",
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
    check(
      "pilot compliance controls",
      snapshot.calendarDayCount >= 1 &&
        snapshot.approvedCalendarReviewCount >= 1 &&
        snapshot.completeLaborRosterProfileCount >= snapshot.employeeCount &&
        snapshot.approvedPolicyDocumentCount >= 1 &&
        snapshot.activeWorkRuleCount >= 1 &&
        snapshot.workRuleAcknowledgementCount >= snapshot.employeeCount,
      `${snapshot.calendarDayCount} calendar day(s), ${snapshot.approvedCalendarReviewCount} calendar review(s), ${snapshot.completeLaborRosterProfileCount} labor roster profile(s), ${snapshot.approvedPolicyDocumentCount} approved policy source(s), ${snapshot.workRuleAcknowledgementCount} work-rule acknowledgement(s)`,
    ),
    check(
      "pilot security controls",
      snapshot.verifiedFileStorageCount >= 1 &&
        snapshot.externalNotificationSettingCount >= 1 &&
        snapshot.verifiedPayrollPaymentSecurityCount >= 1 &&
        snapshot.readyWorktimeAgreementCount >= 1 &&
        snapshot.commercialSubscriptionCount >= 1 &&
        snapshot.backupPostureConfiguredCount >= 1,
      `${snapshot.verifiedFileStorageCount} storage setting(s), ${snapshot.externalNotificationSettingCount} external notification setting(s), ${snapshot.verifiedPayrollPaymentSecurityCount} payroll payment security setting(s), ${snapshot.readyWorktimeAgreementCount} worktime agreement(s), ${snapshot.commercialSubscriptionCount} subscription(s), ${snapshot.backupPostureConfiguredCount} backup posture setting(s)`,
    ),
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
  return taiwanStatutoryLeaveRequirements.map((requirement) => ({
    id: `leave_policy_suiyuecare_${requirement.recommendedCode}`,
    code: requirement.recommendedCode,
    name: requirement.name,
    annualUnits: requirement.category === "annual_leave" ? 7 : requirement.annualUnits,
    attachmentRequired: ["sick_leave", "maternity", "paternity", "bereavement", "occupational_injury"].includes(
      requirement.category,
    ),
    statutoryCategory: requirement.category,
    eligibilityRule: requirement.eligibilityRule,
    payRatePercent: requirement.payRatePercent,
    annualLimitNote: requirement.note,
    accrualMethod: requirement.accrualMethod,
    minNoticeDays: requirement.category === "annual_leave" || requirement.category === "personal_leave" ? 1 : 0,
    carryoverLimitUnits: requirement.category === "annual_leave" ? 10 : null,
    paid: requirement.paid,
  }));
}

function buildCompanyCalendarSql(referenceDate: Date, calendarYear: number) {
  const newYear = new Date(Date.UTC(calendarYear, 0, 1));
  const makeupWorkday = new Date(Date.UTC(calendarYear, 1, 20));
  return [
    insertRows("CompanyCalendarDay", [
      "id",
      "tenantId",
      "companyId",
      "calendarDate",
      "dayType",
      "name",
      "paid",
      "requiresWork",
      "source",
      "notes",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ], [
      [
        `calendar_${calendarYear}_new_year`,
        pilotTenantId,
        pilotCompanyId,
        newYear,
        "national_holiday",
        "New Year holiday",
        true,
        false,
        "dgpa",
        "Pilot calendar source review keeps only official source references.",
        pilotOwnerUserId,
        referenceDate,
        referenceDate,
      ],
      [
        `calendar_${calendarYear}_makeup_workday`,
        pilotTenantId,
        pilotCompanyId,
        makeupWorkday,
        "makeup_workday",
        "Pilot makeup workday",
        true,
        true,
        "dgpa",
        "Synthetic pilot makeup workday used to verify calendar review coverage.",
        pilotOwnerUserId,
        referenceDate,
        referenceDate,
      ],
    ], [
      'ON CONFLICT ("companyId", "calendarDate") DO UPDATE SET',
      '  "dayType" = EXCLUDED."dayType",',
      '  "name" = EXCLUDED."name",',
      '  "paid" = EXCLUDED."paid",',
      '  "requiresWork" = EXCLUDED."requiresWork",',
      '  "source" = EXCLUDED."source",',
      '  "notes" = EXCLUDED."notes",',
      '  "createdByUserId" = EXCLUDED."createdByUserId",',
      '  "updatedAt" = EXCLUDED."updatedAt"',
    ].join("\n")),
    insertRows("CompanyCalendarReview", [
      "id",
      "tenantId",
      "companyId",
      "calendarYear",
      "sourceTitle",
      "sourceUrl",
      "sourceCheckedAt",
      "reviewedBy",
      "reviewedAt",
      "reviewStatus",
      "nationalHolidayCount",
      "makeupWorkdayCount",
      "companyHolidayCount",
      "notes",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ], [[
      `calendar_review_${calendarYear}_suiyuecare_pilot`,
      pilotTenantId,
      pilotCompanyId,
      calendarYear,
      "Directorate-General of Personnel Administration calendar review",
      "https://www.dgpa.gov.tw/",
      referenceDate,
      "Pilot HR Admin",
      referenceDate,
      "approved",
      1,
      1,
      0,
      "Pilot annual calendar review verifies official-source references before payroll and schedule use.",
      pilotOwnerUserId,
      referenceDate,
      referenceDate,
    ]], [
      'ON CONFLICT ("companyId", "calendarYear") DO UPDATE SET',
      '  "sourceTitle" = EXCLUDED."sourceTitle",',
      '  "sourceUrl" = EXCLUDED."sourceUrl",',
      '  "sourceCheckedAt" = EXCLUDED."sourceCheckedAt",',
      '  "reviewedBy" = EXCLUDED."reviewedBy",',
      '  "reviewedAt" = EXCLUDED."reviewedAt",',
      '  "reviewStatus" = EXCLUDED."reviewStatus",',
      '  "nationalHolidayCount" = EXCLUDED."nationalHolidayCount",',
      '  "makeupWorkdayCount" = EXCLUDED."makeupWorkdayCount",',
      '  "companyHolidayCount" = EXCLUDED."companyHolidayCount",',
      '  "notes" = EXCLUDED."notes",',
      '  "updatedByUserId" = EXCLUDED."updatedByUserId",',
      '  "updatedAt" = EXCLUDED."updatedAt"',
    ].join("\n")),
  ];
}

function buildPolicyDocuments(referenceDate: Date): SqlValue[][] {
  const docs = [
    {
      id: "policy_suiyuecare_leave_v1",
      title: "Pilot leave policy",
      category: "Leave",
      version: "2026.06",
      sourceRef: "policy://suiyuecare/leave/2026.06",
      excerpt: "Employees submit leave with dates, units, reason, and attachment metadata when required. Managers approve in the unified Inbox.",
      keywords: ["leave", "annual", "sick", "personal", "請假", "特休", "病假", "事假"],
    },
    {
      id: "policy_suiyuecare_attendance_v1",
      title: "Pilot attendance policy",
      category: "Attendance",
      version: "2026.06",
      sourceRef: "policy://suiyuecare/attendance/2026.06",
      excerpt: "Employees clock in and out through HR One. Missing punches become correction requests and HR reviews exceptions before payroll close.",
      keywords: ["attendance", "clock", "punch", "補打卡", "打卡", "出勤"],
    },
    {
      id: "policy_suiyuecare_payroll_close_v1",
      title: "Pilot payroll close policy",
      category: "Payroll",
      version: "2026.06",
      sourceRef: "policy://suiyuecare/payroll-close/2026.06",
      excerpt: "Payroll close requires attendance completeness, pending approval checks, calculation draft, exception review, HR confirmation, lock, and payslip release.",
      keywords: ["payroll", "close", "payslip", "salary", "薪資", "月結", "薪資單"],
    },
    {
      id: "policy_suiyuecare_ai_safety_v1",
      title: "Pilot AI safety policy",
      category: "AI safety",
      version: "2026.06",
      sourceRef: "policy://suiyuecare/ai-safety/2026.06",
      excerpt: "AI may summarize, explain, draft, and suggest verification steps, but final HR decisions remain human-reviewed and auditable.",
      keywords: ["ai", "copilot", "decision", "safety", "人工智慧", "決策"],
    },
  ];
  return docs.map((doc) => [
    doc.id,
    pilotTenantId,
    pilotCompanyId,
    doc.title,
    doc.category,
    "approved",
    doc.version,
    doc.sourceRef,
    doc.excerpt,
    json(doc.keywords),
    pilotOwnerUserId,
    referenceDate,
    pilotOwnerUserId,
    referenceDate,
    referenceDate,
  ]);
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
    "employee_import",
    "salary_profile",
    "payroll_compliance_profile",
    "employee_payment_profile",
    "payroll_profile_import",
    "employee_labor_roster_profile",
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
