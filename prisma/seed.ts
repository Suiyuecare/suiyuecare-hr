import { Prisma, PrismaClient, RoleKey } from "@prisma/client";
import { createHash } from "node:crypto";
import { defaultApprovedPolicyDocs } from "../src/server/ai/policy-docs";
import { taiwanStatutoryLeaveRequirements } from "../src/server/leave/statutory";
import { defaultTaiwanLaborStandardsConfig } from "../src/server/rules/taiwan-labor-standards";
import {
  buildRuleVersionTestCases,
  evaluateLegalSourceFreshness,
  summarizeLegalSourceFreshness,
  validateTaiwanLaborStandardsRuleSet,
} from "../src/server/rules/validation";

const prisma = new PrismaClient();

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const taiwanRuleValidation = validateTaiwanLaborStandardsRuleSet(defaultTaiwanLaborStandardsConfig);
const taiwanRuleValidationSummary = summarizeRuleValidation(taiwanRuleValidation);
const taiwanSourceFreshnessSummary = summarizeLegalSourceFreshness(
  evaluateLegalSourceFreshness(defaultTaiwanLaborStandardsConfig.sources),
);
const taiwanRuleTestCases = buildRuleVersionTestCases(taiwanRuleValidation) as Prisma.InputJsonValue;

type SeedTelemetryEvent = readonly [
  eventName: string,
  workflow: string,
  step: string,
  durationMs: number | null,
  success: boolean,
  metadata: Prisma.InputJsonObject,
];

async function main() {
  await prisma.auditEvidencePackage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.dataSubjectRequest.deleteMany();
  await prisma.employeePrivacyConsent.deleteMany();
  await prisma.companyPrivacySetting.deleteMany();
  await prisma.employeeTrainingAssignment.deleteMany();
  await prisma.trainingCourse.deleteMany();
  await prisma.companyTrainingSetting.deleteMany();
  await prisma.employeeWorkRuleAcknowledgement.deleteMany();
  await prisma.companyWorkRule.deleteMany();
  await prisma.workplaceIncident.deleteMany();
  await prisma.companyIncidentSetting.deleteMany();
  await prisma.aiUsageLog.deleteMany();
  await prisma.companyPolicyDocument.deleteMany();
  await prisma.productTelemetryEvent.deleteMany();
  await prisma.notificationDelivery.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.payrollExport.deleteMany();
  await prisma.payrollItem.deleteMany();
  await prisma.annualLeaveSettlement.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.employeePaymentProfile.deleteMany();
  await prisma.companyWorktimeAgreementSetting.deleteMany();
  await prisma.companyPayrollRecordkeepingSetting.deleteMany();
  await prisma.companyPayrollAccountingSetting.deleteMany();
  await prisma.payrollComplianceProfile.deleteMany();
  await prisma.salaryProfile.deleteMany();
  await prisma.statutoryInsuranceRecord.deleteMany();
  await prisma.approvalEvent.deleteMany();
  await prisma.approvalTask.deleteMany();
  await prisma.formSubmission.deleteMany();
  await prisma.workflowTemplateStep.deleteMany();
  await prisma.formTemplate.deleteMany();
  await prisma.punchCorrectionRequest.deleteMany();
  await prisma.overtimeRequest.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.leavePolicy.deleteMany();
  await prisma.companyCalendarReview.deleteMany();
  await prisma.attendanceException.deleteMany();
  await prisma.attendancePeriodSignoff.deleteMany();
  await prisma.clockEvent.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.workSchedule.deleteMany();
  await prisma.ruleVersion.deleteMany();
  await prisma.lawRule.deleteMany();
  await prisma.employeeEmploymentTerm.deleteMany();
  await prisma.employeeLaborRosterProfile.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.employeeOffboardingTask.deleteMany();
  await prisma.employeeLifecycleEvent.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.userExternalIdentity.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.department.deleteMany();
  await prisma.tenantSubscription.deleteMany();
  await prisma.companyOperationalResilienceSetting.deleteMany();
  await prisma.companyNotificationSetting.deleteMany();
  await prisma.companyFileStorageSetting.deleteMany();
  await prisma.companySecuritySetting.deleteMany();
  await prisma.company.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      name: "HR One Demo Tenant",
      slug: "hr-one-demo",
      plan: "demo",
    },
  });

  await prisma.tenantSubscription.create({
    data: {
      tenantId: tenant.id,
      plan: "demo",
      status: "trial",
      seatLimit: 10,
      activeSeatCount: 6,
      trialEndsAt: new Date("2026-06-27T00:00:00.000Z"),
      contractStartsAt: null,
      contractEndsAt: null,
      renewalNoticeDays: 30,
      billingContactEmail: "owner@hrone.test",
      contractRef: null,
      contractHash: null,
      paymentCollectionMode: "manual_invoice",
      verificationStatus: "unverified",
      lastReviewedAt: null,
    },
  });

  const company = await prisma.company.create({
    data: {
      tenantId: tenant.id,
      name: "和睿科技",
      legalName: "和睿科技股份有限公司",
      taxId: "DEMO-TAX-ID",
    },
  });

  await prisma.companySecuritySetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      mfaRequiredForAdmins: true,
      mfaRequiredForEmployees: false,
      ssoEnabled: false,
      ssoProvider: null,
      ssoIssuerUrl: null,
      ssoClientId: null,
      ssoJwksUrl: null,
      passwordMinLength: 12,
      passwordRequiresNumber: true,
      passwordRequiresSymbol: true,
      sessionTimeoutMinutes: 480,
      idleTimeoutMinutes: 60,
      allowedEmailDomainsJson: ["hrone.test"],
    },
  });

  const privacyConsentBody =
    "HR One processes employee personal data for employment administration, attendance, leave, payroll, benefits, legal compliance, audit evidence, and employee self-service. Sensitive HR decisions remain human-reviewed.";
  const privacyPolicyHash = hash(JSON.stringify({
    version: "2026.01",
    title: "Employee personal data collection notice",
    body: privacyConsentBody,
    purpose: "Employment administration, attendance and leave management, payroll preparation, statutory compliance, internal audit, and employee service delivery.",
    retentionYears: 7,
  }));

  await prisma.companyPrivacySetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      consentVersion: "2026.01",
      consentTitle: "Employee personal data collection notice",
      consentBody: privacyConsentBody,
      collectionPurpose:
        "Employment administration, attendance and leave management, payroll preparation, statutory compliance, internal audit, and employee service delivery.",
      requiresEmployeeAcknowledgement: true,
      dataRetentionYears: 7,
      dataSubjectRequestResponseDays: 30,
      deletionReviewRequired: true,
      crossBorderTransferEnabled: false,
      subprocessorsJson: [],
      verificationStatus: "unverified",
      lastReviewedAt: null,
    },
  });

  await prisma.companyTrainingSetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      onboardingTrainingRequired: true,
      targetCompletionDays: 7,
      maxFirstWeekMinutes: 10,
      autoAssignNewHires: true,
      verificationStatus: "unverified",
      lastReviewedAt: null,
    },
  });

  await prisma.companyIncidentSetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      reportingEnabled: true,
      anonymousReportingEnabled: false,
      severeIncidentNotifyHours: 8,
      investigationTargetDays: 7,
      harassmentPolicyVersion: "2026.01",
      safetyPolicyVersion: "2026.01",
      authorityReportRequired: true,
      verificationStatus: "unverified",
      lastReviewedAt: null,
    },
  });

  await prisma.companyPayrollAccountingSetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      grossPayrollDebitAccountCode: "6110",
      grossPayrollDebitAccountName: "Payroll expense",
      employerContributionDebitAccountCode: "6120",
      employerContributionDebitAccountName: "Employer statutory expense",
      deductionCreditAccountCode: "2210",
      deductionCreditAccountName: "Payroll deductions payable",
      netPayableCreditAccountCode: "2220",
      netPayableCreditAccountName: "Salary payable",
    },
  });

  await prisma.companyPayrollRecordkeepingSetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      wageRosterRetentionDays: 365 * 5,
      employeePayslipEnabled: true,
      wageCalculationDetailsEnabled: true,
      laborInspectionExportEnabled: true,
    },
  });

  await prisma.companyPolicyDocument.createMany({
    data: defaultApprovedPolicyDocs.map((doc) => ({
      tenantId: tenant.id,
      companyId: company.id,
      title: doc.title,
      category: doc.category,
      status: doc.status,
      version: doc.version,
      sourceRef: doc.sourceRef,
      excerpt: doc.excerpt,
      keywordsJson: doc.keywords,
      approvedByUserId: null,
      approvedAt: doc.approvedAt,
    })),
  });

  await prisma.companyFileStorageSetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      provider: "demo_object_storage",
      bucketName: "hr-one-demo-vault",
      region: "tw-demo",
      basePrefix: "hr-one",
      kmsKeyRef: null,
      malwareScanningRequired: true,
      signedUrlTtlMinutes: 10,
      maxFileSizeMb: 25,
      allowedMimeTypesJson: ["application/pdf", "image/jpeg", "image/png", "text/csv"],
      retentionDays: 2555,
      verificationStatus: "unverified",
      lastVerifiedAt: null,
      verificationNote: "Demo storage is intentionally unverified for production launch.",
    },
  });

  await prisma.companyNotificationSetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      inAppEnabled: true,
      emailEnabled: false,
      lineEnabled: false,
      slackEnabled: false,
      teamsEnabled: false,
      externalSummaryOnly: true,
      approvalSubmittedEnabled: true,
      approvalDecisionEnabled: true,
      payrollReleasedEnabled: true,
      systemAlertEnabled: true,
    },
  });

  await prisma.companyOperationalResilienceSetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      backupProvider: "not_configured",
      backupSchedule: "daily",
      backupRetentionDays: 0,
      backupEnabled: false,
      restoreDrillStatus: "not_tested",
      recoveryTimeObjectiveHours: 24,
      recoveryPointObjectiveHours: 24,
      verificationStatus: "unverified",
      verificationNote: "Demo workspace is intentionally unverified for production resilience.",
    },
  });

  const roles = await Promise.all(
    [
      ["owner", "Owner", "Company owner and executive view"],
      ["hr_admin", "HR Admin", "HR operations and employee administration"],
      ["manager", "Manager", "Team approvals and team visibility"],
      ["employee", "Employee", "Employee self-service"],
    ].map(([key, name, description]) =>
      prisma.role.create({
        data: {
          tenantId: tenant.id,
          key: key as RoleKey,
          name,
          description,
        },
      }),
    ),
  );

  const roleByKey = Object.fromEntries(roles.map((role) => [role.key, role]));

  const [peopleOps, product] = await Promise.all([
    prisma.department.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        name: "People Operations",
        code: "POPS",
      },
    }),
    prisma.department.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        name: "Product Engineering",
        code: "ENG",
      },
    }),
  ]);

  const defaultShiftTemplate = await prisma.shiftTemplate.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      code: "REGULAR_DAY",
      name: "Regular 09:00-18:00",
      status: "active",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      scheduledMinutes: 480,
      crossesMidnight: false,
      eligibleWeekdays: [1, 2, 3, 4, 5],
      notes: "Seed default shift template; HR should review before rollout.",
    },
  });

  const users = await Promise.all(
    [
      ["owner@hrone.test", "王執行長", "owner"],
      ["hr@hrone.test", "林人資", "hr_admin"],
      ["manager@hrone.test", "陳主管", "manager"],
      ["employee1@hrone.test", "張小安", "employee"],
      ["employee2@hrone.test", "李小真", "employee"],
      ["employee3@hrone.test", "黃小宇", "employee"],
    ].map(([email, displayName]) =>
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          displayName,
        },
      }),
    ),
  );

  const [ownerUser, hrUser, managerUser, employeeOneUser, employeeTwoUser, employeeThreeUser] = users;

  await prisma.userExternalIdentity.createMany({
    data: users.map((user) => ({
      tenantId: tenant.id,
      userId: user.id,
      provider: "demo_oidc",
      issuer: "https://login.hrone.test/demo/v2.0",
      subject: `demo:${user.email}`,
      emailAtLink: user.email,
      lastSeenAt: new Date("2026-06-12T00:00:00.000Z"),
    })),
  });

  const managerEmployee = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      userId: managerUser.id,
      departmentId: product.id,
      employeeNo: "E002",
      displayName: managerUser.displayName,
      jobTitle: "Engineering Manager",
      hireDate: new Date("2023-03-01T00:00:00.000Z"),
    },
  });

  const [hrEmployee, employeeOne, employeeTwo, employeeThree] = await Promise.all([
    prisma.employee.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        userId: hrUser.id,
        departmentId: peopleOps.id,
        employeeNo: "E001",
        displayName: hrUser.displayName,
        jobTitle: "HR Admin",
        hireDate: new Date("2022-08-15T00:00:00.000Z"),
      },
    }),
    prisma.employee.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        userId: employeeOneUser.id,
        departmentId: product.id,
        managerId: managerEmployee.id,
        employeeNo: "E003",
        displayName: employeeOneUser.displayName,
        jobTitle: "Frontend Engineer",
        hireDate: new Date("2024-01-10T00:00:00.000Z"),
      },
    }),
    prisma.employee.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        userId: employeeTwoUser.id,
        departmentId: product.id,
        managerId: managerEmployee.id,
        employeeNo: "E004",
        displayName: employeeTwoUser.displayName,
        jobTitle: "Product Designer",
        hireDate: new Date("2024-02-01T00:00:00.000Z"),
      },
    }),
    prisma.employee.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        userId: employeeThreeUser.id,
        departmentId: product.id,
        managerId: managerEmployee.id,
        employeeNo: "E005",
        displayName: employeeThreeUser.displayName,
        jobTitle: "Backend Engineer",
        hireDate: new Date("2024-05-20T00:00:00.000Z"),
      },
    }),
  ]);

  await prisma.employeePrivacyConsent.createMany({
    data: [
      {
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: hrEmployee.id,
        consentVersion: "2026.01",
        consentTitle: "Employee personal data collection notice",
        policyHash: privacyPolicyHash,
        source: "seed",
        acceptedByUserId: hrUser.id,
        acceptedAt: new Date("2026-06-01T01:00:00.000Z"),
      },
      {
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: managerEmployee.id,
        consentVersion: "2026.01",
        consentTitle: "Employee personal data collection notice",
        policyHash: privacyPolicyHash,
        source: "seed",
        acceptedByUserId: managerUser.id,
        acceptedAt: new Date("2026-06-01T01:05:00.000Z"),
      },
    ],
  });

  const trainingCourse = await prisma.trainingCourse.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      title: "HR One basics and data safety",
      category: "Onboarding",
      description:
        "A short guided walkthrough for clocking in, requesting leave, checking payslips, and protecting personal data.",
      version: "2026.01",
      status: "active",
      requiredForOnboarding: true,
      estimatedMinutes: 8,
      sourceRef: "demo://training/hr-one-basics",
      publishedAt: new Date("2026-06-01T00:00:00.000Z"),
      createdByUserId: hrUser.id,
    },
  });

  await prisma.employeeTrainingAssignment.createMany({
    data: [
      {
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: hrEmployee.id,
        courseId: trainingCourse.id,
        status: "completed",
        dueAt: new Date("2026-06-08T00:00:00.000Z"),
        completedAt: new Date("2026-06-02T00:00:00.000Z"),
        acknowledgementHash: hash(`${hrEmployee.id}:${trainingCourse.id}:2026.01`),
        assignedByUserId: hrUser.id,
      },
      {
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: managerEmployee.id,
        courseId: trainingCourse.id,
        status: "assigned",
        dueAt: new Date("2026-06-08T00:00:00.000Z"),
        assignedByUserId: hrUser.id,
      },
    ],
  });

  const workRule = await prisma.companyWorkRule.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      title: "Employee handbook and work rules",
      category: "Company rules",
      summary:
        "Covers attendance, leave, overtime approval, payroll close evidence, information security, and respectful workplace expectations.",
      version: "2026.01",
      status: "active",
      reviewStatus: "approved",
      sourceRef: "demo://work-rules/employee-handbook-2026",
      contentHash: hash("demo-work-rules-2026.01"),
      acknowledgementRequired: true,
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      publishedAt: new Date("2026-06-01T00:00:00.000Z"),
      createdByUserId: hrUser.id,
      updatedByUserId: hrUser.id,
    },
  });

  await prisma.employeeWorkRuleAcknowledgement.createMany({
    data: [hrEmployee, managerEmployee, employeeOne, employeeTwo, employeeThree].map((employee, index) => ({
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employee.id,
      workRuleId: workRule.id,
      version: workRule.version,
      acknowledgementHash: hash(`${employee.id}:${workRule.id}:${workRule.version}`),
      source: "seed",
      acknowledgedAt: new Date(Date.UTC(2026, 5, 1, 1, index)),
    })),
  });

  const employmentTerm = await prisma.employeeEmploymentTerm.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employeeOne.id,
      version: "2026.01",
      status: "active",
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      jobTitle: employeeOne.jobTitle,
      workLocation: "Taipei office / approved remote work",
      regularWorkSchedule: "Regular 09:00-18:00, one-hour break, based on active shift policy.",
      wagePaymentDay: "Monthly, paid by the 5th business day.",
      wageBasisSummaryHash: hash(`${employeeOne.id}:salary-profile-linked`),
      benefitsSummary: "Statutory insurance, labor pension, annual leave, and company benefits follow active HR One policies.",
      sourceRef: "demo://employment-terms/2026.01",
      acknowledgementRequired: true,
      createdByUserId: hrUser.id,
      updatedByUserId: hrUser.id,
    },
  });

  await prisma.employeeEmploymentTerm.update({
    where: { id: employmentTerm.id },
    data: {
      acknowledgementHash: hash(`${employeeOne.id}:employment-terms:2026.01`),
      acknowledgedAt: new Date("2026-06-01T02:00:00.000Z"),
    },
  });

  await prisma.employeeLaborRosterProfile.createMany({
    data: [hrEmployee, managerEmployee, employeeOne, employeeTwo, employeeThree].map((employee, index) => {
      const missingFields: string[] = [];
      const verificationStatus = "verified";
      return {
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: employee.id,
        status: "complete",
        legalNameHash: hash(`${employee.id}:legal-name:${employee.displayName}`),
        nationalIdHash: hash(`${employee.id}:national-id`),
        birthDate: new Date(Date.UTC(1990 + index, 0, 1)),
        gender: index === 1 ? "male" : "female",
        nationality: "TW",
        registeredAddressHash: hash(`${employee.id}:registered-address`),
        emergencyContactHash: hash(`${employee.id}:emergency-contact`),
        educationSummary: "Highest education evidence reviewed.",
        workExperienceSummary: "Prior work experience reviewed.",
        rosterSourceRef: "demo://labor-roster/2026.01",
        requiredFieldsJson: [
          "legal_name",
          "national_id",
          "birth_date",
          "gender",
          "nationality",
          "registered_address",
          "emergency_contact",
          "hire_date",
          "job_title",
          "department",
        ],
        missingFieldsJson: missingFields,
        verificationStatus,
        lastReviewedAt: verificationStatus === "verified" ? new Date("2026-06-01T00:00:00.000Z") : null,
        reviewedByUserId: hrUser.id,
      };
    }),
  });

  await Promise.all(
    [
      [ownerUser.id, "owner"],
      [hrUser.id, "hr_admin"],
      [managerUser.id, "manager"],
      [employeeOneUser.id, "employee"],
      [employeeTwoUser.id, "employee"],
      [employeeThreeUser.id, "employee"],
    ].map(([userId, roleKey]) =>
      prisma.userRole.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          userId,
          roleId: roleByKey[roleKey].id,
          scopeType: "company",
          scopeId: company.id,
        },
      }),
    ),
  );

  const overtimeRule = await prisma.lawRule.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      jurisdiction: "TW",
      ruleKey: "tw_labor_standards_overtime",
      name: "Taiwan Labor Standards Act overtime",
      description: "Configurable Article 24 overtime tiers with official source references.",
      category: "overtime",
      status: "active",
    },
  });

  await prisma.ruleVersion.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      lawRuleId: overtimeRule.id,
      version: "2026.06-demo",
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      definitionJson: {
        type: "taiwan_labor_standards_overtime",
        regularDayOvertimeTiers: defaultTaiwanLaborStandardsConfig.regularDayOvertimeTiers,
        emergencyOvertimeMultiplier: defaultTaiwanLaborStandardsConfig.emergencyOvertimeMultiplier,
        sources: defaultTaiwanLaborStandardsConfig.sources.filter((source) => source.id === "tw-lsa-article-24"),
        inputs: ["regularMinutes", "overtimeMinutes", "workDate"],
        outputs: ["overtimeBuckets"],
        aiUse: "assistive_explanations_only",
        validationSummary: taiwanRuleValidationSummary,
        sourceFreshness: taiwanSourceFreshnessSummary,
      },
      testCasesJson: taiwanRuleTestCases,
      status: "active",
    },
  });

  const laborSettingsRule = await prisma.lawRule.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      jurisdiction: "TW",
      ruleKey: "tw_labor_standards_settings",
      name: "Taiwan labor standards settings",
      description: "Company-adjustable Taiwan labor standards configuration with official source references.",
      category: "labor_standards",
      status: "active",
    },
  });

  await prisma.ruleVersion.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      lawRuleId: laborSettingsRule.id,
      version: defaultTaiwanLaborStandardsConfig.version,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      definitionJson: {
        type: "taiwan_labor_standards_settings",
        taiwanLaborStandards: defaultTaiwanLaborStandardsConfig,
        sources: defaultTaiwanLaborStandardsConfig.sources,
        validationSummary: taiwanRuleValidationSummary,
        sourceFreshness: taiwanSourceFreshnessSummary,
      },
      testCasesJson: taiwanRuleTestCases,
      status: "active",
    },
  });

  const payrollRule = await prisma.lawRule.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      jurisdiction: "TW",
      ruleKey: "tw_payroll_mvp",
      name: "Taiwan payroll MVP formula",
      description: "Configurable payroll formula placeholder for monthly salary, allowances, deductions, and overtime.",
      category: "payroll",
      status: "active",
    },
  });

  await prisma.ruleVersion.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      lawRuleId: payrollRule.id,
      version: "2026.06-demo",
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      definitionJson: {
        type: "taiwan_payroll_mvp",
        taiwanLaborStandards: defaultTaiwanLaborStandardsConfig,
        standardMonthlyHours: defaultTaiwanLaborStandardsConfig.payrollStandardMonthlyHours,
        formulas: ["baseSalary", "recurringAllowances", "approvedOvertime", "recurringDeductions"],
        validationSummary: taiwanRuleValidationSummary,
        sourceFreshness: taiwanSourceFreshnessSummary,
      },
      testCasesJson: taiwanRuleTestCases,
      status: "active",
    },
  });

  const leavePolicies = await Promise.all(taiwanStatutoryLeaveRequirements.map((requirement) => prisma.leavePolicy.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      code: requirement.recommendedCode,
      name: requirement.name,
      annualUnits: requirement.annualUnits,
      unit: requirement.unit,
      attachmentRequired: requirement.category === "sick_leave" || requirement.category === "occupational_injury",
      statutoryCategory: requirement.category,
      eligibilityRule: requirement.eligibilityRule,
      payRatePercent: requirement.payRatePercent,
      annualLimitNote: requirement.note,
      requiresLegalReview: false,
      accrualMethod: requirement.accrualMethod,
      paid: requirement.paid,
    },
  })));
  const leavePolicy = leavePolicies.find((policy) => policy.code === "annual") ?? leavePolicies[0];
  if (!leavePolicy) throw new Error("Annual leave policy seed failed.");

  await prisma.leaveBalance.createMany({
    data: [hrEmployee, managerEmployee, employeeOne, employeeTwo, employeeThree].map(
      (employee) => ({
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: employee.id,
        leavePolicyId: leavePolicy.id,
        grantedUnits: 14,
        usedUnits: 2,
        pendingUnits: 0,
        remainingUnits: 12,
      }),
    ),
  });

  await prisma.attendancePolicy.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
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
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      createdByUserId: hrUser.id,
    },
  });

  await prisma.companyWorktimeAgreementSetting.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      approvalType: "labor_management_conference",
      approvalOnFile: true,
      evidenceRef: "demo://labor-management-conference/2026",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-12-31T00:00:00.000Z"),
      monthlyOvertimeLimitMinutes: 54 * 60,
      threeMonthOvertimeLimitMinutes: 138 * 60,
      localAuthorityReportRequired: false,
      localAuthorityReportFiled: false,
      verificationStatus: "verified",
      verificationNote: "Demo evidence only. Replace with the company's own approval record before production.",
      updatedByUserId: hrUser.id,
    },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const scheduledStart = new Date(today);
  scheduledStart.setUTCHours(1, 0, 0, 0);
  const scheduledEnd = new Date(today);
  scheduledEnd.setUTCHours(10, 0, 0, 0);

  await prisma.workSchedule.createMany({
    data: [hrEmployee, managerEmployee, employeeOne, employeeTwo, employeeThree].map(
      (employee) => ({
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: employee.id,
        shiftTemplateId: defaultShiftTemplate.id,
        workDate: today,
        scheduledStart,
        scheduledEnd,
        shiftName: "Regular 09:00-18:00",
      }),
    ),
  });

  await prisma.companyCalendarDay.createMany({
    data: [
      {
        tenantId: tenant.id,
        companyId: company.id,
        calendarDate: new Date("2026-01-01T00:00:00.000Z"),
        dayType: "national_holiday",
        name: "New Year holiday",
        paid: true,
        requiresWork: false,
        source: "government",
        notes: "Seed configurable holiday. Verify official source before production import.",
        createdByUserId: hrUser.id,
      },
      {
        tenantId: tenant.id,
        companyId: company.id,
        calendarDate: new Date("2026-02-07T00:00:00.000Z"),
        dayType: "makeup_workday",
        name: "Makeup workday",
        paid: true,
        requiresWork: true,
        source: "company",
        notes: "Seed makeup workday for schedule/payroll review.",
        createdByUserId: hrUser.id,
      },
    ],
  });

  await prisma.companyCalendarReview.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      calendarYear: 2026,
      sourceTitle: "Demo DGPA annual work calendar source",
      sourceUrl: "https://www.dgpa.gov.tw/",
      sourceCheckedAt: new Date("2026-06-12T00:00:00.000Z"),
      reviewedBy: "HR One demo seed",
      reviewedAt: new Date("2026-06-12T00:00:00.000Z"),
      reviewStatus: "pending_review",
      nationalHolidayCount: 1,
      makeupWorkdayCount: 1,
      companyHolidayCount: 0,
      notes: "Demo review remains pending; production tenants must approve a customer-reviewed annual calendar.",
      updatedByUserId: hrUser.id,
    },
  });

  const exceptionRecord = await prisma.attendanceRecord.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employeeTwo.id,
      workDate: today,
      status: "missing_clock_out",
    },
  });

  await prisma.attendanceException.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employeeTwo.id,
      attendanceRecordId: exceptionRecord.id,
      exceptionType: "missing_clock_out",
      severity: "warning",
    },
  });

  const signoffPeriodStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const signoffPeriodEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  await prisma.attendancePeriodSignoff.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employeeOne.id,
      periodStart: signoffPeriodStart,
      periodEnd: signoffPeriodEnd,
      recordCount: 1,
      exceptionCount: 0,
      summaryHash: hash(`${employeeOne.id}:${signoffPeriodStart.toISOString()}:attendance-signoff`),
      source: "seed",
      signedAt: new Date(),
    },
  });

  await prisma.salaryProfile.createMany({
    data: [
      [hrEmployee.id, 62000, 2500, 1200],
      [managerEmployee.id, 78000, 3000, 1800],
      [employeeOne.id, 56000, 2000, 1000],
      [employeeTwo.id, 54000, 2000, 1000],
      [employeeThree.id, 58000, 2000, 1000],
    ].map(([employeeId, baseSalary, allowance, deduction]) => ({
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: String(employeeId),
      baseSalary: Number(baseSalary),
      recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: Number(allowance) }],
      recurringDeductions: [{ code: "welfare", name: "Welfare deduction", amount: Number(deduction) }],
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    })),
  });

  await prisma.employeePaymentProfile.createMany({
    data: [
      [hrEmployee.id, "Lin HR", "1111"],
      [managerEmployee.id, "Chen Manager", "2222"],
      [employeeOne.id, "Chang Xiao An", "3333"],
      [employeeTwo.id, "Lee Xiao Zhen", "4444"],
      [employeeThree.id, "Huang Xiao Yu", "5555"],
    ].map(([employeeId, accountName, suffix]) => ({
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: String(employeeId),
      paymentMethod: "bank_transfer",
      bankCode: "004",
      bankBranchCode: "0123",
      accountName: String(accountName),
      accountNumberHash: hash(`demo-payment-${employeeId}-${suffix}`),
      accountNumberLast4: String(suffix),
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      createdByUserId: hrUser.id,
    })),
  });

  await prisma.payrollComplianceProfile.createMany({
    data: [
      [hrEmployee.id, "resident", 0, null, null, null, null],
      [managerEmployee.id, "resident", 2, null, 80200, null, null],
      [employeeOne.id, "resident", 1, null, null, null, null],
      [employeeTwo.id, "resident", 0, null, null, null, null],
      [employeeThree.id, "non_resident", 0, null, null, null, 0.18],
    ].map(([
      employeeId,
      taxResidency,
      dependentCount,
      laborInsuranceMonthlyWage,
      healthInsuranceMonthlyWage,
      laborPensionMonthlyWage,
      nonResidentWithholdingRate,
    ]) => ({
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: String(employeeId),
      taxResidency: String(taxResidency),
      dependentCount: Number(dependentCount),
      laborInsuranceMonthlyWage: laborInsuranceMonthlyWage === null ? null : Number(laborInsuranceMonthlyWage),
      healthInsuranceMonthlyWage: healthInsuranceMonthlyWage === null ? null : Number(healthInsuranceMonthlyWage),
      laborPensionMonthlyWage: laborPensionMonthlyWage === null ? null : Number(laborPensionMonthlyWage),
      incomeTaxWithholdingMethod:
        taxResidency === "non_resident" ? "non_resident_flat" : "annualized_progressive",
      nonResidentWithholdingRate: nonResidentWithholdingRate === null ? null : Number(nonResidentWithholdingRate),
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    })),
  });

  const statutoryInsuranceTypes = [
    "labor_insurance",
    "employment_insurance",
    "occupational_accident_insurance",
    "national_health_insurance",
    "labor_pension",
  ];
  const seededEmployees = [hrEmployee, managerEmployee, employeeOne, employeeTwo, employeeThree];
  await prisma.statutoryInsuranceRecord.createMany({
    data: seededEmployees.flatMap((employee) =>
      statutoryInsuranceTypes.map((insuranceType) => {
        const pending = employee.id === employeeThree.id &&
          (insuranceType === "labor_insurance" || insuranceType === "employment_insurance");
        const evidenceRef = pending ? null : `portal://${employee.employeeNo}/${insuranceType}`;
        return {
          tenantId: tenant.id,
          companyId: company.id,
          employeeId: employee.id,
          insuranceType,
          status: pending ? "pending" : "enrolled",
          dueDate: employee.hireDate,
          enrolledAt: pending ? null : employee.hireDate,
          evidenceRef,
          evidenceHash: evidenceRef ? hash(evidenceRef) : null,
          updatedByUserId: hrUser.id,
        };
      }),
    ),
  });

  const equipmentForm = await prisma.formTemplate.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      title: "Equipment request",
      description: "Request work equipment or accessories.",
      category: "Employee service",
      fieldsJson: [
        { id: "item", label: "Requested item", type: "text", required: true },
        { id: "needed_by", label: "Needed by", type: "date", required: true },
        { id: "reason", label: "Reason", type: "textarea", required: true },
      ],
      visibilityRulesJson: [],
    },
  });

  await prisma.workflowTemplateStep.createMany({
    data: [
      {
        tenantId: tenant.id,
        companyId: company.id,
        formTemplateId: equipmentForm.id,
        stepOrder: 1,
        approverType: "direct_manager",
        conditionJson: Prisma.JsonNull,
      },
      {
        tenantId: tenant.id,
        companyId: company.id,
        formTemplateId: equipmentForm.id,
        stepOrder: 2,
        approverType: "hr_admin",
        conditionJson: Prisma.JsonNull,
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      actorUserId: ownerUser.id,
      action: "create",
      entityType: "seed",
      entityId: tenant.id,
      afterHash: hash(`${tenant.id}:${company.id}:seed`),
      metadataJson: {
        source: "prisma.seed",
        pii: "redacted",
        payroll: "not_logged",
      },
    },
  });

  const telemetryEvents: SeedTelemetryEvent[] = [
    ["leave_request_success", "leave", "first_success", 52000, true, {}],
    ["leave_request_success", "leave", "first_success", 58000, true, {}],
    ["manager_approval_done", "approval", "manager_leave", 12000, true, {}],
    ["manager_approval_done", "approval", "manager_leave", 14000, true, {}],
    ["mobile_task_started", "mobile_task", "employee_self_service", null, true, {}],
    ["mobile_task_completed", "mobile_task", "employee_self_service", null, true, {}],
    ["mobile_task_started", "mobile_task", "employee_self_service", null, true, {}],
    ["form_template_created", "form_builder", "hr_self_serve", null, true, { engineeringSupport: false }],
    ["form_template_created", "form_builder", "hr_self_serve", null, true, { engineeringSupport: true }],
  ];

  await prisma.productTelemetryEvent.createMany({
    data: telemetryEvents.map(([eventName, workflow, step, durationMs, success, metadata]) => ({
      tenantId: tenant.id,
      companyId: company.id,
      actorUserId: hrUser.id,
      actorEmployeeId: hrEmployee.id,
      eventName: String(eventName),
      workflow: String(workflow),
      step: String(step),
      durationMs: durationMs === null ? null : Number(durationMs),
      success: Boolean(success),
      metadataJson: metadata,
      occurredAt: new Date(),
    })),
  });

  console.log("Seeded HR One demo tenant:", {
    tenant: tenant.slug,
    company: company.name,
    demoUsers: users.map((user) => user.email),
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

main()
  .catch((error) => {
    console.error("Seed failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown seed error",
    });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
