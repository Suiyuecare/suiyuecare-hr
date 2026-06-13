import { Prisma, PrismaClient, type RoleKey } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { stableHash } from "@/server/audit/redaction";
import { taiwanStatutoryLeaveRequirements } from "@/server/leave/statutory";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";
import {
  buildRuleVersionTestCases,
  evaluateLegalSourceFreshness,
  summarizeLegalSourceFreshness,
  validateTaiwanLaborStandardsRuleSet,
} from "@/server/rules/validation";

export type TenantProvisioningInput = {
  tenantName: string;
  tenantSlug: string;
  plan: string;
  companyName: string;
  companyLegalName: string;
  companyTaxId: string;
  ownerEmail: string;
  ownerDisplayName: string;
  ownerExternalSubject?: string | null;
  allowedEmailDomain: string;
  ssoProvider: string;
  ssoIssuerUrl: string;
  ssoClientId: string;
  ssoJwksUrl: string;
  storageProvider: "s3" | "gcs" | "r2";
  storageBucket: string;
  storageRegion?: string | null;
  storageBasePrefix?: string | null;
  storageKmsKeyRef: string;
  notificationChannel: "email" | "line" | "slack" | "teams";
};

export type TenantProvisioningResult = {
  tenantId: string;
  tenantSlug: string;
  companyId: string;
  ownerUserId: string;
  createdRoleKeys: RoleKey[];
  verificationCommand: string;
  nextSteps: string[];
};

const roleSeeds: Array<{ key: RoleKey; name: string; description: string }> = [
  { key: "owner", name: "Owner", description: "Company owner and executive view" },
  { key: "hr_admin", name: "HR Admin", description: "HR operations and employee administration" },
  { key: "manager", name: "Manager", description: "Team approvals and team visibility" },
  { key: "employee", name: "Employee", description: "Employee self-service" },
];

export function validateTenantProvisioningInput(input: TenantProvisioningInput) {
  const errors: string[] = [];
  if (!input.tenantName.trim()) errors.push("tenantName is required");
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(input.tenantSlug)) {
    errors.push("tenantSlug must be 3-63 lowercase letters, numbers, or hyphens");
  }
  if (input.tenantSlug === "hr-one-demo") errors.push("tenantSlug cannot be the demo slug");
  if (!input.plan.trim() || input.plan === "demo") errors.push("plan must be a non-demo commercial plan");
  if (!input.companyName.trim()) errors.push("companyName is required");
  if (!input.companyLegalName.trim()) errors.push("companyLegalName is required");
  if (!input.companyTaxId.trim() || input.companyTaxId.toLowerCase().includes("demo")) {
    errors.push("companyTaxId must be a real non-demo identifier");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ownerEmail)) errors.push("ownerEmail must be valid");
  if (!input.ownerEmail.endsWith(`@${input.allowedEmailDomain}`)) {
    errors.push("ownerEmail must belong to allowedEmailDomain");
  }
  if (!input.ownerDisplayName.trim()) errors.push("ownerDisplayName is required");
  if (!input.allowedEmailDomain.trim() || input.allowedEmailDomain === "hrone.test") {
    errors.push("allowedEmailDomain must be a non-demo company domain");
  }
  if (!input.ssoProvider.trim()) errors.push("ssoProvider is required");
  if (!input.ssoIssuerUrl.startsWith("https://")) errors.push("ssoIssuerUrl must be an https URL");
  if (!input.ssoClientId.trim()) errors.push("ssoClientId is required");
  if (!input.ssoJwksUrl.startsWith("https://")) errors.push("ssoJwksUrl must be an https URL");
  if (!input.storageBucket.trim()) errors.push("storageBucket is required");
  if (!input.storageKmsKeyRef.trim()) errors.push("storageKmsKeyRef is required");
  return errors;
}

export async function provisionTenantFoundation(
  db: PrismaClient,
  input: TenantProvisioningInput,
): Promise<TenantProvisioningResult> {
  const errors = validateTenantProvisioningInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid tenant provisioning input: ${errors.join("; ")}`);
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.tenant.findUnique({ where: { slug: input.tenantSlug }, select: { id: true } });
    if (existing) throw new Error(`Tenant slug already exists: ${input.tenantSlug}`);

    const tenant = await tx.tenant.create({
      data: {
        name: input.tenantName,
        slug: input.tenantSlug,
        plan: input.plan,
      },
    });
    const company = await tx.company.create({
      data: {
        tenantId: tenant.id,
        name: input.companyName,
        legalName: input.companyLegalName,
        taxId: input.companyTaxId,
      },
    });
    const ownerUser = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.ownerEmail,
        displayName: input.ownerDisplayName,
      },
    });
    await tx.userExternalIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: ownerUser.id,
        provider: input.ssoProvider,
        issuer: input.ssoIssuerUrl,
        subject: input.ownerExternalSubject?.trim() || input.ownerEmail,
        emailAtLink: input.ownerEmail,
      },
    });
    const roles = await Promise.all(
      roleSeeds.map((role) =>
        tx.role.create({
          data: {
            tenantId: tenant.id,
            key: role.key,
            name: role.name,
            description: role.description,
          },
        }),
      ),
    );
    const ownerRole = roles.find((role) => role.key === "owner");
    if (!ownerRole) throw new Error("Owner role was not created.");
    await tx.userRole.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        userId: ownerUser.id,
        roleId: ownerRole.id,
        scopeType: "company",
        scopeId: company.id,
      },
    });

    await createFoundationSettings(tx, input, tenant.id, company.id, ownerUser.id);
    await createTaiwanRuleBaseline(tx, tenant.id, company.id);
    await createStarterPolicySources(tx, tenant.id, company.id, ownerUser.id);
    await createStarterHrForm(tx, tenant.id, company.id);

    await writeAuditLog(tx, {
      tenantId: tenant.id,
      companyId: company.id,
      actorUserId: ownerUser.id,
      action: "create",
      entityType: "tenant_foundation",
      entityId: tenant.id,
      after: {
        tenantSlug: tenant.slug,
        plan: tenant.plan,
        companyId: company.id,
        ownerUserId: ownerUser.id,
        roleKeys: roles.map((role) => role.key),
      },
      metadata: {
        source: "provision_tenant_cli",
        allowedEmailDomain: input.allowedEmailDomain,
        storageProvider: input.storageProvider,
        notificationChannel: input.notificationChannel,
      },
    });

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      companyId: company.id,
      ownerUserId: ownerUser.id,
      createdRoleKeys: roles.map((role) => role.key),
      verificationCommand: `pnpm db:verify:production -- --tenant-slug=${tenant.slug}`,
      nextSteps: [
        "Import departments, managers, employees, and reporting lines.",
        "Create salary, payroll compliance, and payment profiles for every active employee.",
        "Review company calendar, leave policies, attendance policy, and shift templates with HR/legal.",
        "Approve company policy sources before enabling AI policy Q&A for customer users.",
        "Run employee and manager workflow smoke tests to generate production KPI telemetry.",
        `Run pnpm db:verify:production -- --tenant-slug=${tenant.slug} before customer go-live.`,
      ],
    };
  });
}

async function createFoundationSettings(
  tx: Prisma.TransactionClient,
  input: TenantProvisioningInput,
  tenantId: string,
  companyId: string,
  ownerUserId: string,
) {
  await Promise.all([
    tx.companySecuritySetting.create({
      data: {
        tenantId,
        companyId,
        mfaRequiredForAdmins: true,
        mfaRequiredForEmployees: true,
        ssoEnabled: true,
        ssoProvider: input.ssoProvider,
        ssoIssuerUrl: input.ssoIssuerUrl,
        ssoClientId: input.ssoClientId,
        ssoJwksUrl: input.ssoJwksUrl,
        passwordMinLength: 14,
        passwordRequiresNumber: true,
        passwordRequiresSymbol: true,
        sessionTimeoutMinutes: 480,
        idleTimeoutMinutes: 45,
        allowedEmailDomainsJson: [input.allowedEmailDomain],
        updatedByUserId: ownerUserId,
      },
    }),
    tx.companyFileStorageSetting.create({
      data: {
        tenantId,
        companyId,
        provider: input.storageProvider,
        bucketName: input.storageBucket,
        region: input.storageRegion ?? null,
        basePrefix: input.storageBasePrefix ?? `hr-one/${input.tenantSlug}`,
        kmsKeyRef: input.storageKmsKeyRef,
        malwareScanningRequired: true,
        signedUrlTtlMinutes: 10,
        maxFileSizeMb: 25,
        allowedMimeTypesJson: ["application/pdf", "image/jpeg", "image/png", "text/csv"],
        retentionDays: 2555,
        verificationStatus: "unverified",
        lastVerifiedAt: null,
        verificationNote: "Provisioned foundation; run provider smoke test before production verification.",
        updatedByUserId: ownerUserId,
      },
    }),
    tx.companyNotificationSetting.create({
      data: {
        tenantId,
        companyId,
        inAppEnabled: true,
        emailEnabled: input.notificationChannel === "email",
        lineEnabled: input.notificationChannel === "line",
        slackEnabled: input.notificationChannel === "slack",
        teamsEnabled: input.notificationChannel === "teams",
        externalSummaryOnly: true,
        approvalSubmittedEnabled: true,
        approvalDecisionEnabled: true,
        payrollReleasedEnabled: true,
        systemAlertEnabled: true,
      },
    }),
    tx.companyOperationalResilienceSetting.create({
      data: {
        tenantId,
        companyId,
        backupProvider: "not_configured",
        backupSchedule: "daily",
        backupRetentionDays: 0,
        backupEnabled: false,
        restoreDrillStatus: "not_tested",
        recoveryTimeObjectiveHours: 24,
        recoveryPointObjectiveHours: 24,
        verificationStatus: "unverified",
        verificationNote: "Configure backup provider, retention, encryption reference, and restore drill evidence before production verification.",
        updatedByUserId: ownerUserId,
      },
    }),
    tx.companyPayrollAccountingSetting.create({
      data: {
        tenantId,
        companyId,
        grossPayrollDebitAccountCode: "6110",
        grossPayrollDebitAccountName: "Payroll expense",
        employerContributionDebitAccountCode: "6120",
        employerContributionDebitAccountName: "Employer statutory expense",
        deductionCreditAccountCode: "2210",
        deductionCreditAccountName: "Payroll deductions payable",
        netPayableCreditAccountCode: "2220",
        netPayableCreditAccountName: "Salary payable",
        updatedByUserId: ownerUserId,
      },
    }),
    tx.companyPayrollRecordkeepingSetting.create({
      data: {
        tenantId,
        companyId,
        wageRosterRetentionDays: 365 * 5,
        employeePayslipEnabled: true,
        wageCalculationDetailsEnabled: true,
        laborInspectionExportEnabled: true,
        updatedByUserId: ownerUserId,
      },
    }),
    tx.companyWorktimeAgreementSetting.create({
      data: {
        tenantId,
        companyId,
        approvalType: "labor_management_conference",
        approvalOnFile: false,
        evidenceRef: null,
        effectiveFrom: null,
        effectiveTo: null,
        monthlyOvertimeLimitMinutes: 46 * 60,
        threeMonthOvertimeLimitMinutes: 138 * 60,
        localAuthorityReportRequired: false,
        localAuthorityReportFiled: false,
        verificationStatus: "unverified",
        verificationNote: "Upload approval evidence and verify the effective period before extended overtime is used.",
        updatedByUserId: ownerUserId,
      },
    }),
    tx.attendancePolicy.create({
      data: {
        tenantId,
        companyId,
        name: "Default Taiwan attendance policy",
        status: "active",
        regularDailyMinutes: defaultTaiwanLaborStandardsConfig.normalDailyMinutes,
        overtimeWarningDailyMinutes: defaultTaiwanLaborStandardsConfig.maxDailyWorkMinutesIncludingOvertime,
        clockInGraceMinutes: 5,
        clockOutGraceMinutes: 5,
        requireOvertimeApproval: true,
        requirePunchCorrectionApproval: true,
        allowMobilePunch: true,
        attendanceRecordRetentionDays: 365 * 5,
        employeeSelfServiceEnabled: true,
        employeeExportEnabled: true,
        effectiveFrom: new Date(`${defaultTaiwanLaborStandardsConfig.effectiveFrom}T00:00:00.000Z`),
        createdByUserId: ownerUserId,
      },
    }),
    tx.shiftTemplate.create({
      data: {
        tenantId,
        companyId,
        code: "REGULAR_DAY",
        name: "Regular 09:00-18:00",
        status: "active",
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60,
        scheduledMinutes: defaultTaiwanLaborStandardsConfig.normalDailyMinutes,
        crossesMidnight: false,
        eligibleWeekdays: [1, 2, 3, 4, 5],
        notes: "Provisioned default; HR should review before schedule generation.",
        createdByUserId: ownerUserId,
      },
    }),
    ...taiwanStatutoryLeaveRequirements.map((requirement) => tx.leavePolicy.create({
      data: {
        tenantId,
        companyId,
        code: requirement.recommendedCode,
        name: requirement.name,
        annualUnits: new Prisma.Decimal(requirement.annualUnits),
        unit: requirement.unit,
        attachmentRequired: requirement.category === "sick_leave" || requirement.category === "occupational_injury",
        statutoryCategory: requirement.category,
        eligibilityRule: requirement.eligibilityRule,
        payRatePercent: new Prisma.Decimal(requirement.payRatePercent),
        annualLimitNote: requirement.note,
        requiresLegalReview: false,
        accrualMethod: requirement.accrualMethod,
        paid: requirement.paid,
      },
    })),
    tx.companyCalendarDay.create({
      data: {
        tenantId,
        companyId,
        calendarDate: new Date(`${defaultTaiwanLaborStandardsConfig.effectiveFrom}T00:00:00.000Z`),
        dayType: "needs_hr_review",
        name: "Company calendar review required",
        paid: true,
        requiresWork: false,
        source: "provisioning",
        notes: "Replace with company-reviewed Taiwan holiday and makeup workday calendar before schedule/payroll launch.",
        createdByUserId: ownerUserId,
      },
    }),
    tx.companyCalendarReview.create({
      data: {
        tenantId,
        companyId,
        calendarYear: new Date().getFullYear(),
        sourceTitle: "Taiwan annual work calendar review required",
        sourceUrl: "https://www.dgpa.gov.tw/",
        sourceCheckedAt: new Date(),
        reviewedBy: "Pending customer HR review",
        reviewedAt: new Date(),
        reviewStatus: "pending_review",
        nationalHolidayCount: 0,
        makeupWorkdayCount: 0,
        companyHolidayCount: 0,
        notes: "Customer HR must import/review the official Taiwan annual calendar before production verification.",
        updatedByUserId: ownerUserId,
      },
    }),
  ]);
}

async function createTaiwanRuleBaseline(
  tx: Prisma.TransactionClient,
  tenantId: string,
  companyId: string,
) {
  const validation = validateTaiwanLaborStandardsRuleSet(defaultTaiwanLaborStandardsConfig);
  const validationSummary = summarizeRuleValidation(validation);
  const sourceFreshness = summarizeLegalSourceFreshness(
    evaluateLegalSourceFreshness(defaultTaiwanLaborStandardsConfig.sources),
  );
  const testCasesJson = buildRuleVersionTestCases(validation) as Prisma.InputJsonValue;
  const overtimeRule = await tx.lawRule.create({
    data: {
      tenantId,
      companyId,
      jurisdiction: "TW",
      ruleKey: "tw_labor_standards_overtime",
      name: "Taiwan Labor Standards Act overtime",
      description: "Configurable Article 24 overtime tiers with official source references.",
      category: "overtime",
      status: "active",
    },
  });
  await tx.ruleVersion.create({
    data: {
      tenantId,
      companyId,
      lawRuleId: overtimeRule.id,
      version: `${defaultTaiwanLaborStandardsConfig.version}-provisioned`,
      effectiveFrom: new Date(`${defaultTaiwanLaborStandardsConfig.effectiveFrom}T00:00:00.000Z`),
      definitionJson: {
        type: "taiwan_labor_standards_overtime",
        regularDayOvertimeTiers: defaultTaiwanLaborStandardsConfig.regularDayOvertimeTiers,
        restDayOvertimeTiers: defaultTaiwanLaborStandardsConfig.restDayOvertimeTiers,
        emergencyOvertimeMultiplier: defaultTaiwanLaborStandardsConfig.emergencyOvertimeMultiplier,
        sources: defaultTaiwanLaborStandardsConfig.sources,
        inputs: ["regularMinutes", "overtimeMinutes", "workDate"],
        outputs: ["overtimeBuckets"],
        aiUse: "assistive_explanations_only",
        validationSummary,
        sourceFreshness,
      },
      testCasesJson,
      status: "active",
    },
  });

  const laborSettingsRule = await tx.lawRule.create({
    data: {
      tenantId,
      companyId,
      jurisdiction: "TW",
      ruleKey: "tw_labor_standards_settings",
      name: "Taiwan labor standards settings",
      description: "Company-adjustable Taiwan labor standards configuration with official source references.",
      category: "labor_standards",
      status: "active",
    },
  });
  await tx.ruleVersion.create({
    data: {
      tenantId,
      companyId,
      lawRuleId: laborSettingsRule.id,
      version: defaultTaiwanLaborStandardsConfig.version,
      effectiveFrom: new Date(`${defaultTaiwanLaborStandardsConfig.effectiveFrom}T00:00:00.000Z`),
      definitionJson: {
        type: "taiwan_labor_standards_settings",
        taiwanLaborStandards: defaultTaiwanLaborStandardsConfig,
        sources: defaultTaiwanLaborStandardsConfig.sources,
        validationSummary,
        sourceFreshness,
      },
      testCasesJson,
      status: "active",
    },
  });

  const payrollRule = await tx.lawRule.create({
    data: {
      tenantId,
      companyId,
      jurisdiction: "TW",
      ruleKey: "tw_payroll_mvp",
      name: "Taiwan payroll formula baseline",
      description: "Configurable payroll formula placeholder for monthly salary, allowances, deductions, overtime, and statutory payroll.",
      category: "payroll",
      status: "active",
    },
  });
  await tx.ruleVersion.create({
    data: {
      tenantId,
      companyId,
      lawRuleId: payrollRule.id,
      version: `${defaultTaiwanLaborStandardsConfig.version}-payroll`,
      effectiveFrom: new Date(`${defaultTaiwanLaborStandardsConfig.effectiveFrom}T00:00:00.000Z`),
      definitionJson: {
        type: "taiwan_payroll_mvp",
        taiwanLaborStandards: defaultTaiwanLaborStandardsConfig,
        standardMonthlyHours: defaultTaiwanLaborStandardsConfig.payrollStandardMonthlyHours,
        formulas: ["baseSalary", "recurringAllowances", "approvedOvertime", "recurringDeductions", "statutoryPayroll"],
        validationSummary,
        sourceFreshness,
      },
      testCasesJson,
      status: "active",
    },
  });
}

async function createStarterPolicySources(
  tx: Prisma.TransactionClient,
  tenantId: string,
  companyId: string,
  ownerUserId: string,
) {
  await tx.companyPolicyDocument.create({
    data: {
      tenantId,
      companyId,
      title: "AI safety policy draft",
      category: "AI safety",
      status: "draft",
      version: "v1",
      sourceRef: "customer://replace-with-approved-policy",
      excerpt:
        "AI may summarize, explain, draft, and recommend verification steps. HR must approve this source before AI policy Q&A can cite it.",
      keywordsJson: ["ai", "copilot", "safety", "人工智慧"],
      updatedByUserId: ownerUserId,
    },
  });
}

function summarizeRuleValidation(validation: ReturnType<typeof validateTaiwanLaborStandardsRuleSet>) {
  return {
    passed: validation.passed,
    passedCount: validation.passedCount,
    failedCount: validation.failedCount,
    fixtureCount: validation.fixtureCount,
    validatedAt: validation.validatedAt,
    fixtureSetVersion: validation.fixtureSetVersion,
  };
}

async function createStarterHrForm(tx: Prisma.TransactionClient, tenantId: string, companyId: string) {
  const form = await tx.formTemplate.create({
    data: {
      tenantId,
      companyId,
      title: "Employee information change",
      description: "Employee request for HR to review a personal information update.",
      category: "employee_profile",
      fieldsJson: [
        { id: "change_type", label: "Change type", type: "select", required: true, options: ["Contact", "Emergency contact", "Other"] },
        {
          id: "details",
          label: "Details",
          type: "textarea",
          required: true,
          visibilityRule: { type: "field_equals", fieldId: "change_type", expectedValue: "Other" },
        },
        { id: "effective_date", label: "Effective date", type: "date", required: true },
      ],
      visibilityRulesJson: [{ type: "field_equals", fieldId: "change_type", expectedValue: "Other" }],
      status: "active",
    },
  });
  await tx.workflowTemplateStep.create({
    data: {
      tenantId,
      companyId,
      formTemplateId: form.id,
      stepOrder: 1,
      approverType: "hr_admin",
      approverRef: null,
      conditionJson: Prisma.JsonNull,
    },
  });
}

export function buildProvisioningInputHash(input: TenantProvisioningInput) {
  return stableHash({
    tenantSlug: input.tenantSlug,
    plan: input.plan,
    companyName: input.companyName,
    ownerDomain: input.allowedEmailDomain,
    ssoProvider: input.ssoProvider,
    storageProvider: input.storageProvider,
    notificationChannel: input.notificationChannel,
  });
}
