import { describe, expect, it } from "vitest";
import {
  buildDatabaseVerificationChecks,
  type DatabaseVerificationSnapshot,
} from "@/server/readiness/database-verification";
import { taiwanStatutoryLeaveRequirements } from "@/server/leave/statutory";

const readySnapshot: DatabaseVerificationSnapshot = {
  databaseUrlConfigured: true,
  tenant: {
    slug: "customer-a",
    plan: "enterprise",
  },
  company: {
    name: "Customer A",
    taxId: "12345678",
  },
  counts: {
    departments: 2,
    employees: 5,
    users: 6,
    userRoles: 6,
    attendancePolicies: 1,
    shiftTemplates: 1,
    calendarDays: 1,
    activeLawRules: 3,
    activeRuleVersions: 3,
    leavePolicies: 11,
    leaveBalances: 5,
    salaryProfiles: 5,
    payrollComplianceProfiles: 5,
    statutoryInsuranceRecords: 25,
    paymentProfiles: 5,
    formTemplates: 1,
    workflowSteps: 1,
    policyDocuments: 4,
    approvedPolicyDocuments: 4,
    auditLogs: 8,
    telemetryEvents: 4,
    terminationLifecycleEvents: 0,
    offboardingReadyTasks: 0,
  },
  calendarReview: {
    calendarYear: 2026,
    reviewStatus: "approved",
    sourceCheckedAt: new Date("2026-06-12T00:00:00.000Z"),
    sourceUrl: "https://www.dgpa.gov.tw/",
    nationalHolidayCount: 1,
    makeupWorkdayCount: 1,
    companyHolidayCount: 0,
    actualNationalHolidayCount: 1,
    actualMakeupWorkdayCount: 1,
    actualCompanyHolidayCount: 0,
  },
  profileCoverage: {
    activeEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
    salaryProfileEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
    payrollComplianceProfileEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
    paymentProfileEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
    statutoryInsuranceReadyEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
  },
  leavePolicySettings: taiwanStatutoryLeaveRequirements.map((requirement) => ({
    code: requirement.recommendedCode,
    name: requirement.name,
    status: "active",
    statutoryCategory: requirement.category,
    requiresLegalReview: false,
  })),
  minimumWageCompliance: {
    ready: true,
    checkedCount: 5,
    monthlyViolationCount: 0,
    hourlyViolationCount: 0,
    detail: "5 salary profile(s) checked; no configured Taiwan minimum wage violations.",
  },
  attendanceRecordkeeping: {
    ready: true,
    missing: [],
    detail: "1825 retention day(s); employee self-service enabled; export enabled.",
  },
  worktimeAgreement: {
    ready: true,
    missing: [],
    detail: "labor-management conference approval; approval evidence on file; verified; monthly 54h; 3-month 138h",
    settings: {
      approvalType: "labor_management_conference",
      approvalOnFile: true,
      evidenceRef: "meeting://2026-06",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-12-31T00:00:00.000Z"),
      monthlyOvertimeLimitMinutes: 54 * 60,
      threeMonthOvertimeLimitMinutes: 138 * 60,
      localAuthorityReportRequired: false,
      localAuthorityReportFiled: false,
      verificationStatus: "verified",
      verificationNote: null,
    },
  },
  insuranceGradeReadiness: {
    ready: true,
    checkedCount: 5,
    issueCount: 0,
    detail: "5 payroll compliance profile(s) checked; no under-insured wage override risk.",
  },
  payrollRecordkeeping: {
    ready: true,
    missing: [],
    detail: "1825 retention day(s); payslip enabled; calculation details enabled; labor inspection export enabled.",
  },
  accessCoverage: {
    privilegedUserIds: ["user_owner", "user_hr", "user_manager"],
    externalIdentityUserIds: ["user_owner", "user_hr", "user_manager", "user_employee"],
  },
  roleKeys: ["owner", "hr_admin", "manager", "employee"],
  roleAssignmentKeys: ["owner", "hr_admin", "manager", "employee"],
  auditEntityTypes: [
    "employee",
    "employee_import",
    "salary_profile",
    "payroll_compliance_profile",
    "employee_payment_profile",
    "payroll_profile_import",
  ],
  lawRulesHaveActiveVersion: true,
  ruleValidation: {
    activeVersionCount: 3,
    validatedVersionCount: 3,
    failedVersionCount: 0,
    fixtureCount: 24,
  },
  legalSourceFreshness: {
    activeVersionCount: 3,
    freshVersionCount: 3,
    staleVersionCount: 0,
    invalidVersionCount: 0,
    oldestCheckedAt: "2026-06-12",
    maxAgeDays: 180,
  },
  laborRuleChangeControl: {
    reason: "Initial legal-approved Taiwan baseline.",
    reviewStatus: "approved",
    requiresPayrollRecalculation: false,
  },
  securitySettings: {
    mfaRequiredForAdmins: true,
    ssoEnabled: true,
    ssoProvider: "Entra ID",
    ssoIssuerUrl: "https://login.example.com/customer/v2.0",
    ssoClientId: "hr-one-client",
    ssoJwksUrl: "https://login.example.com/customer/keys",
    passwordMinLength: 14,
    allowedEmailDomains: ["customer.example"],
  },
  fileStorageSettings: {
    provider: "s3",
    kmsKeyRef: "alias/hr-one-documents",
    malwareScanningRequired: true,
    verificationStatus: "verified",
    lastVerifiedAt: new Date("2026-06-12T00:00:00.000Z"),
  },
  notificationSettings: {
    emailEnabled: true,
    lineEnabled: false,
    slackEnabled: false,
    teamsEnabled: false,
    externalSummaryOnly: true,
  },
  payrollPaymentSecuritySettings: {
    tokenVaultProvider: "aws_secrets_manager",
    tokenVaultRef: "vault://customer/payroll-payment",
    kmsKeyRef: "alias/customer-payroll-payment",
    bankFileFormat: "customer_bank_csv",
    bankFormatVersion: "v1",
    bankFormatVerified: true,
    verificationStatus: "verified",
    lastVerifiedAt: new Date("2026-06-12T00:00:00.000Z"),
  },
  operationalResilienceSettings: {
    backupProvider: "managed_postgres",
    backupEnabled: true,
    backupRetentionDays: 35,
    backupEncryptionKeyRef: "vault://customer/hrone/backup-key",
    lastBackupCompletedAt: new Date("2026-06-12T00:00:00.000Z"),
    restoreDrillTestedAt: new Date("2026-06-01T00:00:00.000Z"),
    restoreDrillStatus: "passed",
    restoreDrillTicket: "OPS-1234",
    verificationStatus: "verified",
  },
  subscription: {
    plan: "enterprise",
    status: "active",
    seatLimit: 25,
    activeSeatCount: 6,
    billingContactEmail: "billing@customer.example",
    contractRef: "contract://customer-a/hrone-2026",
    contractHash: "contract-hash",
    contractStartsAt: new Date("2026-06-01T00:00:00.000Z"),
    contractEndsAt: new Date("2027-06-01T00:00:00.000Z"),
    renewalNoticeDays: 30,
    verificationStatus: "verified",
  },
  supportAccessGovernance: {
    activeApprovedCount: 0,
    activeUnapprovedCount: 0,
    expiredStillApprovedCount: 0,
  },
};

describe("database verification checks", () => {
  it("keeps demo verification focused on seeded foundation records", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        tenant: { slug: "hr-one-demo", plan: "demo" },
        company: { name: "Demo Company", taxId: "DEMO-TAX-ID" },
        securitySettings: {
          ...readySnapshot.securitySettings!,
          ssoEnabled: false,
          ssoProvider: null,
          ssoIssuerUrl: null,
          ssoClientId: null,
          ssoJwksUrl: null,
          allowedEmailDomains: ["hrone.test"],
        },
        fileStorageSettings: {
          ...readySnapshot.fileStorageSettings!,
          provider: "demo_object_storage",
          kmsKeyRef: null,
          verificationStatus: "unverified",
          lastVerifiedAt: null,
        },
        notificationSettings: {
          ...readySnapshot.notificationSettings!,
          emailEnabled: false,
        },
      },
      "demo",
    );

    expect(checks.every((item) => item.passed)).toBe(true);
    expect(checks.some((item) => item.name === "production tenant identity")).toBe(false);
  });

  it("requires production-only controls before customer onboarding", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        tenant: { slug: "hr-one-demo", plan: "demo" },
        company: { name: "Demo Company", taxId: "DEMO-TAX-ID" },
        securitySettings: {
          ...readySnapshot.securitySettings!,
          ssoEnabled: false,
          ssoProvider: null,
          ssoIssuerUrl: null,
          ssoClientId: null,
          ssoJwksUrl: null,
          allowedEmailDomains: ["hrone.test"],
        },
        fileStorageSettings: {
          ...readySnapshot.fileStorageSettings!,
          provider: "demo_object_storage",
          kmsKeyRef: null,
          verificationStatus: "unverified",
          lastVerifiedAt: null,
        },
        notificationSettings: {
          ...readySnapshot.notificationSettings!,
          emailEnabled: false,
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "production tenant identity")).toMatchObject({ passed: false });
    expect(checks.find((item) => item.name === "production SSO")).toMatchObject({ passed: false });
    expect(checks.find((item) => item.name === "production document storage")).toMatchObject({ passed: false });
    expect(checks.find((item) => item.name === "external notifications")).toMatchObject({ passed: false });
  });

  it("requires privileged production users to have stable SSO identity bindings", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        accessCoverage: {
          privilegedUserIds: ["user_owner", "user_hr", "user_manager"],
          externalIdentityUserIds: ["user_owner"],
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "privileged SSO identity coverage")).toMatchObject({
      passed: false,
      detail: "1/3 privileged user(s) linked",
    });
  });

  it("fails profile coverage when duplicate profile records hide a missing active employee", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        counts: {
          ...readySnapshot.counts,
          salaryProfiles: 5,
          payrollComplianceProfiles: 5,
          paymentProfiles: 5,
        },
        profileCoverage: {
          activeEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
          salaryProfileEmployeeIds: ["emp_1", "emp_1", "emp_2", "emp_3", "emp_4"],
          payrollComplianceProfileEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
          paymentProfileEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
          statutoryInsuranceReadyEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4", "emp_5"],
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "salary profile coverage")).toMatchObject({
      passed: false,
      detail: "4/5 active employee(s) covered; 5 profile record(s)",
    });
  });

  it("requires every Taiwan statutory leave category to be active and reviewed", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        leavePolicySettings: readySnapshot.leavePolicySettings
          .filter((policy) => policy.statutoryCategory !== "menstrual")
          .map((policy) =>
            policy.statutoryCategory === "paternity"
              ? { ...policy, requiresLegalReview: true }
              : policy,
          ),
      },
      "production",
    );

    expect(checks.find((item) => item.name === "statutory leave policy coverage")).toMatchObject({
      passed: false,
      detail: "9/11 statutory leave categories approved; 1 missing; 1 pending review.",
    });
  });

  it("blocks launch when salary profiles are below configured Taiwan minimum wage", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        minimumWageCompliance: {
          ready: false,
          checkedCount: 5,
          monthlyViolationCount: 1,
          hourlyViolationCount: 1,
          detail: "5 salary profile(s) checked; 1 monthly and 1 hourly minimum wage violation(s).",
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "salary minimum wage compliance")).toMatchObject({
      passed: false,
      detail: "5 salary profile(s) checked; 1 monthly and 1 hourly minimum wage violation(s).",
    });
    expect(checks.find((item) => item.name === "salary minimum wage compliance")?.detail).not.toContain("28000");
    expect(checks.find((item) => item.name === "salary minimum wage compliance")?.detail).not.toContain("190");
  });

  it("requires every core role to have an assigned user, not only a role definition", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        counts: {
          ...readySnapshot.counts,
          userRoles: 6,
        },
        roleAssignmentKeys: ["owner", "owner", "employee", "employee"],
      },
      "production",
    );

    expect(checks.find((item) => item.name === "required role assignment coverage")).toMatchObject({
      passed: false,
      detail: "missing hr_admin, manager",
    });
  });

  it("blocks launch when payroll compliance overrides understate insurance salary grades", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        insuranceGradeReadiness: {
          ready: false,
          checkedCount: 5,
          issueCount: 2,
          detail: "5 payroll compliance profile(s) checked; 2 under-insured wage override risk(s).",
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "payroll insurance grade readiness")).toMatchObject({
      passed: false,
      detail: "5 payroll compliance profile(s) checked; 2 under-insured wage override risk(s).",
    });
    expect(checks.find((item) => item.name === "payroll insurance grade readiness")?.detail).not.toContain("56000");
    expect(checks.find((item) => item.name === "payroll insurance grade readiness")?.detail).not.toContain("80200");
  });

  it("blocks launch when payroll recordkeeping cannot prove wage roster retention and employee statements", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        payrollRecordkeeping: {
          ready: false,
          missing: [
            "5-year wage roster retention",
            "employee wage statement access",
            "wage calculation details",
            "labor inspection export readiness",
          ],
          detail: "365 retention day(s); payslip disabled; calculation details disabled; labor inspection export disabled.",
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "payroll recordkeeping")).toMatchObject({
      passed: false,
      detail: "365 retention day(s); payslip disabled; calculation details disabled; labor inspection export disabled.",
    });
  });

  it("blocks launch when attendance records are not retained or visible to employees", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        attendanceRecordkeeping: {
          ready: false,
          missing: [
            "5-year attendance record retention",
            "employee self-service attendance access",
            "employee attendance export access",
          ],
          detail: "365 retention day(s); employee self-service disabled; export disabled.",
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "attendance recordkeeping")).toMatchObject({
      passed: false,
      detail: "365 retention day(s); employee self-service disabled; export disabled.",
    });
  });

  it("blocks launch when worktime agreement evidence is missing", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        worktimeAgreement: {
          ...readySnapshot.worktimeAgreement,
          ready: false,
          missing: ["labor union or labor-management conference approval evidence", "HR verification"],
          detail: "labor-management conference approval; approval evidence missing; unverified; monthly 46h; 3-month 138h",
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "worktime agreement evidence")).toMatchObject({
      passed: false,
      detail: "labor-management conference approval; approval evidence missing; unverified; monthly 46h; 3-month 138h",
    });
  });

  it("requires approved policy sources for AI policy answers", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        counts: {
          ...readySnapshot.counts,
          policyDocuments: 2,
          approvedPolicyDocuments: 0,
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "approved policy sources")).toMatchObject({
      passed: false,
      detail: "0/2 approved source(s)",
    });
  });

  it("requires production audit evidence for sensitive onboarding data, not only any audit log", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        counts: {
          ...readySnapshot.counts,
          auditLogs: 20,
        },
        auditEntityTypes: ["employee", "employee_import", "salary_profile", "employee_payment_profile"],
      },
      "production",
    );

    expect(checks.find((item) => item.name === "audit baseline")).toMatchObject({
      passed: true,
      detail: "20 audit event(s)",
    });
    expect(checks.find((item) => item.name === "sensitive onboarding audit coverage")).toMatchObject({
      passed: false,
      detail: "missing payroll_compliance_profile, payroll_profile_import",
    });
  });

  it("blocks production verification when support access is unapproved or expired", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        supportAccessGovernance: {
          activeApprovedCount: 1,
          activeUnapprovedCount: 1,
          expiredStillApprovedCount: 2,
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "support access governance")).toMatchObject({
      passed: false,
      detail: "1 unapproved active grant(s), 2 expired grant(s) still approved.",
    });
  });

  it("requires payroll payment token vault and verified bank format before production launch", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        payrollPaymentSecuritySettings: {
          tokenVaultProvider: "not_configured",
          tokenVaultRef: null,
          kmsKeyRef: null,
          bankFileFormat: "tw_bank_csv_placeholder",
          bankFormatVersion: "v1",
          bankFormatVerified: false,
          verificationStatus: "unverified",
          lastVerifiedAt: null,
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "payroll payment security")).toMatchObject({
      passed: false,
      detail: "not_configured; tw_bank_csv_placeholder v1; unverified",
    });
  });

  it("requires operational backup and restore drill evidence before production launch", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        operationalResilienceSettings: {
          ...readySnapshot.operationalResilienceSettings!,
          backupEnabled: false,
          backupRetentionDays: 7,
          restoreDrillStatus: "not_tested",
          verificationStatus: "unverified",
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "operational resilience")).toMatchObject({
      passed: false,
      detail: "managed_postgres; retention 7 day(s); restore not_tested; unverified",
    });
  });

  it("requires validation evidence for active law rule versions", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        ruleValidation: {
          activeVersionCount: 3,
          validatedVersionCount: 2,
          failedVersionCount: 1,
          fixtureCount: 12,
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "rule validation evidence")).toMatchObject({
      passed: false,
      detail: "2/3 active version(s) validated; 12 fixture(s) recorded",
    });
  });

  it("requires fresh legal source review evidence for active law rule versions", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        legalSourceFreshness: {
          activeVersionCount: 3,
          freshVersionCount: 2,
          staleVersionCount: 1,
          invalidVersionCount: 0,
          oldestCheckedAt: "2025-01-01",
          maxAgeDays: 180,
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "legal source freshness")).toMatchObject({
      passed: false,
      detail: "2/3 active version(s) fresh; oldest 2025-01-01; max age 180 day(s)",
    });
  });

  it("requires approved annual calendar review with matching holiday records", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        calendarReview: {
          ...readySnapshot.calendarReview!,
          reviewStatus: "pending_review",
          nationalHolidayCount: 3,
          actualNationalHolidayCount: 1,
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "annual calendar review")).toMatchObject({
      passed: false,
      detail: "2026; pending_review; 1/3 national holiday(s), 1/1 makeup workday(s)",
    });
  });

  it("requires a verified commercial subscription before production verification passes", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        subscription: {
          ...readySnapshot.subscription!,
          plan: "demo",
          status: "trial",
          seatLimit: 5,
          verificationStatus: "unverified",
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "commercial subscription")).toMatchObject({
      passed: false,
      detail: "demo; trial; 6/5 seat(s); unverified",
    });
  });

  it("requires statutory insurance evidence for every active employee", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        counts: {
          ...readySnapshot.counts,
          statutoryInsuranceRecords: 20,
        },
        profileCoverage: {
          ...readySnapshot.profileCoverage,
          statutoryInsuranceReadyEmployeeIds: ["emp_1", "emp_2", "emp_3", "emp_4"],
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "statutory insurance enrollment evidence")).toMatchObject({
      passed: false,
      detail: "4/5 active employee(s) have ready statutory insurance evidence; 20 record(s)",
    });
  });

  it("requires completed or waived offboarding tasks for termination events", () => {
    const checks = buildDatabaseVerificationChecks(
      {
        ...readySnapshot,
        counts: {
          ...readySnapshot.counts,
          terminationLifecycleEvents: 1,
          offboardingReadyTasks: 4,
        },
      },
      "production",
    );

    expect(checks.find((item) => item.name === "termination offboarding task coverage")).toMatchObject({
      passed: false,
      detail: "4/6 required offboarding task(s) completed or waived for 1 termination event(s)",
    });
  });

  it("passes production verification for a fully provisioned tenant", () => {
    const checks = buildDatabaseVerificationChecks(readySnapshot, "production");

    expect(checks.every((item) => item.passed)).toBe(true);
  });
});
