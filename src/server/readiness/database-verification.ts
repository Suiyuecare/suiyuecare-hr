import {
  evaluateTaiwanStatutoryLeavePolicyCoverage,
  type StatutoryLeaveCategory,
} from "@/server/leave/statutory";
import type { AttendanceRecordkeepingReadinessReport } from "@/server/attendance/policies";
import type { WorktimeAgreementReadinessReport } from "@/server/attendance/worktime-agreements";
import type { MinimumWageComplianceReport } from "@/server/payroll/minimum-wage";
import type { PayrollRecordkeepingReadinessReport } from "@/server/payroll/recordkeeping";
import type { PayrollInsuranceGradeReadinessReport } from "@/server/payroll/insurance-grade-readiness";

export type DatabaseVerificationMode = "demo" | "production";

export type DatabaseVerificationSnapshot = {
  databaseUrlConfigured: boolean;
  tenant: {
    slug: string;
    plan: string;
  } | null;
  company: {
    name: string;
    taxId: string | null;
  } | null;
  counts: {
    departments: number;
    employees: number;
    users: number;
    userRoles: number;
    attendancePolicies: number;
    shiftTemplates: number;
    calendarDays: number;
    activeLawRules: number;
    activeRuleVersions: number;
    leavePolicies: number;
    leaveBalances: number;
    salaryProfiles: number;
    payrollComplianceProfiles: number;
    statutoryInsuranceRecords: number;
    paymentProfiles: number;
    formTemplates: number;
    workflowSteps: number;
    policyDocuments: number;
    approvedPolicyDocuments: number;
    auditLogs: number;
    telemetryEvents: number;
  };
  calendarReview: {
    calendarYear: number;
    reviewStatus: string | null;
    sourceCheckedAt: Date | null;
    sourceUrl: string | null;
    nationalHolidayCount: number;
    makeupWorkdayCount: number;
    companyHolidayCount: number;
    actualNationalHolidayCount: number;
    actualMakeupWorkdayCount: number;
    actualCompanyHolidayCount: number;
  } | null;
  profileCoverage: {
    activeEmployeeIds: string[];
    salaryProfileEmployeeIds: string[];
    payrollComplianceProfileEmployeeIds: string[];
    paymentProfileEmployeeIds: string[];
    statutoryInsuranceReadyEmployeeIds: string[];
  };
  leavePolicySettings: Array<{
    code: string;
    name: string;
    status: "active" | "inactive";
    statutoryCategory: StatutoryLeaveCategory;
    requiresLegalReview: boolean;
  }>;
  minimumWageCompliance: Pick<
    MinimumWageComplianceReport,
    "ready" | "checkedCount" | "monthlyViolationCount" | "hourlyViolationCount" | "detail"
  >;
  attendanceRecordkeeping: AttendanceRecordkeepingReadinessReport;
  worktimeAgreement: WorktimeAgreementReadinessReport;
  insuranceGradeReadiness: Pick<
    PayrollInsuranceGradeReadinessReport,
    "ready" | "checkedCount" | "issueCount" | "detail"
  >;
  payrollRecordkeeping: PayrollRecordkeepingReadinessReport;
  accessCoverage: {
    privilegedUserIds: string[];
    externalIdentityUserIds: string[];
  };
  roleKeys: string[];
  roleAssignmentKeys: string[];
  auditEntityTypes: string[];
  lawRulesHaveActiveVersion: boolean;
  ruleValidation: {
    activeVersionCount: number;
    validatedVersionCount: number;
    failedVersionCount: number;
    fixtureCount: number;
  };
  legalSourceFreshness: {
    activeVersionCount: number;
    freshVersionCount: number;
    staleVersionCount: number;
    invalidVersionCount: number;
    oldestCheckedAt: string | null;
    maxAgeDays: number;
  };
  laborRuleChangeControl: {
    reason?: string;
    reviewStatus?: string;
    requiresPayrollRecalculation?: boolean;
  } | null;
  securitySettings: {
    mfaRequiredForAdmins: boolean;
    ssoEnabled: boolean;
    ssoProvider: string | null;
    ssoIssuerUrl: string | null;
    ssoClientId: string | null;
    ssoJwksUrl: string | null;
    passwordMinLength: number;
    allowedEmailDomains: string[];
  } | null;
  fileStorageSettings: {
    provider: string;
    kmsKeyRef: string | null;
    malwareScanningRequired: boolean;
    verificationStatus: string;
    lastVerifiedAt: Date | null;
  } | null;
  notificationSettings: {
    emailEnabled: boolean;
    lineEnabled: boolean;
    slackEnabled: boolean;
    teamsEnabled: boolean;
    externalSummaryOnly: boolean;
  } | null;
  payrollPaymentSecuritySettings: {
    tokenVaultProvider: string;
    tokenVaultRef: string | null;
    kmsKeyRef: string | null;
    bankFileFormat: string;
    bankFormatVersion: string;
    bankFormatVerified: boolean;
    verificationStatus: string;
    lastVerifiedAt: Date | null;
  } | null;
  operationalResilienceSettings: {
    backupProvider: string;
    backupEnabled: boolean;
    backupRetentionDays: number;
    backupEncryptionKeyRef: string | null;
    lastBackupCompletedAt: Date | null;
    restoreDrillTestedAt: Date | null;
    restoreDrillStatus: string;
    restoreDrillTicket: string | null;
    verificationStatus: string;
  } | null;
  subscription: {
    plan: string;
    status: string;
    seatLimit: number;
    activeSeatCount: number;
    billingContactEmail: string | null;
    contractRef: string | null;
    contractHash: string | null;
    contractStartsAt: Date | null;
    contractEndsAt: Date | null;
    renewalNoticeDays: number;
    verificationStatus: string;
  } | null;
  supportAccessGovernance: {
    activeApprovedCount: number;
    activeUnapprovedCount: number;
    expiredStillApprovedCount: number;
  };
};

export type DatabaseVerificationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

const requiredRoleKeys = ["owner", "hr_admin", "manager", "employee"] as const;
const requiredSensitiveOnboardingAuditEntityTypes = [
  "employee",
  "employee_import",
  "salary_profile",
  "payroll_compliance_profile",
  "employee_payment_profile",
  "payroll_profile_import",
] as const;

export function buildDatabaseVerificationChecks(
  snapshot: DatabaseVerificationSnapshot,
  mode: DatabaseVerificationMode,
): DatabaseVerificationCheck[] {
  const checks: DatabaseVerificationCheck[] = [];
  const missingRoles = requiredRoleKeys.filter((key) => !snapshot.roleKeys.includes(key));
  const missingRoleAssignments = requiredRoleKeys.filter((key) => !snapshot.roleAssignmentKeys.includes(key));

  checks.push(check("database url", snapshot.databaseUrlConfigured, snapshot.databaseUrlConfigured ? "configured" : "missing"));
  checks.push(check("tenant", Boolean(snapshot.tenant), snapshot.tenant ? snapshot.tenant.slug : "missing"));
  checks.push(check("company", Boolean(snapshot.company), snapshot.company ? snapshot.company.name : "missing"));

  if (!snapshot.tenant || !snapshot.company) return checks;

  checks.push(check("departments", snapshot.counts.departments >= 2, `${snapshot.counts.departments} department(s)`));
  checks.push(check("users", snapshot.counts.users >= 6, `${snapshot.counts.users} user(s)`));
  checks.push(check("employees", snapshot.counts.employees >= 5, `${snapshot.counts.employees} employee(s)`));
  checks.push(check("roles", missingRoles.length === 0, missingRoles.length ? `missing ${missingRoles.join(", ")}` : "all core roles"));
  checks.push(check("user role assignments", snapshot.counts.userRoles >= 6, `${snapshot.counts.userRoles} assignment(s)`));
  checks.push(check(
    "required role assignment coverage",
    missingRoleAssignments.length === 0,
    missingRoleAssignments.length ? `missing ${missingRoleAssignments.join(", ")}` : "owner, hr_admin, manager, employee assigned",
  ));
  checks.push(check("company security settings", Boolean(snapshot.securitySettings), snapshot.securitySettings ? "configured" : "missing"));
  checks.push(check("active attendance policy", snapshot.counts.attendancePolicies >= 1, `${snapshot.counts.attendancePolicies} active policy record(s)`));
  checks.push(check("attendance recordkeeping", snapshot.attendanceRecordkeeping.ready, snapshot.attendanceRecordkeeping.detail));
  checks.push(check("active shift template", snapshot.counts.shiftTemplates >= 1, `${snapshot.counts.shiftTemplates} active template(s)`));
  checks.push(check("company calendar", snapshot.counts.calendarDays >= 1, `${snapshot.counts.calendarDays} configured day(s)`));
  checks.push(check(
    "annual calendar review",
    Boolean(snapshot.calendarReview) &&
      snapshot.calendarReview?.reviewStatus === "approved" &&
      Boolean(snapshot.calendarReview.sourceUrl?.startsWith("https://")) &&
      Boolean(snapshot.calendarReview.sourceCheckedAt) &&
      daysSince(snapshot.calendarReview.sourceCheckedAt) <= 365 &&
      snapshot.calendarReview.actualNationalHolidayCount >= snapshot.calendarReview.nationalHolidayCount &&
      snapshot.calendarReview.actualMakeupWorkdayCount >= snapshot.calendarReview.makeupWorkdayCount &&
      snapshot.calendarReview.actualCompanyHolidayCount >= snapshot.calendarReview.companyHolidayCount,
    snapshot.calendarReview
      ? `${snapshot.calendarReview.calendarYear}; ${snapshot.calendarReview.reviewStatus}; ${snapshot.calendarReview.actualNationalHolidayCount}/${snapshot.calendarReview.nationalHolidayCount} national holiday(s), ${snapshot.calendarReview.actualMakeupWorkdayCount}/${snapshot.calendarReview.makeupWorkdayCount} makeup workday(s)`
      : "missing",
  ));
  checks.push(check("active law rules", snapshot.counts.activeLawRules >= 3, `${snapshot.counts.activeLawRules} active law rule(s)`));
  checks.push(check(
    "active rule versions",
    snapshot.lawRulesHaveActiveVersion,
    `${snapshot.counts.activeRuleVersions} active version(s)`,
  ));
  checks.push(check(
    "rule validation evidence",
    snapshot.ruleValidation.activeVersionCount > 0 &&
      snapshot.ruleValidation.validatedVersionCount === snapshot.ruleValidation.activeVersionCount &&
      snapshot.ruleValidation.failedVersionCount === 0,
    `${snapshot.ruleValidation.validatedVersionCount}/${snapshot.ruleValidation.activeVersionCount} active version(s) validated; ${snapshot.ruleValidation.fixtureCount} fixture(s) recorded`,
  ));
  checks.push(check(
    "legal source freshness",
    snapshot.legalSourceFreshness.activeVersionCount > 0 &&
      snapshot.legalSourceFreshness.freshVersionCount === snapshot.legalSourceFreshness.activeVersionCount &&
      snapshot.legalSourceFreshness.staleVersionCount === 0 &&
      snapshot.legalSourceFreshness.invalidVersionCount === 0,
    `${snapshot.legalSourceFreshness.freshVersionCount}/${snapshot.legalSourceFreshness.activeVersionCount} active version(s) fresh; oldest ${snapshot.legalSourceFreshness.oldestCheckedAt ?? "missing"}; max age ${snapshot.legalSourceFreshness.maxAgeDays} day(s)`,
  ));
  checks.push(check(
    "law rule change control",
    Boolean(snapshot.laborRuleChangeControl?.reason && snapshot.laborRuleChangeControl.reviewStatus === "approved"),
    snapshot.laborRuleChangeControl
      ? `${snapshot.laborRuleChangeControl.reviewStatus}: ${snapshot.laborRuleChangeControl.reason ?? "missing reason"}`
      : "missing",
  ));
  const statutoryLeaveCoverage = evaluateTaiwanStatutoryLeavePolicyCoverage(snapshot.leavePolicySettings);
  checks.push(check("leave policies", snapshot.counts.leavePolicies >= 1, `${snapshot.counts.leavePolicies} leave policy record(s)`));
  checks.push(check("statutory leave policy coverage", statutoryLeaveCoverage.ready, statutoryLeaveCoverage.detail));
  checks.push(check("leave balances", snapshot.counts.leaveBalances >= snapshot.counts.employees, `${snapshot.counts.leaveBalances} balance record(s)`));
  const salaryCoverage = profileCoverage(snapshot.profileCoverage.activeEmployeeIds, snapshot.profileCoverage.salaryProfileEmployeeIds);
  const complianceCoverage = profileCoverage(
    snapshot.profileCoverage.activeEmployeeIds,
    snapshot.profileCoverage.payrollComplianceProfileEmployeeIds,
  );
  const paymentCoverage = profileCoverage(snapshot.profileCoverage.activeEmployeeIds, snapshot.profileCoverage.paymentProfileEmployeeIds);

  checks.push(check(
    "salary profile coverage",
    salaryCoverage.missingCount === 0,
    `${salaryCoverage.configuredCount}/${salaryCoverage.totalCount} active employee(s) covered; ${snapshot.counts.salaryProfiles} profile record(s)`,
  ));
  checks.push(check(
    "salary minimum wage compliance",
    salaryCoverage.missingCount === 0 &&
      snapshot.minimumWageCompliance.checkedCount >= salaryCoverage.totalCount &&
      snapshot.minimumWageCompliance.ready,
    snapshot.minimumWageCompliance.detail,
  ));
  checks.push(check(
    "payroll compliance profile coverage",
    complianceCoverage.missingCount === 0,
    `${complianceCoverage.configuredCount}/${complianceCoverage.totalCount} active employee(s) covered; ${snapshot.counts.payrollComplianceProfiles} profile record(s)`,
  ));
  checks.push(check(
    "payroll insurance grade readiness",
    complianceCoverage.missingCount === 0 &&
      snapshot.insuranceGradeReadiness.checkedCount >= complianceCoverage.totalCount &&
      snapshot.insuranceGradeReadiness.ready,
    snapshot.insuranceGradeReadiness.detail,
  ));
  const statutoryInsuranceCoverage = profileCoverage(
    snapshot.profileCoverage.activeEmployeeIds,
    snapshot.profileCoverage.statutoryInsuranceReadyEmployeeIds,
  );
  checks.push(check(
    "statutory insurance enrollment evidence",
    statutoryInsuranceCoverage.missingCount === 0,
    `${statutoryInsuranceCoverage.configuredCount}/${statutoryInsuranceCoverage.totalCount} active employee(s) have ready statutory insurance evidence; ${snapshot.counts.statutoryInsuranceRecords} record(s)`,
  ));
  checks.push(check("payroll recordkeeping", snapshot.payrollRecordkeeping.ready, snapshot.payrollRecordkeeping.detail));
  checks.push(check(
    "payment profile coverage",
    paymentCoverage.missingCount === 0,
    `${paymentCoverage.configuredCount}/${paymentCoverage.totalCount} active employee(s) covered; ${snapshot.counts.paymentProfiles} profile record(s)`,
  ));
  checks.push(check(
    "form builder seed",
    snapshot.counts.formTemplates >= 1 && snapshot.counts.workflowSteps >= 1,
    `${snapshot.counts.formTemplates} form(s), ${snapshot.counts.workflowSteps} step(s)`,
  ));
  checks.push(check(
    "approved policy sources",
    snapshot.counts.approvedPolicyDocuments >= 1,
    `${snapshot.counts.approvedPolicyDocuments}/${snapshot.counts.policyDocuments} approved source(s)`,
  ));
  checks.push(check("audit baseline", snapshot.counts.auditLogs >= 1, `${snapshot.counts.auditLogs} audit event(s)`));
  checks.push(check("product telemetry baseline", snapshot.counts.telemetryEvents >= 1, `${snapshot.counts.telemetryEvents} telemetry event(s)`));

  if (mode === "production") {
    checks.push(...buildProductionChecks(snapshot));
  }

  return checks;
}

function buildProductionChecks(snapshot: DatabaseVerificationSnapshot): DatabaseVerificationCheck[] {
  const externalNotificationsEnabled = Boolean(
    snapshot.notificationSettings?.emailEnabled ||
    snapshot.notificationSettings?.lineEnabled ||
    snapshot.notificationSettings?.slackEnabled ||
    snapshot.notificationSettings?.teamsEnabled,
  );
  const ssoReady = Boolean(
    snapshot.securitySettings?.ssoEnabled &&
    snapshot.securitySettings.ssoProvider &&
    snapshot.securitySettings.ssoIssuerUrl &&
    snapshot.securitySettings.ssoClientId &&
    snapshot.securitySettings.ssoJwksUrl,
  );
  const productionStorageReady = Boolean(
    snapshot.fileStorageSettings &&
    snapshot.fileStorageSettings.provider !== "demo_object_storage" &&
    snapshot.fileStorageSettings.kmsKeyRef &&
    snapshot.fileStorageSettings.malwareScanningRequired &&
    snapshot.fileStorageSettings.verificationStatus === "verified" &&
    snapshot.fileStorageSettings.lastVerifiedAt,
  );
  const missingSensitiveAuditEntityTypes = requiredSensitiveOnboardingAuditEntityTypes.filter(
    (entityType) => !snapshot.auditEntityTypes.includes(entityType),
  );
  const privilegedExternalIdentityCoverage = identityCoverage(
    snapshot.accessCoverage.privilegedUserIds,
    snapshot.accessCoverage.externalIdentityUserIds,
  );
  const supportAccessGovernancePassed =
    snapshot.supportAccessGovernance.activeUnapprovedCount === 0 &&
    snapshot.supportAccessGovernance.expiredStillApprovedCount === 0;
  const payrollPaymentSecurityReady = Boolean(
    snapshot.payrollPaymentSecuritySettings &&
      snapshot.payrollPaymentSecuritySettings.tokenVaultProvider !== "not_configured" &&
      snapshot.payrollPaymentSecuritySettings.tokenVaultRef &&
      snapshot.payrollPaymentSecuritySettings.kmsKeyRef &&
      snapshot.payrollPaymentSecuritySettings.bankFileFormat !== "tw_bank_csv_placeholder" &&
      snapshot.payrollPaymentSecuritySettings.bankFormatVerified &&
      snapshot.payrollPaymentSecuritySettings.verificationStatus === "verified" &&
      snapshot.payrollPaymentSecuritySettings.lastVerifiedAt,
  );
  const operationalResilienceReady = Boolean(
    snapshot.operationalResilienceSettings &&
      snapshot.operationalResilienceSettings.backupEnabled &&
      snapshot.operationalResilienceSettings.backupProvider !== "not_configured" &&
      snapshot.operationalResilienceSettings.backupRetentionDays >= 30 &&
      snapshot.operationalResilienceSettings.backupEncryptionKeyRef &&
      snapshot.operationalResilienceSettings.lastBackupCompletedAt &&
      snapshot.operationalResilienceSettings.restoreDrillStatus === "passed" &&
      snapshot.operationalResilienceSettings.restoreDrillTestedAt &&
      daysSince(snapshot.operationalResilienceSettings.restoreDrillTestedAt) <= 90 &&
      snapshot.operationalResilienceSettings.restoreDrillTicket &&
      snapshot.operationalResilienceSettings.verificationStatus === "verified"
  );
  const subscriptionReady = Boolean(
    snapshot.subscription &&
      snapshot.subscription.plan !== "demo" &&
      snapshot.subscription.status === "active" &&
      snapshot.subscription.activeSeatCount <= snapshot.subscription.seatLimit &&
      snapshot.subscription.billingContactEmail &&
      snapshot.subscription.contractRef &&
      snapshot.subscription.contractHash &&
      snapshot.subscription.contractStartsAt &&
      snapshot.subscription.contractEndsAt &&
      daysUntil(snapshot.subscription.contractEndsAt) > snapshot.subscription.renewalNoticeDays &&
      snapshot.subscription.verificationStatus === "verified",
  );

  return [
    check(
      "production tenant identity",
      snapshot.tenant?.slug !== "hr-one-demo" && snapshot.tenant?.plan !== "demo",
      snapshot.tenant ? `${snapshot.tenant.slug} / ${snapshot.tenant.plan}` : "missing",
    ),
    check(
      "production company identity",
      Boolean(snapshot.company?.taxId && !snapshot.company.taxId.toLowerCase().includes("demo")),
      snapshot.company?.taxId ? "tax id configured" : "missing tax id",
    ),
    check(
      "commercial subscription",
      subscriptionReady,
      snapshot.subscription
        ? `${snapshot.subscription.plan}; ${snapshot.subscription.status}; ${snapshot.subscription.activeSeatCount}/${snapshot.subscription.seatLimit} seat(s); ${snapshot.subscription.verificationStatus}`
        : "missing tenant subscription",
    ),
    check(
      "production SSO",
      ssoReady && Boolean(snapshot.securitySettings?.mfaRequiredForAdmins) && (snapshot.securitySettings?.passwordMinLength ?? 0) >= 12,
      ssoReady ? `${snapshot.securitySettings?.ssoProvider} metadata configured` : "missing SSO metadata",
    ),
    check(
      "privileged SSO identity coverage",
      privilegedExternalIdentityCoverage.missingCount === 0,
      `${privilegedExternalIdentityCoverage.configuredCount}/${privilegedExternalIdentityCoverage.totalCount} privileged user(s) linked`,
    ),
    check(
      "production email domains",
      Boolean(snapshot.securitySettings?.allowedEmailDomains.length) &&
        !snapshot.securitySettings?.allowedEmailDomains.includes("hrone.test"),
      snapshot.securitySettings?.allowedEmailDomains.length
        ? snapshot.securitySettings.allowedEmailDomains.join(", ")
        : "missing",
    ),
    check(
      "production document storage",
      productionStorageReady,
      snapshot.fileStorageSettings
        ? `${snapshot.fileStorageSettings.provider}; verification ${snapshot.fileStorageSettings.verificationStatus}`
        : "missing",
    ),
    check(
      "external notifications",
      externalNotificationsEnabled && Boolean(snapshot.notificationSettings?.externalSummaryOnly),
      externalNotificationsEnabled ? "external summary-only channel configured" : "only in-app or missing",
    ),
    check(
      "payroll recalculation gate",
      snapshot.laborRuleChangeControl?.requiresPayrollRecalculation === false,
      snapshot.laborRuleChangeControl
        ? `requires recalculation: ${snapshot.laborRuleChangeControl.requiresPayrollRecalculation}`
        : "missing change control",
    ),
    check("worktime agreement evidence", snapshot.worktimeAgreement.ready, snapshot.worktimeAgreement.detail),
    check(
      "payroll payment security",
      payrollPaymentSecurityReady,
      snapshot.payrollPaymentSecuritySettings
        ? `${snapshot.payrollPaymentSecuritySettings.tokenVaultProvider}; ${snapshot.payrollPaymentSecuritySettings.bankFileFormat} ${snapshot.payrollPaymentSecuritySettings.bankFormatVersion}; ${snapshot.payrollPaymentSecuritySettings.verificationStatus}`
        : "missing token vault and bank format verification",
    ),
    check(
      "operational resilience",
      operationalResilienceReady,
      snapshot.operationalResilienceSettings
        ? `${snapshot.operationalResilienceSettings.backupProvider}; retention ${snapshot.operationalResilienceSettings.backupRetentionDays} day(s); restore ${snapshot.operationalResilienceSettings.restoreDrillStatus}; ${snapshot.operationalResilienceSettings.verificationStatus}`
        : "missing backup and restore drill evidence",
    ),
    check(
      "sensitive onboarding audit coverage",
      missingSensitiveAuditEntityTypes.length === 0,
      missingSensitiveAuditEntityTypes.length
        ? `missing ${missingSensitiveAuditEntityTypes.join(", ")}`
        : "employee, payroll, payment, and compliance onboarding audited",
    ),
    check(
      "support access governance",
      supportAccessGovernancePassed,
      supportAccessGovernancePassed
        ? `${snapshot.supportAccessGovernance.activeApprovedCount} active approved support grant(s); no unapproved or expired active access.`
        : `${snapshot.supportAccessGovernance.activeUnapprovedCount} unapproved active grant(s), ${snapshot.supportAccessGovernance.expiredStillApprovedCount} expired grant(s) still approved.`,
    ),
  ];
}

function check(name: string, passed: boolean, detail: string): DatabaseVerificationCheck {
  return { name, passed, detail };
}

function profileCoverage(activeEmployeeIds: string[], profileEmployeeIds: string[]) {
  const active = new Set(activeEmployeeIds);
  const configured = new Set(profileEmployeeIds.filter((employeeId) => active.has(employeeId)));
  return {
    totalCount: active.size,
    configuredCount: configured.size,
    missingCount: active.size - configured.size,
  };
}

function identityCoverage(privilegedUserIds: string[], externalIdentityUserIds: string[]) {
  const privileged = new Set(privilegedUserIds);
  const configured = new Set(externalIdentityUserIds.filter((userId) => privileged.has(userId)));
  return {
    totalCount: privileged.size,
    configuredCount: configured.size,
    missingCount: privileged.size - configured.size,
  };
}

function daysSince(value: Date | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const today = new Date();
  const startToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const startValue = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.floor((startToday - startValue) / 86_400_000);
}

function daysUntil(value: Date | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const today = new Date();
  const startToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const startValue = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.ceil((startValue - startToday) / 86_400_000);
}
