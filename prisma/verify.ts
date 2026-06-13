import { PrismaClient } from "@prisma/client";
import {
  buildDatabaseVerificationChecks,
  type DatabaseVerificationCheck,
  type DatabaseVerificationMode,
  type DatabaseVerificationSnapshot,
} from "../src/server/readiness/database-verification";
import { readRuleValidationSummary } from "../src/server/rules/validation";

const prisma = new PrismaClient();

type CliOptions = {
  mode: DatabaseVerificationMode;
  tenantSlug: string;
  companyId: string | null;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tenant = await prisma.tenant.findUnique({
    where: { slug: options.tenantSlug },
    include: {
      companies: options.companyId ? { where: { id: options.companyId } } : true,
    },
  });
  const company = tenant?.companies[0] ?? null;

  const snapshot = tenant && company
    ? await buildSnapshot(tenant.id, company.id, {
        tenant: { slug: tenant.slug, plan: tenant.plan },
        company: { name: company.name, taxId: company.taxId },
      })
    : emptySnapshot({
        tenant: tenant ? { slug: tenant.slug, plan: tenant.plan } : null,
        company: null,
      });

  const checks = buildDatabaseVerificationChecks(snapshot, options.mode);
  reportAndExit(checks, options);
}

async function buildSnapshot(
  tenantId: string,
  companyId: string,
  identity: Pick<DatabaseVerificationSnapshot, "tenant" | "company">,
): Promise<DatabaseVerificationSnapshot> {
  const [
    departmentCount,
    employeeCount,
    userCount,
    roles,
    userRoleCount,
    userRoles,
    securitySetting,
    fileStorageSetting,
    notificationSetting,
    payrollPaymentSecuritySetting,
    operationalResilienceSetting,
    calendarReview,
    attendancePolicyCount,
    shiftTemplateCount,
    calendarDayCount,
    lawRules,
    activeRuleVersions,
    leavePolicyCount,
    leaveBalanceCount,
    salaryProfileCount,
    payrollComplianceProfileCount,
    paymentProfileCount,
    formTemplateCount,
    workflowStepCount,
    auditCount,
    telemetryCount,
    activeEmployees,
    currentSalaryProfiles,
    currentPayrollComplianceProfiles,
    currentPaymentProfiles,
    externalIdentities,
    auditEntityTypes,
    activeApprovedSupportGrantCount,
    activeUnapprovedSupportGrantCount,
    expiredStillApprovedSupportGrantCount,
  ] = await Promise.all([
    prisma.department.count({ where: { tenantId, companyId } }),
    prisma.employee.count({ where: { tenantId, companyId } }),
    prisma.user.count({ where: { tenantId } }),
    prisma.role.findMany({ where: { tenantId }, select: { key: true } }),
    prisma.userRole.count({ where: { tenantId, companyId } }),
    prisma.userRole.findMany({
      where: { tenantId, companyId },
      include: { role: { select: { key: true } } },
    }),
    prisma.companySecuritySetting.findUnique({ where: { companyId } }),
    prisma.companyFileStorageSetting.findUnique({ where: { companyId } }),
    prisma.companyNotificationSetting.findUnique({ where: { companyId } }),
    prisma.companyPayrollPaymentSecuritySetting.findUnique({ where: { companyId } }),
    prisma.companyOperationalResilienceSetting.findUnique({ where: { companyId } }),
    prisma.companyCalendarReview.findFirst({
      where: { tenantId, companyId, calendarYear: new Date().getFullYear() },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.attendancePolicy.count({ where: { tenantId, companyId, status: "active" } }),
    prisma.shiftTemplate.count({ where: { tenantId, companyId, status: "active" } }),
    prisma.companyCalendarDay.count({ where: { tenantId, companyId } }),
    prisma.lawRule.findMany({
      where: { tenantId, companyId, status: "active" },
      include: { versions: { where: { status: "active" } } },
    }),
    prisma.ruleVersion.findMany({
      where: { tenantId, companyId, status: "active" },
      select: { version: true, definitionJson: true },
    }),
    prisma.leavePolicy.count({ where: { tenantId, companyId } }),
    prisma.leaveBalance.count({ where: { tenantId, companyId } }),
    prisma.salaryProfile.count({ where: { tenantId, companyId } }),
    prisma.payrollComplianceProfile.count({ where: { tenantId, companyId } }),
    prisma.employeePaymentProfile.count({ where: { tenantId, companyId } }),
    prisma.formTemplate.count({ where: { tenantId, companyId } }),
    prisma.workflowTemplateStep.count({ where: { tenantId, companyId } }),
    prisma.auditLog.count({ where: { tenantId, companyId } }),
    prisma.productTelemetryEvent.count({ where: { tenantId, companyId } }),
    prisma.employee.findMany({
      where: { tenantId, companyId, employmentStatus: "active" },
      select: { id: true },
    }),
    prisma.salaryProfile.findMany({
      where: { tenantId, companyId, effectiveTo: null },
      select: { employeeId: true },
    }),
    prisma.payrollComplianceProfile.findMany({
      where: { tenantId, companyId, effectiveTo: null },
      select: { employeeId: true },
    }),
    prisma.employeePaymentProfile.findMany({
      where: { tenantId, companyId, status: "active", effectiveTo: null },
      select: { employeeId: true },
    }),
    prisma.userExternalIdentity.findMany({
      where: { tenantId },
      select: { userId: true },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, companyId },
      select: { entityType: true },
    }),
    prisma.supportAccessGrant.count({
      where: {
        tenantId,
        companyId,
        status: "approved",
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.supportAccessGrant.count({
      where: {
        tenantId,
        companyId,
        status: { notIn: ["approved", "revoked", "expired"] },
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.supportAccessGrant.count({
      where: {
        tenantId,
        companyId,
        status: "approved",
        expiresAt: { lte: new Date() },
      },
    }),
  ]);

  const laborSettingsVersion = activeRuleVersions.find((version) => hasTaiwanLaborSettings(version.definitionJson));
  const ruleValidation = summarizeRuleValidation(activeRuleVersions.map((version) => version.definitionJson));
  const legalSourceFreshness = summarizeLegalSourceFreshness(activeRuleVersions.map((version) => version.definitionJson));
  return {
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    ...identity,
    counts: {
      departments: departmentCount,
      employees: employeeCount,
      users: userCount,
      userRoles: userRoleCount,
      attendancePolicies: attendancePolicyCount,
      shiftTemplates: shiftTemplateCount,
      calendarDays: calendarDayCount,
      activeLawRules: lawRules.length,
      activeRuleVersions: activeRuleVersions.length,
      leavePolicies: leavePolicyCount,
      leaveBalances: leaveBalanceCount,
      salaryProfiles: salaryProfileCount,
      payrollComplianceProfiles: payrollComplianceProfileCount,
      paymentProfiles: paymentProfileCount,
      formTemplates: formTemplateCount,
      workflowSteps: workflowStepCount,
      auditLogs: auditCount,
      telemetryEvents: telemetryCount,
    },
    calendarReview: calendarReview
      ? {
          calendarYear: calendarReview.calendarYear,
          reviewStatus: calendarReview.reviewStatus,
          sourceCheckedAt: calendarReview.sourceCheckedAt,
          sourceUrl: calendarReview.sourceUrl,
          nationalHolidayCount: calendarReview.nationalHolidayCount,
          makeupWorkdayCount: calendarReview.makeupWorkdayCount,
          companyHolidayCount: calendarReview.companyHolidayCount,
          actualNationalHolidayCount: await prisma.companyCalendarDay.count({
            where: {
              tenantId,
              companyId,
              dayType: "national_holiday",
              calendarDate: calendarYearRange(calendarReview.calendarYear),
            },
          }),
          actualMakeupWorkdayCount: await prisma.companyCalendarDay.count({
            where: {
              tenantId,
              companyId,
              dayType: "makeup_workday",
              calendarDate: calendarYearRange(calendarReview.calendarYear),
            },
          }),
          actualCompanyHolidayCount: await prisma.companyCalendarDay.count({
            where: {
              tenantId,
              companyId,
              dayType: "company_holiday",
              calendarDate: calendarYearRange(calendarReview.calendarYear),
            },
          }),
        }
      : null,
    profileCoverage: {
      activeEmployeeIds: activeEmployees.map((employee) => employee.id),
      salaryProfileEmployeeIds: uniqueIds(currentSalaryProfiles.map((profile) => profile.employeeId)),
      payrollComplianceProfileEmployeeIds: uniqueIds(currentPayrollComplianceProfiles.map((profile) => profile.employeeId)),
      paymentProfileEmployeeIds: uniqueIds(currentPaymentProfiles.map((profile) => profile.employeeId)),
    },
    accessCoverage: {
      privilegedUserIds: uniqueIds(
        userRoles
          .filter((userRole) => ["owner", "hr_admin", "manager"].includes(userRole.role.key))
          .map((userRole) => userRole.userId),
      ),
      externalIdentityUserIds: uniqueIds(externalIdentities.map((identity) => identity.userId)),
    },
    roleKeys: roles.map((role) => role.key),
    roleAssignmentKeys: uniqueIds(userRoles.map((userRole) => userRole.role.key)),
    auditEntityTypes: uniqueIds(auditEntityTypes.map((log) => log.entityType)),
    lawRulesHaveActiveVersion: lawRules.every((rule) => rule.versions.length >= 1),
    ruleValidation,
    legalSourceFreshness,
    laborRuleChangeControl: laborSettingsVersion ? readChangeControl(laborSettingsVersion.definitionJson) : null,
    securitySettings: securitySetting
      ? {
          mfaRequiredForAdmins: securitySetting.mfaRequiredForAdmins,
          ssoEnabled: securitySetting.ssoEnabled,
          ssoProvider: securitySetting.ssoProvider,
          ssoIssuerUrl: securitySetting.ssoIssuerUrl,
          ssoClientId: securitySetting.ssoClientId,
          ssoJwksUrl: securitySetting.ssoJwksUrl,
          passwordMinLength: securitySetting.passwordMinLength,
          allowedEmailDomains: readStringArray(securitySetting.allowedEmailDomainsJson),
        }
      : null,
    fileStorageSettings: fileStorageSetting
      ? {
          provider: fileStorageSetting.provider,
          kmsKeyRef: fileStorageSetting.kmsKeyRef,
          malwareScanningRequired: fileStorageSetting.malwareScanningRequired,
          verificationStatus: fileStorageSetting.verificationStatus,
          lastVerifiedAt: fileStorageSetting.lastVerifiedAt,
        }
      : null,
    notificationSettings: notificationSetting
      ? {
          emailEnabled: notificationSetting.emailEnabled,
          lineEnabled: notificationSetting.lineEnabled,
          slackEnabled: notificationSetting.slackEnabled,
          teamsEnabled: notificationSetting.teamsEnabled,
          externalSummaryOnly: notificationSetting.externalSummaryOnly,
        }
      : null,
    payrollPaymentSecuritySettings: payrollPaymentSecuritySetting
      ? {
          tokenVaultProvider: payrollPaymentSecuritySetting.tokenVaultProvider,
          tokenVaultRef: payrollPaymentSecuritySetting.tokenVaultRef,
          kmsKeyRef: payrollPaymentSecuritySetting.kmsKeyRef,
          bankFileFormat: payrollPaymentSecuritySetting.bankFileFormat,
          bankFormatVersion: payrollPaymentSecuritySetting.bankFormatVersion,
          bankFormatVerified: payrollPaymentSecuritySetting.bankFormatVerified,
          verificationStatus: payrollPaymentSecuritySetting.verificationStatus,
          lastVerifiedAt: payrollPaymentSecuritySetting.lastVerifiedAt,
        }
      : null,
    operationalResilienceSettings: operationalResilienceSetting
      ? {
          backupProvider: operationalResilienceSetting.backupProvider,
          backupEnabled: operationalResilienceSetting.backupEnabled,
          backupRetentionDays: operationalResilienceSetting.backupRetentionDays,
          backupEncryptionKeyRef: operationalResilienceSetting.backupEncryptionKeyRef,
          lastBackupCompletedAt: operationalResilienceSetting.lastBackupCompletedAt,
          restoreDrillTestedAt: operationalResilienceSetting.restoreDrillTestedAt,
          restoreDrillStatus: operationalResilienceSetting.restoreDrillStatus,
          restoreDrillTicket: operationalResilienceSetting.restoreDrillTicket,
          verificationStatus: operationalResilienceSetting.verificationStatus,
        }
      : null,
    supportAccessGovernance: {
      activeApprovedCount: activeApprovedSupportGrantCount,
      activeUnapprovedCount: activeUnapprovedSupportGrantCount,
      expiredStillApprovedCount: expiredStillApprovedSupportGrantCount,
    },
  };
}

function emptySnapshot(
  identity: Pick<DatabaseVerificationSnapshot, "tenant" | "company">,
): DatabaseVerificationSnapshot {
  return {
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    ...identity,
    counts: {
      departments: 0,
      employees: 0,
      users: 0,
      userRoles: 0,
      attendancePolicies: 0,
      shiftTemplates: 0,
      calendarDays: 0,
      activeLawRules: 0,
      activeRuleVersions: 0,
      leavePolicies: 0,
      leaveBalances: 0,
      salaryProfiles: 0,
      payrollComplianceProfiles: 0,
      paymentProfiles: 0,
      formTemplates: 0,
      workflowSteps: 0,
      auditLogs: 0,
      telemetryEvents: 0,
    },
    calendarReview: null,
    profileCoverage: {
      activeEmployeeIds: [],
      salaryProfileEmployeeIds: [],
      payrollComplianceProfileEmployeeIds: [],
      paymentProfileEmployeeIds: [],
    },
    accessCoverage: {
      privilegedUserIds: [],
      externalIdentityUserIds: [],
    },
    roleKeys: [],
    roleAssignmentKeys: [],
    auditEntityTypes: [],
    lawRulesHaveActiveVersion: false,
    ruleValidation: {
      activeVersionCount: 0,
      validatedVersionCount: 0,
      failedVersionCount: 0,
      fixtureCount: 0,
    },
    legalSourceFreshness: {
      activeVersionCount: 0,
      freshVersionCount: 0,
      staleVersionCount: 0,
      invalidVersionCount: 0,
      oldestCheckedAt: null,
      maxAgeDays: 180,
    },
    laborRuleChangeControl: null,
    securitySettings: null,
    fileStorageSettings: null,
    notificationSettings: null,
    payrollPaymentSecuritySettings: null,
    operationalResilienceSettings: null,
    supportAccessGovernance: {
      activeApprovedCount: 0,
      activeUnapprovedCount: 0,
      expiredStillApprovedCount: 0,
    },
  };
}

function parseArgs(args: string[]): CliOptions {
  const mode = readArg(args, "--mode") ?? process.env.HR_ONE_VERIFY_MODE ?? "demo";
  if (mode !== "demo" && mode !== "production") {
    throw new Error(`Unsupported --mode ${mode}. Use demo or production.`);
  }
  return {
    mode,
    tenantSlug: readArg(args, "--tenant-slug") ?? process.env.HR_ONE_TENANT_SLUG ?? "hr-one-demo",
    companyId: readArg(args, "--company-id") ?? process.env.HR_ONE_COMPANY_ID ?? null,
  };
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function hasTaiwanLaborSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.type === "taiwan_labor_standards_settings" || Boolean(record.taiwanLaborStandards);
}

function readChangeControl(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const config = record.taiwanLaborStandards;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const changeControl = (config as Record<string, unknown>).changeControl;
  if (!changeControl || typeof changeControl !== "object" || Array.isArray(changeControl)) return null;
  const fields = changeControl as Record<string, unknown>;
  return {
    reason: typeof fields.reason === "string" ? fields.reason : undefined,
    reviewStatus: typeof fields.reviewStatus === "string" ? fields.reviewStatus : undefined,
    requiresPayrollRecalculation: typeof fields.requiresPayrollRecalculation === "boolean"
      ? fields.requiresPayrollRecalculation
      : undefined,
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function summarizeRuleValidation(definitions: unknown[]) {
  const summaries = definitions.map(readRuleValidationSummary);
  return {
    activeVersionCount: definitions.length,
    validatedVersionCount: summaries.filter((summary) => summary?.passed).length,
    failedVersionCount: summaries.filter((summary) => summary && !summary.passed).length,
    fixtureCount: summaries.reduce((total, summary) => total + (summary?.fixtureCount ?? 0), 0),
  };
}

function summarizeLegalSourceFreshness(definitions: unknown[]) {
  const summaries = definitions.map(readSourceFreshnessSummary);
  const maxAgeDays = summaries.find((summary) => summary)?.maxAgeDays ?? 180;
  const oldestCheckedAt = summaries
    .map((summary) => summary?.oldestCheckedAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  return {
    activeVersionCount: definitions.length,
    freshVersionCount: summaries.filter((summary) => summary?.passed).length,
    staleVersionCount: summaries.filter((summary) => (summary?.staleSourceCount ?? 0) > 0).length,
    invalidVersionCount: summaries.filter((summary) => !summary || (summary.invalidSourceCount ?? 0) > 0).length,
    oldestCheckedAt,
    maxAgeDays,
  };
}

function readSourceFreshnessSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidate = record.sourceFreshness;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const summary = candidate as Record<string, unknown>;
  if (
    typeof summary.passed === "boolean" &&
    typeof summary.staleSourceCount === "number" &&
    typeof summary.invalidSourceCount === "number" &&
    typeof summary.maxAgeDays === "number"
  ) {
    return {
      passed: summary.passed,
      staleSourceCount: summary.staleSourceCount,
      invalidSourceCount: summary.invalidSourceCount,
      oldestCheckedAt: typeof summary.oldestCheckedAt === "string" ? summary.oldestCheckedAt : null,
      maxAgeDays: summary.maxAgeDays,
    };
  }
  return null;
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values));
}

function calendarYearRange(calendarYear: number) {
  return {
    gte: new Date(`${calendarYear}-01-01T00:00:00.000Z`),
    lt: new Date(`${calendarYear + 1}-01-01T00:00:00.000Z`),
  };
}

function reportAndExit(checks: DatabaseVerificationCheck[], options: CliOptions) {
  const failed = checks.filter((item) => !item.passed);
  console.log(`HR One database verification mode: ${options.mode}`);
  console.log(`Tenant slug: ${options.tenantSlug}`);
  if (options.companyId) console.log(`Company ID: ${options.companyId}`);
  for (const item of checks) {
    const marker = item.passed ? "PASS" : "FAIL";
    console.log(`${marker} ${item.name}: ${item.detail}`);
  }
  if (failed.length > 0) {
    console.error(`Database verification failed: ${failed.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("Database verification passed.");
}

main()
  .catch((error) => {
    console.error("Database verification failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown verification error",
    });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
