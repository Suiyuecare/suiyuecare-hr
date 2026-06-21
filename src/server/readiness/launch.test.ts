import { describe, expect, it } from "vitest";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";
import type { HrOneKpi } from "@/server/kpis/hr-one";
import { defaultFileStorageSettings } from "@/server/files/storage";
import { buildLaunchReadinessReport, getLaunchReadinessReport } from "./launch";

const secureStorage = {
  ...defaultFileStorageSettings,
  provider: "s3" as const,
  bucketName: "hrone-prod-docs",
  region: "ap-northeast-1",
  kmsKeyRef: "alias/hr-one-documents",
  lifecyclePolicyRef: "s3://hrone-prod-docs?lifecycle=hr-documents-7y",
  malwareScanningRequired: true,
  verificationStatus: "verified" as const,
  lastVerifiedAt: new Date("2026-06-12T00:00:00.000Z"),
  verificationNote: "Provider smoke test passed.",
};

const secureSettings = {
  mfaRequiredForAdmins: true,
  mfaRequiredForEmployees: true,
  ssoEnabled: true,
  ssoProvider: "Entra ID",
  ssoIssuerUrl: "https://login.example.com/demo/v2.0",
  ssoClientId: "hr-one-client-id",
  ssoJwksUrl: "https://login.example.com/demo/discovery/v2.0/keys",
  passwordMinLength: 14,
  passwordRequiresNumber: true,
  passwordRequiresSymbol: true,
  sessionTimeoutMinutes: 480,
  idleTimeoutMinutes: 45,
  allowedEmailDomains: ["customer.example"],
};

const notificationSettings = {
  inAppEnabled: true,
  emailEnabled: true,
  lineEnabled: false,
  slackEnabled: false,
  teamsEnabled: false,
  externalSummaryOnly: true,
  approvalSubmittedEnabled: true,
  approvalDecisionEnabled: true,
  payrollReleasedEnabled: true,
  systemAlertEnabled: true,
};

const readyPaymentSecurity = {
  ready: true,
  detail: "aws_secrets_manager vault configured; customer_bank_csv v1 verified.",
};

const readyCalendar = {
  ready: true,
  calendarYear: 2026,
  detail: "approved; 16/16 national holiday(s), 1/1 makeup workday(s); source checked 2026-06-12.",
};

const passingKpis: HrOneKpi[] = [
  "first_leave_success_time",
  "manager_leave_approval_time",
  "payroll_close_reduction",
  "attendance_exception_auto_resolution",
  "employee_mobile_task_completion",
  "hr_self_serve_form_creation",
  "audit_log_coverage",
  "unauthorized_payroll_access",
  "ai_answers_with_sources",
  "first_week_training_time",
].map((id) => ({
  id,
  name: id,
  target: "target",
  current: "passing",
  status: "passing" as const,
  owner: "HR Ops" as const,
  nextStep: "Keep monitoring this launch gate.",
}));

describe("launch readiness", () => {
  it("lets HR admins read readiness without commercial subscription management permission", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const report = await getLaunchReadinessReport({
        role: "hr_admin",
        tenantId: "demo-tenant",
        companyId: "demo-company",
        user: { id: "demo-user-hr", displayName: "林人資" },
        employee: { id: "demo-hr-employee", displayName: "林人資" },
      });

      expect(report.items.find((item) => item.id === "subscription")).toMatchObject({
        status: "blocked",
      });
    } finally {
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it("blocks sale readiness when persistence and production storage are still demo-only", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: false,
      employeeCount: 5,
      auditCount: 3,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: {
        ...secureSettings,
        ssoEnabled: false,
        ssoProvider: null,
        ssoIssuerUrl: null,
        ssoClientId: null,
        ssoJwksUrl: null,
      },
      fileStorageSettings: defaultFileStorageSettings,
      notificationSettings: {
        ...notificationSettings,
        emailEnabled: false,
      },
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 0,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.readyForSale).toBe(false);
    expect(report.items.find((item) => item.id === "database")).toMatchObject({
      status: "blocked",
      actionHref: "/settings/readiness#database-setup",
    });
    expect(report.items.find((item) => item.id === "file_storage")).toMatchObject({
      status: "blocked",
      actionLabel: "Configure storage",
      actionHref: "/settings/file-storage",
    });
    expect(report.setupSteps[0]).toMatchObject({
      step: 1,
      status: "blocked",
      actionHref: "/settings/readiness#database-setup",
    });
    expect(report.setupSteps[2]).toMatchObject({
      step: 3,
      status: "blocked",
      actionHref: "/settings/file-storage",
    });
    expect(report.actionRequiredCount).toBeGreaterThan(0);
  });

  it("requires legal-review approval before launch", () => {
    const laborConfig = structuredClone(defaultTaiwanLaborStandardsConfig);
    laborConfig.changeControl = {
      ...laborConfig.changeControl,
      reviewStatus: "pending_legal_review",
      reviewedAt: null,
      requiresPayrollRecalculation: true,
    };

    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 3,
      activeRuleCount: 3,
      laborConfig,
      laborRuleValidation: {
        passed: true,
        passedCount: 7,
        fixtureCount: 7,
      },
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "law_rules")).toMatchObject({
      status: "blocked",
    });
  });

  it("blocks launch when Taiwan rule validation fixtures fail", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      laborRuleValidation: {
        passed: false,
        passedCount: 6,
        fixtureCount: 7,
      },
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "law_rules")).toMatchObject({
      status: "blocked",
      detail: "3 active rule version(s); rule review status approved; coverage 11/11; 6/7 fixture(s) passed; executable engine 0/0 check(s) passed; sources 0/0 fresh, oldest missing.",
    });
  });

  it("blocks launch when the Taiwan rule engine executable checks fail", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      laborRuleValidation: {
        passed: true,
        passedCount: 9,
        fixtureCount: 9,
      },
      legalSourceFreshness: {
        passed: true,
        freshSourceCount: 12,
        totalSourceCount: 12,
        oldestCheckedAt: "2026-06-12",
        maxAgeDays: 180,
      },
      ruleEngineReadiness: {
        passed: false,
        passedCount: 3,
        checkCount: 4,
        detail: "Failed executable rule-engine check(s): working-time violation.",
      },
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "law_rules")).toMatchObject({
      status: "blocked",
      detail: "3 active rule version(s); rule review status approved; coverage 11/11; 9/9 fixture(s) passed; executable engine 3/4 check(s) passed; sources 12/12 fresh, oldest 2026-06-12.",
      nextStep: expect.stringContaining("verify executable rule-engine checks"),
    });
  });

  it("blocks launch when official legal source review is stale", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      laborRuleValidation: {
        passed: true,
        passedCount: 7,
        fixtureCount: 7,
      },
      legalSourceFreshness: {
        passed: false,
        freshSourceCount: 11,
        totalSourceCount: 12,
        oldestCheckedAt: "2025-01-01",
        maxAgeDays: 180,
      },
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "law_rules")).toMatchObject({
      status: "blocked",
      detail: "3 active rule version(s); rule review status approved; coverage 11/11; 7/7 fixture(s) passed; executable engine 0/0 check(s) passed; sources 11/12 fresh, oldest 2025-01-01.",
    });
  });

  it("blocks launch when Taiwan compliance coverage matrix has source gaps", () => {
    const laborConfig = structuredClone(defaultTaiwanLaborStandardsConfig);
    laborConfig.sources = laborConfig.sources.filter((source) => source.id === "tw-minimum-wage-2026");

    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig,
      laborRuleValidation: {
        passed: true,
        passedCount: 9,
        fixtureCount: 9,
      },
      legalSourceFreshness: {
        passed: true,
        freshSourceCount: 1,
        totalSourceCount: 1,
        oldestCheckedAt: "2026-06-19",
        maxAgeDays: 180,
      },
      ruleEngineReadiness: {
        passed: true,
        passedCount: 4,
        checkCount: 4,
        detail: "4 executable rule-engine check(s) passed.",
      },
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "law_rules")).toMatchObject({
      status: "blocked",
      detail: "3 active rule version(s); rule review status approved; coverage 1/11; 9/9 fixture(s) passed; executable engine 4/4 check(s) passed; sources 1/1 fresh, oldest 2026-06-19.",
      nextStep: expect.stringContaining("Complete Taiwan compliance coverage before launch"),
    });
  });

  it("blocks launch when privileged SSO identities are missing after SSO is configured", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 1,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "sso_identities")).toMatchObject({
      status: "blocked",
      detail: "1/3 privileged user(s) linked to stable issuer/subject identities.",
      actionHref: "/settings/access",
    });
    expect(report.setupSteps[1]).toMatchObject({
      status: "blocked",
      actionHref: "/settings/access",
    });
  });

  it("blocks launch when production access cutover is not ready", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      accessCutoverReport: {
        readyForProduction: false,
        status: "blocked",
        summary: "6/8 個正式登入 Gate 已就緒；1 個阻擋，1 個待處理。",
        topTask: {
          title: "正式瀏覽器 Session Cookie",
          nextStep: "補齊 HR_ONE_WEB_SESSION_MAX_AGE_SECONDS 並確認 login URL。",
          actionLabel: "檢查 env Gate",
          actionHref: "/settings/readiness",
        },
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.readyForSale).toBe(false);
    expect(report.items.find((item) => item.id === "access_cutover")).toMatchObject({
      status: "blocked",
      detail: "6/8 個正式登入 Gate 已就緒；1 個阻擋，1 個待處理。 Top blocker: 正式瀏覽器 Session Cookie.",
      nextStep: "補齊 HR_ONE_WEB_SESSION_MAX_AGE_SECONDS 並確認 login URL。",
      actionHref: "/settings/readiness",
    });
    expect(report.setupSteps[1]).toMatchObject({
      status: "blocked",
      actionHref: "/settings/readiness",
    });
  });

  it("blocks launch when support access is unapproved or expired", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 1,
        activeUnapprovedCount: 1,
        expiredStillApprovedCount: 1,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "support_access")).toMatchObject({
      status: "blocked",
      detail: "1 unapproved active grant(s), 1 expired grant(s) still approved.",
      actionHref: "/settings/support-access",
    });
    expect(report.setupSteps[1]).toMatchObject({
      status: "blocked",
      actionHref: "/settings/support-access",
    });
  });

  it("blocks launch when personal data governance is not ready", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      privacyReadiness: {
        ready: false,
        detail: "2/5 current acknowledgement(s); 1 open request(s); 1 overdue; review unverified.",
        missing: ["privacy notice legal/HR review", "overdue data subject requests"],
      },
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "privacy")).toMatchObject({
      status: "blocked",
      actionHref: "/settings/privacy",
      nextStep: "Clear privacy gaps: privacy notice legal/HR review, overdue data subject requests.",
    });
    expect(report.setupSteps[1]).toMatchObject({
      status: "blocked",
      actionHref: "/settings/privacy",
    });
  });

  it("blocks launch when onboarding training evidence is not ready", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      trainingReadiness: {
        ready: false,
        detail: "1 required course(s); 20 minute(s); 2/5 assignment(s); 0 completed; 1 overdue; review unverified.",
        missing: ["training plan HR/legal review", "first-week training under KPI target"],
      },
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "training")).toMatchObject({
      status: "blocked",
      actionHref: "/hr/training",
      nextStep: "Clear training gaps: training plan HR/legal review, first-week training under KPI target.",
    });
    expect(report.setupSteps[3]).toMatchObject({
      status: "blocked",
      actionHref: "/hr/training",
    });
  });

  it("blocks launch when labor roster profiles are incomplete or unverified", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      laborRosterReadiness: {
        ready: false,
        detail: "4/5 active employee(s) have complete roster profiles; 3 verified.",
        missing: ["張小安", "李小真"],
      },
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "labor_roster")).toMatchObject({
      status: "blocked",
      actionHref: "/hr/labor-roster",
      nextStep: "Complete and verify labor roster profiles for: 張小安, 李小真.",
    });
    expect(report.setupSteps[3]).toMatchObject({
      status: "blocked",
      actionHref: "/hr/labor-roster",
    });
  });

  it("blocks launch when termination offboarding tasks remain open", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      offboardingReadiness: {
        ready: false,
        detail: "4/6 offboarding task(s) ready; 2 pending; 1 overdue.",
        missing: ["2 pending offboarding task(s)", "1 overdue offboarding task(s)"],
      },
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "offboarding")).toMatchObject({
      status: "blocked",
      actionHref: "/hr/offboarding",
      nextStep: "Clear offboarding gaps: 2 pending offboarding task(s), 1 overdue offboarding task(s).",
    });
    expect(report.setupSteps[3]).toMatchObject({
      status: "blocked",
      actionHref: "/hr/offboarding",
    });
  });

  it("blocks launch when workplace incident response is not ready", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      incidentReadiness: {
        ready: false,
        detail: "1 open incident(s); 1 overdue investigation(s); 1 overdue authority report(s); review unverified.",
        missing: ["incident response policy HR/legal review", "overdue authority report follow-up"],
      },
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "incidents")).toMatchObject({
      status: "blocked",
      actionHref: "/hr/incidents",
      nextStep: "Clear incident gaps: incident response policy HR/legal review, overdue authority report follow-up.",
    });
    expect(report.setupSteps[3]).toMatchObject({
      status: "blocked",
      actionHref: "/hr/incidents",
    });
  });

  it("blocks launch when payroll payment vault and bank format are not verified", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: {
        ready: false,
        detail: "Missing token vault provider, token vault reference, KMS key reference.",
      },
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "payment_security")).toMatchObject({
      status: "blocked",
      actionHref: "/hr/payroll-payment-security",
    });
    expect(report.setupSteps[2]).toMatchObject({
      status: "blocked",
      actionHref: "/hr/payroll-payment-security",
    });
  });

  it("blocks launch when backup and restore readiness is missing", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      operationalResilience: {
        ready: false,
        detail: "Missing enabled backups, backup provider, passed restore drill.",
      },
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "operational_resilience")).toMatchObject({
      status: "blocked",
      actionHref: "/settings/operational-resilience",
    });
    expect(report.setupSteps[0]).toMatchObject({
      status: "blocked",
      actionHref: "/settings/operational-resilience",
    });
  });

  it("blocks launch when customer subscription is not commercially verified", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      operationalResilience: {
        ready: true,
        detail: "Managed backups verified.",
      },
      subscriptionReadiness: {
        ready: false,
        detail: "demo / trial; 6/5 seat(s); trial 14 day(s); contract n/a day(s); review unverified.",
        missing: [
          "paid customer plan selected",
          "active subscription status",
          "seat limit covers active users",
          "contract reference and hash",
          "commercial terms reviewed",
        ],
      },
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "subscription")).toMatchObject({
      status: "blocked",
      actionHref: "/settings/subscription",
      nextStep:
        "Clear subscription gaps: paid customer plan selected, active subscription status, seat limit covers active users, contract reference and hash, commercial terms reviewed.",
    });
    expect(report.setupSteps[0]).toMatchObject({
      status: "blocked",
      actionHref: "/settings/subscription",
    });
  });

  it("marks a fully configured workspace ready for sale", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: readyCalendar,
      kpis: passingKpis,
    });

    expect(report.blockedCount).toBe(0);
    expect(report.actionRequiredCount).toBe(0);
    expect(report.readyForSale).toBe(true);
    expect(report.setupSteps.every((step) => step.status === "ready")).toBe(true);
  });

  it("blocks launch when the annual Taiwan calendar review is not approved", () => {
    const report = buildLaunchReadinessReport({
      databaseConfigured: true,
      employeeCount: 5,
      auditCount: 8,
      activeRuleCount: 3,
      laborConfig: defaultTaiwanLaborStandardsConfig,
      securitySettings: secureSettings,
      fileStorageSettings: secureStorage,
      notificationSettings,
      privilegedSsoIdentityCoverage: {
        total: 3,
        linked: 3,
      },
      supportAccessGovernance: {
        activeApprovedCount: 0,
        activeUnapprovedCount: 0,
        expiredStillApprovedCount: 0,
      },
      payrollPaymentSecurity: readyPaymentSecurity,
      calendarReadiness: {
        ready: false,
        calendarYear: 2026,
        detail: "pending_review; 1/16 national holiday(s), 0/1 makeup workday(s); source checked 2026-06-12.",
      },
      kpis: passingKpis,
    });

    expect(report.items.find((item) => item.id === "calendar")).toMatchObject({
      status: "blocked",
      actionHref: "/hr/calendar",
    });
    expect(report.setupSteps[3]).toMatchObject({
      status: "blocked",
      actionHref: "/hr/calendar",
    });
  });
});
