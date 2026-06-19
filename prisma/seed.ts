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
  await prisma.employeeAnnouncementReceipt.deleteMany();
  await prisma.companyAnnouncement.deleteMany();
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
  await prisma.jobPosition.deleteMany();
  await prisma.jobLevel.deleteMany();
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
      seatLimit: 50,
      activeSeatCount: 26,
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
      verificationStatus: "verified",
      lastReviewedAt: new Date("2026-06-01T00:00:00.000Z"),
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
      verificationStatus: "verified",
      lastReviewedAt: new Date("2026-06-01T00:00:00.000Z"),
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

  const [levelOne, levelTwo, managerLevel] = await Promise.all([
    prisma.jobLevel.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        code: "L1",
        name: "專員 / Associate",
        rank: 1,
        description: "可獨立完成日常任務的初階到中階職務。",
      },
    }),
    prisma.jobLevel.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        code: "L2",
        name: "資深專員 / Specialist",
        rank: 2,
        description: "可負責跨部門任務或核心模組的資深職務。",
      },
    }),
    prisma.jobLevel.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        code: "M1",
        name: "主管 / Manager",
        rank: 10,
        description: "具備直屬團隊管理與簽核責任的主管職等。",
      },
    }),
  ]);

  const jobPositions = await Promise.all([
    jobPosition("HR Admin", "HR-ADMIN", "People", peopleOps.id, levelTwo.id),
    jobPosition("Engineering Manager", "ENG-MGR", "Engineering", product.id, managerLevel.id),
    jobPosition("Frontend Engineer", "FE", "Engineering", product.id, levelTwo.id),
    jobPosition("Backend Engineer", "BE", "Engineering", product.id, levelTwo.id),
    jobPosition("Product Designer", "PD", "Product", product.id, levelTwo.id),
    jobPosition("Customer Success Specialist", "CS", "Operations", peopleOps.id, levelOne.id),
    jobPosition("Operations Coordinator", "OPS-COORD", "Operations", peopleOps.id, levelOne.id),
    jobPosition("Product Specialist", "PROD-SPEC", "Product", product.id, levelOne.id),
    jobPosition("QA Engineer", "QA", "Engineering", product.id, levelOne.id),
    jobPosition("Care Program Coordinator", "CARE-COORD", "Care", peopleOps.id, levelOne.id),
    jobPosition("Finance Assistant", "FIN-ASST", "Finance", peopleOps.id, levelOne.id),
    jobPosition("People Operations Associate", "POPS-ASSOC", "People", peopleOps.id, levelOne.id),
    jobPosition("Service Designer", "SVC-DES", "Product", product.id, levelOne.id),
  ]);
  const jobPositionByTitle = Object.fromEntries(jobPositions.map((position) => [position.title, position]));

  function jobPosition(title: string, code: string, family: string, departmentId: string, levelId: string) {
    return prisma.jobPosition.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        departmentId,
        levelId,
        code,
        title,
        family,
        description: `${title} seed position. HR should review scope and level before rollout.`,
      },
    });
  }

  const betaPilotEmployeeNames = [
    "周宜庭",
    "吳柏翰",
    "鄭雅婷",
    "蔡明哲",
    "許家瑋",
    "郭怡君",
    "曾子豪",
    "葉欣怡",
    "邱俊廷",
    "廖佳玲",
    "賴冠宇",
    "徐詠晴",
    "宋承翰",
    "潘郁婷",
    "何孟潔",
    "羅建宏",
    "高庭萱",
    "戴宇翔",
    "施佩穎",
    "江品皓",
  ];
  const userSeeds = [
    { email: "owner@hrone.test", displayName: "王執行長", roleKey: "owner" as const },
    { email: "hr@hrone.test", displayName: "林人資", roleKey: "hr_admin" as const },
    { email: "manager@hrone.test", displayName: "陳主管", roleKey: "manager" as const },
    { email: "employee1@hrone.test", displayName: "張小安", roleKey: "employee" as const },
    { email: "employee2@hrone.test", displayName: "李小真", roleKey: "employee" as const },
    { email: "employee3@hrone.test", displayName: "黃小宇", roleKey: "employee" as const },
    ...betaPilotEmployeeNames.map((displayName, index) => ({
      email: `pilot${String(index + 1).padStart(2, "0")}@hrone.test`,
      displayName,
      roleKey: "employee" as const,
    })),
  ];

  const users = await Promise.all(
    userSeeds.map(({ email, displayName }) =>
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          displayName,
        },
      }),
    ),
  );

  const [ownerUser, hrUser, managerUser, employeeOneUser, employeeTwoUser, employeeThreeUser, ...betaPilotUsers] =
    users;

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
      jobPositionId: jobPositionByTitle["Engineering Manager"].id,
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
        jobPositionId: jobPositionByTitle["HR Admin"].id,
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
        jobPositionId: jobPositionByTitle["Frontend Engineer"].id,
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
        jobPositionId: jobPositionByTitle["Product Designer"].id,
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
        jobPositionId: jobPositionByTitle["Backend Engineer"].id,
        managerId: managerEmployee.id,
        employeeNo: "E005",
        displayName: employeeThreeUser.displayName,
        jobTitle: "Backend Engineer",
        hireDate: new Date("2024-05-20T00:00:00.000Z"),
      },
    }),
  ]);

  const betaPilotEmployees = await Promise.all(
    betaPilotUsers.map((user, index) =>
      prisma.employee.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          userId: user.id,
          departmentId: index % 5 === 0 ? peopleOps.id : product.id,
          jobPositionId: jobPositionByTitle[betaPilotJobTitle(index)]?.id,
          managerId: managerEmployee.id,
          employeeNo: `E${String(index + 6).padStart(3, "0")}`,
          displayName: user.displayName,
          jobTitle: betaPilotJobTitle(index),
          hireDate: new Date(Date.UTC(2024, index % 12, Math.min(25, index + 1))),
        },
      })
    ),
  );

  const seededEmployees = [
    hrEmployee,
    managerEmployee,
    employeeOne,
    employeeTwo,
    employeeThree,
    ...betaPilotEmployees,
  ];

  await prisma.employeePrivacyConsent.createMany({
    data: seededEmployees.map((employee, index) => ({
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employee.id,
      consentVersion: "2026.01",
      consentTitle: "Employee personal data collection notice",
      policyHash: privacyPolicyHash,
      source: "seed",
      acceptedByUserId: employee.userId ?? hrUser.id,
      acceptedAt: new Date(Date.UTC(2026, 5, 1, 1, index)),
    })),
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
    data: seededEmployees.map((employee, index) => ({
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employee.id,
      courseId: trainingCourse.id,
      status: "completed",
      dueAt: new Date("2026-06-08T00:00:00.000Z"),
      completedAt: new Date(Date.UTC(2026, 5, 2, 1, index)),
      acknowledgementHash: hash(`${employee.id}:${trainingCourse.id}:2026.01`),
      assignedByUserId: hrUser.id,
    })),
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
    data: seededEmployees.map((employee, index) => ({
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
    data: seededEmployees.map((employee, index) => {
      const missingFields: string[] = [];
      const verificationStatus = "verified";
      return {
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: employee.id,
        status: "complete",
        legalNameHash: hash(`${employee.id}:legal-name:${employee.displayName}`),
        nationalIdHash: hash(`${employee.id}:national-id`),
        birthDate: new Date(Date.UTC(1986 + (index % 20), 0, 1)),
        gender: index === 1 ? "male" : "female",
        nationality: "TW",
        hometown: "Taiwan",
        registeredAddressHash: hash(`${employee.id}:registered-address`),
        emergencyContactHash: hash(`${employee.id}:emergency-contact`),
        educationSummary: "Highest education evidence reviewed.",
        workExperienceSummary: "Prior work experience reviewed.",
        wageInfoHash: hash(`${employee.id}:labor-roster:wage-info`),
        laborInsuranceEnrollmentDate: new Date("2025-01-01T00:00:00.000Z"),
        rewardDisciplineSummaryHash: hash(`${employee.id}:labor-roster:reward-discipline`),
        injurySicknessSummaryHash: hash(`${employee.id}:labor-roster:injury-sickness`),
        otherNecessaryItemsHash: hash(`${employee.id}:labor-roster:other-necessary-items`),
        rosterSourceRef: "demo://labor-roster/2026.01",
        requiredFieldsJson: [
          "legal_name",
          "national_id",
          "birth_date",
          "gender",
          "nationality",
          "hometown",
          "registered_address",
          "emergency_contact",
          "wage_info",
          "labor_insurance_enrollment_date",
          "reward_discipline_summary",
          "injury_sickness_summary",
          "other_necessary_items",
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
    users.map((user, index) =>
      prisma.userRole.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          userId: user.id,
          roleId: roleByKey[userSeeds[index].roleKey].id,
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
    data: seededEmployees.map(
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
    data: seededEmployees.map(
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
    data: seededEmployees.map((employee, index) => ({
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employee.id,
      baseSalary: baseSalaryForEmployee(employee.employeeNo),
      recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: index < 2 ? 2500 : 2000 }],
      recurringDeductions: [{ code: "welfare", name: "Welfare deduction", amount: index < 2 ? 1200 : 1000 }],
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    })),
  });

  await prisma.employeePaymentProfile.createMany({
    data: seededEmployees.map((employee, index) => ({
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employee.id,
      paymentMethod: "bank_transfer",
      bankCode: "004",
      bankBranchCode: "0123",
      accountName: `HR One Demo ${employee.employeeNo}`,
      accountNumberHash: hash(`demo-payment-${employee.id}-${index}`),
      accountNumberLast4: String(1000 + index).slice(-4),
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      createdByUserId: hrUser.id,
    })),
  });

  await prisma.payrollComplianceProfile.createMany({
    data: seededEmployees.map((employee, index) => {
      const nonResident = employee.employeeNo === "E005";
      const dependentCount = index % 3;
      return {
      tenantId: tenant.id,
      companyId: company.id,
      employeeId: employee.id,
      taxResidency: nonResident ? "non_resident" : "resident",
      dependentCount,
      laborInsuranceMonthlyWage: null,
      healthInsuranceMonthlyWage: employee.employeeNo === "E002" ? 80200 : null,
      laborPensionMonthlyWage: null,
      incomeTaxWithholdingMethod: nonResident ? "non_resident_flat" : "annualized_progressive",
      nonResidentWithholdingRate: nonResident ? 0.18 : null,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      };
    }),
  });

  const statutoryInsuranceTypes = [
    "labor_insurance",
    "employment_insurance",
    "occupational_accident_insurance",
    "national_health_insurance",
    "labor_pension",
  ];
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

  const defaultFormTemplates = [
    formTemplate("請假單", "員工申請特休、病假、事假或其他假別。", "假勤", [
      field("leave_type", "假別", "select", ["特休", "病假", "事假", "公假", "喪假", "婚假"]),
      field("start_date", "開始日期", "date"),
      field("end_date", "結束日期", "date"),
      field("reason", "請假原因", "textarea"),
      field("attachment", "附件", "file", undefined, false),
    ]),
    formTemplate("預先加班單", "事前申請加班時段與原因。", "假勤", [
      field("work_date", "加班日期", "date"),
      field("start_time", "開始時間", "text"),
      field("end_time", "結束時間", "text"),
      field("reason", "加班原因", "textarea"),
    ]),
    formTemplate("加班單", "加班完成後送出實際加班紀錄。", "假勤", [
      field("work_date", "加班日期", "date"),
      field("actual_start_time", "實際開始時間", "text"),
      field("actual_end_time", "實際結束時間", "text"),
      field("work_summary", "工作內容", "textarea"),
    ]),
    formTemplate("銷假單", "取消已核准或待簽核的請假申請。", "假勤", [
      field("original_leave_no", "原請假單號", "text"),
      field("cancel_reason", "銷假原因", "textarea"),
    ]),
    formTemplate("忘刷申請單", "補登忘記打卡或設備異常的出勤時間。", "出勤", [
      field("work_date", "出勤日期", "date"),
      field("clock_time", "補登時間", "text"),
      field("punch_type", "補登類型", "select", ["上班", "下班"]),
      field("reason", "原因", "textarea"),
    ]),
    formTemplate("出差費用申請單", "申請出差交通、住宿或雜支費用。", "費用", [
      field("trip_date", "出差日期", "date"),
      field("destination", "出差地點", "text"),
      field("amount", "申請金額", "number"),
      field("receipt", "收據附件", "file"),
      field("reason", "出差事由", "textarea"),
    ]),
    formTemplate("居家遠端辦公申請單", "申請居家或遠端辦公日期與工作安排。", "出勤", [
      field("remote_date", "遠端日期", "date"),
      field("work_location", "工作地點", "text"),
      field("contact_phone", "緊急聯絡電話", "text"),
      field("work_plan", "工作安排", "textarea"),
    ]),
    formTemplate("人事異動單", "申請部門、職稱、主管或職務內容異動。", "人事", [
      field("change_type", "異動類型", "select", ["部門異動", "職稱異動", "主管異動", "工作內容異動"]),
      field("effective_date", "生效日", "date"),
      field("change_reason", "異動原因", "textarea"),
    ]),
    formTemplate("薪資異動單", "申請薪資、津貼或扣項異動，需人資與老闆審核。", "薪資", [
      field("effective_date", "生效日", "date"),
      field("adjustment_type", "調整類型", "select", ["本薪", "津貼", "扣項", "其他"]),
      field("business_reason", "調整原因", "textarea"),
    ]),
    formTemplate("離職申請表", "員工提出離職申請與交接規劃。", "人事", [
      field("last_work_date", "預計最後工作日", "date"),
      field("reason", "離職原因", "textarea"),
      field("handover_plan", "交接計畫", "textarea"),
    ]),
    formTemplate("文件證明申請單", "申請各類公司文件或證明。", "文件", [
      field("document_type", "文件類型", "select", ["一般證明", "服務證明", "其他"]),
      field("purpose", "用途", "textarea"),
    ]),
    formTemplate("勞健保證明申請單", "申請勞保、健保相關證明文件。", "文件", [
      field("certificate_type", "證明類型", "select", ["勞保", "健保", "勞健保"]),
      field("purpose", "用途", "textarea"),
    ]),
    formTemplate("在職證明申請單", "申請在職證明。", "文件", [
      field("language", "語言", "select", ["中文", "英文"]),
      field("purpose", "用途", "textarea"),
    ]),
    formTemplate("人員晉升表", "提出員工晉升建議與理由。", "人事", [
      field("target_title", "建議職稱", "text"),
      field("effective_date", "建議生效日", "date"),
      field("promotion_reason", "晉升理由", "textarea"),
    ]),
    formTemplate("新進人員表單", "新進人員到職資料與設備需求。", "人事", [
      field("onboard_date", "到職日", "date"),
      field("job_title", "職稱", "text"),
      field("equipment_need", "設備需求", "textarea", undefined, false),
    ]),
    formTemplate("人員進用申請單", "主管提出新增職缺或人員進用需求。", "招募", [
      field("position_title", "職缺名稱", "text"),
      field("headcount", "需求人數", "number"),
      field("hire_reason", "進用原因", "textarea"),
    ]),
    formTemplate("晤談紀錄單", "記錄員工關懷、績效溝通或離職晤談重點。", "人事", [
      field("interview_type", "晤談類型", "select", ["關懷晤談", "績效溝通", "離職晤談", "其他"]),
      field("interview_date", "晤談日期", "date"),
      field("summary", "紀錄摘要", "textarea"),
    ]),
  ];

  for (const templateInput of defaultFormTemplates) {
    const template = await prisma.formTemplate.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        title: templateInput.title,
        description: templateInput.description,
        category: templateInput.category,
        fieldsJson: templateInput.fields,
        visibilityRulesJson: [],
      },
    });

    await prisma.workflowTemplateStep.createMany({
      data: workflowStepsForTemplate(template.id).map((step) => ({
        tenantId: tenant.id,
        companyId: company.id,
        formTemplateId: template.id,
        stepOrder: step.stepOrder,
        approverType: step.approverType,
        conditionJson: Prisma.JsonNull,
      })),
    });
  }

  const payrollCloseAnnouncement = await prisma.companyAnnouncement.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      title: "六月薪資月結與出勤補正提醒",
      body: "請同仁於月底前確認出勤紀錄、補打卡與請假申請狀態；有缺漏請盡快送出申請。",
      category: "薪資月結",
      requireReceipt: true,
      publishedByUserId: hrUser.id,
      publishedAt: new Date("2026-06-01T01:00:00.000Z"),
    },
  });

  await prisma.employeeAnnouncementReceipt.createMany({
    data: seededEmployees.slice(0, 20).map((employee) => ({
      tenantId: tenant.id,
      companyId: company.id,
      announcementId: payrollCloseAnnouncement.id,
      employeeId: employee.id,
      receiptHash: hash(`${payrollCloseAnnouncement.id}:${employee.id}`),
      acknowledgedAt: new Date("2026-06-01T02:00:00.000Z"),
    })),
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

function betaPilotJobTitle(index: number) {
  const titles = [
    "Customer Success Specialist",
    "Operations Coordinator",
    "Product Specialist",
    "QA Engineer",
    "Care Program Coordinator",
    "Finance Assistant",
    "People Operations Associate",
    "Backend Engineer",
    "Frontend Engineer",
    "Service Designer",
  ];
  return titles[index % titles.length];
}

function baseSalaryForEmployee(employeeNo: string) {
  if (employeeNo === "E001") return 62000;
  if (employeeNo === "E002") return 78000;
  const sequence = Number(employeeNo.replace("E", ""));
  return 50000 + (sequence % 8) * 1500;
}

function formTemplate(
  title: string,
  description: string,
  category: string,
  fields: Array<ReturnType<typeof field>>,
) {
  return { title, description, category, fields };
}

function field(
  id: string,
  label: string,
  type: "text" | "number" | "date" | "select" | "file" | "checkbox" | "textarea",
  options?: string[],
  required = true,
) {
  return {
    id,
    label,
    type,
    required,
    ...(options ? { options } : {}),
  };
}

function workflowStepsForTemplate(formTemplateId: string) {
  const base = [{ formTemplateId, stepOrder: 1, approverType: "direct_manager" }];
  return [
    ...base,
    { formTemplateId, stepOrder: 2, approverType: "hr_admin" },
  ];
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
