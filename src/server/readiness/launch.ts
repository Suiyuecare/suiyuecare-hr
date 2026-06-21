import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getUserAccessWorkspace } from "@/server/auth/access-management";
import { buildAccessCutoverReport } from "@/server/auth/access-cutover";
import { getCompanyCalendarWorkspace, type CompanyCalendarReadiness } from "@/server/calendar/company-calendar";
import { getCompanyOverview } from "@/server/dashboard/queries";
import { getLaborRosterWorkspace } from "@/server/employees/labor-roster";
import { getOffboardingWorkspace, type OffboardingReadiness } from "@/server/employees/offboarding";
import type { FileStorageSettings } from "@/server/files/storage";
import {
  evaluateFileStorageLifecycleReadiness,
  getFileStorageSettings,
  isProductionStorageVerified,
} from "@/server/files/storage";
import { getIncidentWorkspace, type IncidentReadiness } from "@/server/incidents/workplace";
import { getHrOneKpis, summarizeHrOneKpis, type HrOneKpi } from "@/server/kpis/hr-one";
import type { NotificationChannelSettings } from "@/server/notifications/service";
import { getNotificationSettings } from "@/server/notifications/service";
import { getPayrollPaymentSecurityReadiness } from "@/server/payroll/payment-security";
import { getPrivacyWorkspace, type PrivacyReadiness } from "@/server/privacy/governance";
import {
  getOperationalMaintenanceReport,
  type OperationalMaintenanceReport,
} from "@/server/readiness/maintenance";
import { getOperationalResilienceReadiness } from "@/server/readiness/operational-resilience";
import { evaluateTaiwanRuleEngineReadiness, type RuleEngineReadiness } from "@/server/rules/interfaces";
import type { TaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";
import {
  evaluateLegalSourceAuthority,
  evaluateLegalSourceFreshness,
  validateTaiwanLaborStandardsRuleSet,
} from "@/server/rules/validation";
import type { CompanySecuritySettings } from "@/server/settings/security";
import { getCompanySecuritySettings, hasSsoMetadata } from "@/server/settings/security";
import { getSubscriptionReadiness, type SubscriptionReadiness } from "@/server/subscriptions/service";
import { getSupportAccessGovernance } from "@/server/support/access";
import { getTrainingWorkspace, type TrainingReadiness } from "@/server/training/compliance";
import { getWorkRulesWorkspace, type WorkRuleReadiness } from "@/server/work-rules/service";
import {
  buildTaiwanLaborComplianceCoverage,
  summarizeTaiwanLaborComplianceCoverage,
  type TaiwanLaborComplianceCoverageSummary,
} from "@/server/rules/settings";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type LaunchReadinessStatus = "ready" | "action_required" | "blocked";

export type LaunchReadinessItem = {
  id: string;
  area: "Infrastructure" | "Security" | "Compliance" | "Operations" | "Product";
  title: string;
  status: LaunchReadinessStatus;
  detail: string;
  nextStep: string;
  actionLabel: string;
  actionHref: string;
};

export type LaunchReadinessReport = {
  readyForSale: boolean;
  readyCount: number;
  actionRequiredCount: number;
  blockedCount: number;
  setupSteps: LaunchSetupStep[];
  items: LaunchReadinessItem[];
};

export type LaunchSetupStep = {
  step: number;
  title: string;
  status: LaunchReadinessStatus;
  itemIds: string[];
  summary: string;
  actionLabel: string;
  actionHref: string;
};

export type LaunchAccessCutoverSummary = {
  readyForProduction: boolean;
  status: LaunchReadinessStatus;
  summary: string;
  topTask: {
    title: string;
    nextStep: string;
    actionLabel: string;
    actionHref: string;
  };
};

export async function getLaunchReadinessReport(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  const [
    overview,
    laborConfig,
    securitySettings,
    fileStorageSettings,
    notificationSettings,
    incidentWorkspace,
    accessWorkspace,
    supportAccessGovernance,
    payrollPaymentSecurity,
    privacyWorkspace,
    trainingWorkspace,
    operationalResilience,
    calendarWorkspace,
    subscriptionReadiness,
    offboardingWorkspace,
    workRulesWorkspace,
    laborRosterWorkspace,
    operationalMaintenance,
    kpis,
  ] = await Promise.all([
    getCompanyOverview(),
    getTaiwanLaborStandardsConfig(session),
    getCompanySecuritySettings(session),
    getFileStorageSettings(session),
    getNotificationSettings(session),
    getIncidentWorkspace(session),
    getUserAccessWorkspace(session),
    getSupportAccessGovernance(session),
    getPayrollPaymentSecurityReadiness(session),
    getPrivacyWorkspace(session),
    getTrainingWorkspace(session),
    getOperationalResilienceReadiness(session),
    getCompanyCalendarWorkspace(session),
    getSubscriptionReadiness(session),
    getOffboardingWorkspace(session),
    getWorkRulesWorkspace(session),
    getLaborRosterWorkspace(session),
    getOperationalMaintenanceReport(session),
    getHrOneKpis(),
  ]);

  const privilegedUsers = accessWorkspace.users.filter((user) =>
    user.roles.some((role) => role === "owner" || role === "hr_admin" || role === "manager"),
  );
  const accessCutoverReport = buildAccessCutoverReport(accessWorkspace, {
    supportAccessGovernance,
  });
  const laborRuleValidation = validateTaiwanLaborStandardsRuleSet(laborConfig);
  const legalSourceFreshness = evaluateLegalSourceFreshness(laborConfig.sources);
  const legalSourceAuthority = evaluateLegalSourceAuthority(laborConfig.sources);
  const ruleEngineReadiness = await evaluateTaiwanRuleEngineReadiness(laborConfig);

  return buildLaunchReadinessReport({
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    employeeCount: overview?.employeeCount ?? 0,
    auditCount: overview?.auditCount ?? 0,
    activeRuleCount: overview?.activeRuleCount ?? 0,
    laborConfig,
    laborRuleValidation: {
      passed: laborRuleValidation.passed,
      passedCount: laborRuleValidation.passedCount,
      fixtureCount: laborRuleValidation.fixtureCount,
    },
    legalSourceFreshness: {
      passed: legalSourceFreshness.passed,
      freshSourceCount: legalSourceFreshness.freshSourceCount,
      totalSourceCount: legalSourceFreshness.totalSourceCount,
      oldestCheckedAt: legalSourceFreshness.oldestCheckedAt,
      maxAgeDays: legalSourceFreshness.maxAgeDays,
    },
    legalSourceAuthority: {
      passed: legalSourceAuthority.passed,
      trustedSourceCount: legalSourceAuthority.trustedSourceCount,
      totalSourceCount: legalSourceAuthority.totalSourceCount,
      untrustedSourceCount: legalSourceAuthority.untrustedSourceCount,
      invalidUrlSourceCount: legalSourceAuthority.invalidUrlSourceCount,
    },
    ruleEngineReadiness,
    securitySettings,
    fileStorageSettings,
    notificationSettings,
    incidentReadiness: incidentWorkspace.readiness,
    privilegedSsoIdentityCoverage: {
      total: privilegedUsers.length,
      linked: privilegedUsers.filter((user) => user.externalIdentities.length > 0).length,
    },
    supportAccessGovernance,
    accessCutoverReport,
    payrollPaymentSecurity,
    privacyReadiness: privacyWorkspace.readiness,
    trainingReadiness: trainingWorkspace.readiness,
    operationalResilience,
    calendarReadiness: calendarWorkspace.readiness,
    subscriptionReadiness,
    offboardingReadiness: offboardingWorkspace.readiness,
    workRuleReadiness: workRulesWorkspace.readiness,
    laborRosterReadiness: {
      ready: laborRosterWorkspace.coverage.employeeCount > 0 &&
        laborRosterWorkspace.coverage.completeCount >= laborRosterWorkspace.coverage.employeeCount &&
        laborRosterWorkspace.coverage.verifiedCount >= laborRosterWorkspace.coverage.employeeCount,
      detail: `${laborRosterWorkspace.coverage.completeCount}/${laborRosterWorkspace.coverage.employeeCount} active employee(s) have complete roster profiles; ${laborRosterWorkspace.coverage.verifiedCount} verified.`,
      missing: laborRosterWorkspace.profiles
        .filter((profile) => profile.status !== "complete" || profile.verificationStatus !== "verified")
        .map((profile) => profile.employeeName),
    },
    operationalMaintenance,
    kpis,
  });
}

export function buildLaunchReadinessReport(input: {
  databaseConfigured: boolean;
  employeeCount: number;
  auditCount: number;
  activeRuleCount: number;
  laborConfig: TaiwanLaborStandardsConfig;
  laborRuleValidation?: {
    passed: boolean;
    passedCount: number;
    fixtureCount: number;
  };
  legalSourceFreshness?: {
    passed: boolean;
    freshSourceCount: number;
    totalSourceCount: number;
    oldestCheckedAt: string | null;
    maxAgeDays: number;
  };
  legalSourceAuthority?: {
    passed: boolean;
    trustedSourceCount: number;
    totalSourceCount: number;
    untrustedSourceCount: number;
    invalidUrlSourceCount: number;
  };
  laborComplianceCoverageSummary?: TaiwanLaborComplianceCoverageSummary;
  ruleEngineReadiness?: RuleEngineReadiness;
  securitySettings: CompanySecuritySettings;
  fileStorageSettings: FileStorageSettings;
  notificationSettings: NotificationChannelSettings;
  incidentReadiness?: Pick<IncidentReadiness, "ready" | "detail" | "missing">;
  privilegedSsoIdentityCoverage: {
    total: number;
    linked: number;
  };
  supportAccessGovernance: {
    activeApprovedCount: number;
    activeUnapprovedCount: number;
    expiredStillApprovedCount: number;
  };
  accessCutoverReport?: LaunchAccessCutoverSummary;
  payrollPaymentSecurity: {
    ready: boolean;
    detail: string;
  };
  privacyReadiness?: Pick<PrivacyReadiness, "ready" | "detail" | "missing">;
  trainingReadiness?: Pick<TrainingReadiness, "ready" | "detail" | "missing">;
  operationalResilience?: {
    ready: boolean;
    detail: string;
  };
  calendarReadiness?: Pick<CompanyCalendarReadiness, "ready" | "calendarYear" | "detail">;
  subscriptionReadiness?: Pick<SubscriptionReadiness, "ready" | "detail" | "missing">;
  offboardingReadiness?: Pick<OffboardingReadiness, "ready" | "detail" | "missing">;
  workRuleReadiness?: Pick<WorkRuleReadiness, "ready" | "detail" | "missing">;
  laborRosterReadiness?: {
    ready: boolean;
    detail: string;
    missing: string[];
  };
  operationalMaintenance?: Pick<
    OperationalMaintenanceReport,
    "status" | "readyForAutomatedMaintenance" | "summary" | "routePath" | "signals"
  >;
  kpis: HrOneKpi[];
}): LaunchReadinessReport {
  const kpiSummary = summarizeHrOneKpis(input.kpis);
  const externalNotificationsEnabled =
    input.notificationSettings.emailEnabled ||
    input.notificationSettings.lineEnabled ||
    input.notificationSettings.slackEnabled ||
    input.notificationSettings.teamsEnabled;
  const ssoReady = input.securitySettings.ssoEnabled && hasSsoMetadata(input.securitySettings);
  const supportAccessReady =
    input.supportAccessGovernance.activeUnapprovedCount === 0 &&
    input.supportAccessGovernance.expiredStillApprovedCount === 0;
  const accessCutoverReport = input.accessCutoverReport ?? defaultAccessCutoverSummary();
  const laborRuleValidation = input.laborRuleValidation ?? {
    passed: true,
    passedCount: 0,
    fixtureCount: 0,
  };
  const legalSourceFreshness = input.legalSourceFreshness ?? {
    passed: true,
    freshSourceCount: 0,
    totalSourceCount: 0,
    oldestCheckedAt: null,
    maxAgeDays: 180,
  };
  const legalSourceAuthority = input.legalSourceAuthority ?? (() => {
    const evaluated = evaluateLegalSourceAuthority(input.laborConfig.sources);
    return {
      passed: evaluated.passed,
      trustedSourceCount: evaluated.trustedSourceCount,
      totalSourceCount: evaluated.totalSourceCount,
      untrustedSourceCount: evaluated.untrustedSourceCount,
      invalidUrlSourceCount: evaluated.invalidUrlSourceCount,
    };
  })();
  const ruleEngineReadiness = input.ruleEngineReadiness ?? {
    passed: true,
    passedCount: 0,
    checkCount: 0,
    detail: "Rule engine executable readiness not evaluated in this test context.",
  };
  const laborComplianceCoverageSummary = input.laborComplianceCoverageSummary ??
    summarizeTaiwanLaborComplianceCoverage(buildTaiwanLaborComplianceCoverage(input.laborConfig));
  const fileStorageLifecycleReadiness = evaluateFileStorageLifecycleReadiness(input.fileStorageSettings);
  const calendarReadiness = input.calendarReadiness ?? {
    ready: true,
    calendarYear: new Date().getFullYear(),
    detail: "Calendar readiness not evaluated in this test context.",
  };
  const operationalResilience = input.operationalResilience ?? {
    ready: true,
    detail: "Operational resilience not evaluated in this test context.",
  };
  const privacyReadiness = input.privacyReadiness ?? {
    ready: true,
    detail: "Privacy readiness not evaluated in this test context.",
    missing: [],
  };
  const incidentReadiness = input.incidentReadiness ?? {
    ready: true,
    detail: "Incident readiness not evaluated in this test context.",
    missing: [],
  };
  const trainingReadiness = input.trainingReadiness ?? {
    ready: true,
    detail: "Training readiness not evaluated in this test context.",
    missing: [],
  };
  const subscriptionReadiness = input.subscriptionReadiness ?? {
    ready: true,
    detail: "Commercial subscription readiness not evaluated in this test context.",
    missing: [],
  };
  const offboardingReadiness = input.offboardingReadiness ?? {
    ready: true,
    detail: "Offboarding readiness not evaluated in this test context.",
    missing: [],
  };
  const workRuleReadiness = input.workRuleReadiness ?? {
    ready: true,
    detail: "Work rules readiness not evaluated in this test context.",
    missing: [],
  };
  const laborRosterReadiness = input.laborRosterReadiness ?? {
    ready: true,
    detail: "Labor roster readiness not evaluated in this test context.",
    missing: [],
  };
  const operationalMaintenance = input.operationalMaintenance ?? defaultOperationalMaintenanceSummary();
  const openMaintenanceSignal = operationalMaintenance.signals.find((signal) => signal.status !== "ready") ?? null;
  const items: LaunchReadinessItem[] = [
    {
      id: "database",
      area: "Infrastructure",
      title: "PostgreSQL persistence",
      status: input.databaseConfigured ? "ready" : "blocked",
      detail: input.databaseConfigured
        ? "DATABASE_URL is configured; services can use PostgreSQL-backed storage."
        : "DATABASE_URL is not configured; the app is running with demo fallback state.",
      nextStep: "Run migrations, seed/import the tenant, then run pnpm db:verify:production with the customer tenant slug.",
      actionLabel: "Open setup docs",
      actionHref: "/settings/readiness#database-setup",
    },
    {
      id: "tenant_seed",
      area: "Infrastructure",
      title: "Tenant foundation",
      status: input.employeeCount >= 5 ? "ready" : "action_required",
      detail: `${input.employeeCount} employee record(s) are available for the active company.`,
      nextStep: "Verify production onboarding imports departments, employees, managers, roles, policies, and payment profiles.",
      actionLabel: "Import employees",
      actionHref: "/hr/employee-import",
    },
    {
      id: "operational_resilience",
      area: "Infrastructure",
      title: "Backup and restore readiness",
      status: operationalResilience.ready ? "ready" : "blocked",
      detail: operationalResilience.detail,
      nextStep: "Configure backups, encrypted retention, and a recent passed restore drill before production launch.",
      actionLabel: "Configure resilience",
      actionHref: "/settings/operational-resilience",
    },
    {
      id: "operational_maintenance",
      area: "Operations",
      title: "Operational maintenance automation",
      status: operationalMaintenance.status,
      detail: operationalMaintenance.summary,
      nextStep: operationalMaintenance.readyForAutomatedMaintenance
        ? "Keep scheduled maintenance, report cleanup, AI retention cleanup, and hash-only audit evidence healthy before each pilot or customer launch."
        : openMaintenanceSignal?.nextStep ?? "Clear operational maintenance gaps before production pilot or sale.",
      actionLabel: operationalMaintenance.readyForAutomatedMaintenance
        ? "Open maintenance board"
        : openMaintenanceSignal?.actionLabel ?? "Open maintenance board",
      actionHref: operationalMaintenance.readyForAutomatedMaintenance
        ? "/settings/readiness#operational-maintenance"
        : openMaintenanceSignal?.actionHref ?? "/settings/readiness#operational-maintenance",
    },
    {
      id: "subscription",
      area: "Operations",
      title: "Commercial subscription",
      status: subscriptionReadiness.ready ? "ready" : "blocked",
      detail: subscriptionReadiness.detail,
      nextStep: subscriptionReadiness.missing.length > 0
        ? `Clear subscription gaps: ${subscriptionReadiness.missing.join(", ")}.`
        : "Keep customer plan, seats, contract evidence, billing contact, and commercial verification current.",
      actionLabel: "Review subscription",
      actionHref: "/settings/subscription",
    },
    {
      id: "security",
      area: "Security",
      title: "Authentication posture",
      status: input.securitySettings.mfaRequiredForAdmins && input.securitySettings.passwordMinLength >= 12
        ? ssoReady ? "ready" : "action_required"
        : "blocked",
      detail: ssoReady
        ? `SSO enabled with ${input.securitySettings.ssoProvider ?? "configured provider"} and issuer/JWKS metadata.`
        : input.securitySettings.ssoEnabled
          ? "SSO is enabled, but issuer URL, client ID, or JWKS URL is missing."
          : "Admin MFA/password controls exist, but production SSO is not enabled yet.",
      nextStep: "Connect production auth provider claims for SSO/MFA before selling to customers.",
      actionLabel: "Configure security",
      actionHref: "/settings#security-setup",
    },
    {
      id: "sso_identities",
      area: "Security",
      title: "Privileged SSO identity bindings",
      status: input.privilegedSsoIdentityCoverage.total > 0 &&
        input.privilegedSsoIdentityCoverage.linked >= input.privilegedSsoIdentityCoverage.total
        ? "ready"
        : ssoReady
          ? "blocked"
          : "action_required",
      detail: `${input.privilegedSsoIdentityCoverage.linked}/${input.privilegedSsoIdentityCoverage.total} privileged user(s) linked to stable issuer/subject identities.`,
      nextStep: "Link every owner, HR admin, and manager to a stable OIDC issuer/subject identity before production verification.",
      actionLabel: "Open access",
      actionHref: "/settings/access",
    },
    {
      id: "access_cutover",
      area: "Security",
      title: "Production access cutover",
      status: accessCutoverReport.status,
      detail: accessCutoverReport.readyForProduction
        ? "正式登入切換 Gate 已通過；SSO、RBAC、薪資防漏、支援存取、demo auth 關閉與瀏覽器 session cookie posture 已可驗收。"
        : `${accessCutoverReport.summary} Top blocker: ${accessCutoverReport.topTask.title}.`,
      nextStep: accessCutoverReport.readyForProduction
        ? "Keep running access review before each production pilot or customer launch."
        : accessCutoverReport.topTask.nextStep,
      actionLabel: accessCutoverReport.readyForProduction
        ? "Review access gate"
        : accessCutoverReport.topTask.actionLabel,
      actionHref: accessCutoverReport.topTask.actionHref,
    },
    {
      id: "file_storage",
      area: "Security",
      title: "Document storage",
      status: isProductionStorageVerified(input.fileStorageSettings) ? "ready" : "blocked",
      detail: fileStorageLifecycleReadiness.ready
        ? fileStorageLifecycleReadiness.detail
        : `${input.fileStorageSettings.provider}; ${fileStorageLifecycleReadiness.detail}`,
      nextStep: "Configure production object storage, KMS reference, lifecycle policy, retention, signed URL TTL, malware scanning, and verification evidence.",
      actionLabel: "Configure storage",
      actionHref: "/settings/file-storage",
    },
    {
      id: "support_access",
      area: "Security",
      title: "Support access governance",
      status: supportAccessReady ? "ready" : "blocked",
      detail: supportAccessReady
        ? `${input.supportAccessGovernance.activeApprovedCount} active approved support grant(s); no unapproved or expired active access.`
        : `${input.supportAccessGovernance.activeUnapprovedCount} unapproved active grant(s), ${input.supportAccessGovernance.expiredStillApprovedCount} expired grant(s) still approved.`,
      nextStep: "Revoke expired grants and require customer-owner approval, scope, ticket, and expiry for every support session.",
      actionLabel: "Review support access",
      actionHref: "/settings/support-access",
    },
    {
      id: "privacy",
      area: "Compliance",
      title: "Personal data governance",
      status: privacyReadiness.ready ? "ready" : "blocked",
      detail: privacyReadiness.detail,
      nextStep: privacyReadiness.missing.length > 0
        ? `Clear privacy gaps: ${privacyReadiness.missing.join(", ")}.`
        : "Keep employee privacy notices, acknowledgements, and data subject requests current.",
      actionLabel: "Open privacy",
      actionHref: "/settings/privacy",
    },
    {
      id: "offboarding",
      area: "Compliance",
      title: "Termination offboarding",
      status: offboardingReadiness.ready ? "ready" : "blocked",
      detail: offboardingReadiness.detail,
      nextStep: offboardingReadiness.missing.length > 0
        ? `Clear offboarding gaps: ${offboardingReadiness.missing.join(", ")}.`
        : "Keep termination final wage, unused leave, insurance withdrawal, access revocation, record retention, and certificate tasks complete.",
      actionLabel: "Open offboarding",
      actionHref: "/hr/offboarding",
    },
    {
      id: "work_rules",
      area: "Compliance",
      title: "Work rules acknowledgement",
      status: workRuleReadiness.ready ? "ready" : "blocked",
      detail: workRuleReadiness.detail,
      nextStep: workRuleReadiness.missing.length > 0
        ? `Clear work rules gaps: ${workRuleReadiness.missing.join(", ")}.`
        : "Keep company work rules approved, active, versioned, and acknowledged by employees.",
      actionLabel: "Open work rules",
      actionHref: "/hr/work-rules",
    },
    {
      id: "labor_roster",
      area: "Compliance",
      title: "Labor roster completeness",
      status: laborRosterReadiness.ready ? "ready" : "blocked",
      detail: laborRosterReadiness.detail,
      nextStep: laborRosterReadiness.missing.length > 0
        ? `Complete and verify labor roster profiles for: ${laborRosterReadiness.missing.join(", ")}.`
        : "Keep Taiwan worker roster profiles complete, verified, sourced, and hash-only for sensitive fields.",
      actionLabel: "Open labor roster",
      actionHref: "/hr/labor-roster",
    },
    {
      id: "training",
      area: "Compliance",
      title: "Onboarding training evidence",
      status: trainingReadiness.ready ? "ready" : "blocked",
      detail: trainingReadiness.detail,
      nextStep: trainingReadiness.missing.length > 0
        ? `Clear training gaps: ${trainingReadiness.missing.join(", ")}.`
        : "Keep onboarding training short, assigned, reviewed, and auditable.",
      actionLabel: "Open training",
      actionHref: "/hr/training",
    },
    {
      id: "incidents",
      area: "Compliance",
      title: "Workplace incident response",
      status: incidentReadiness.ready ? "ready" : "blocked",
      detail: incidentReadiness.detail,
      nextStep: incidentReadiness.missing.length > 0
        ? `Clear incident gaps: ${incidentReadiness.missing.join(", ")}.`
        : "Keep workplace incident reporting, investigation, and authority follow-up current.",
      actionLabel: "Open incidents",
      actionHref: "/hr/incidents",
    },
    {
      id: "notifications",
      area: "Operations",
      title: "Notification delivery",
      status: externalNotificationsEnabled && input.notificationSettings.externalSummaryOnly ? "ready" : "action_required",
      detail: externalNotificationsEnabled
        ? "At least one external notification channel is enabled with summary-only payloads."
        : "Only in-app notifications are enabled.",
      nextStep: "Enable customer-approved email, LINE, Slack, or Teams delivery with summary-only payload hashes.",
      actionLabel: "Configure notifications",
      actionHref: "/settings/notifications",
    },
    {
      id: "payment_security",
      area: "Security",
      title: "Payroll payment security",
      status: input.payrollPaymentSecurity.ready ? "ready" : "blocked",
      detail: input.payrollPaymentSecurity.detail,
      nextStep: "Configure token vault, KMS reference, and verified customer bank file format before enabling production bank uploads.",
      actionLabel: "Configure payment security",
      actionHref: "/hr/payroll-payment-security",
    },
    {
      id: "calendar",
      area: "Compliance",
      title: "Taiwan annual calendar",
      status: calendarReadiness.ready ? "ready" : "blocked",
      detail: calendarReadiness.detail,
      nextStep: "Approve the annual Taiwan holiday and makeup-workday calendar with an official source before schedule/payroll launch.",
      actionLabel: "Review calendar",
      actionHref: "/hr/calendar",
    },
    {
      id: "law_rules",
      area: "Compliance",
      title: "Taiwan rule governance",
      status: input.activeRuleCount > 0 &&
        input.laborConfig.changeControl.reviewStatus === "approved" &&
        !input.laborConfig.changeControl.requiresPayrollRecalculation &&
        laborComplianceCoverageSummary.status === "ready" &&
        laborRuleValidation.passed &&
        legalSourceFreshness.passed &&
        legalSourceAuthority.passed &&
        ruleEngineReadiness.passed
        ? "ready"
        : "blocked",
      detail: `${input.activeRuleCount} active rule version(s); rule review status ${input.laborConfig.changeControl.reviewStatus}; coverage ${laborComplianceCoverageSummary.coveredCount}/${laborComplianceCoverageSummary.totalCount}; ${laborRuleValidation.passedCount}/${laborRuleValidation.fixtureCount} fixture(s) passed; executable engine ${ruleEngineReadiness.passedCount}/${ruleEngineReadiness.checkCount} check(s) passed; sources ${legalSourceFreshness.freshSourceCount}/${legalSourceFreshness.totalSourceCount} fresh, oldest ${legalSourceFreshness.oldestCheckedAt ?? "missing"}.${legalSourceAuthority.passed ? "" : ` official-source authority blocked: ${legalSourceAuthority.untrustedSourceCount} untrusted, ${legalSourceAuthority.invalidUrlSourceCount} invalid URL(s).`}`,
      nextStep: !legalSourceAuthority.passed
        ? "Replace every non-official or invalid legal source with an HTTPS official .gov.tw source, then create a reviewed rule version and rerun launch readiness."
        : laborComplianceCoverageSummary.status === "ready"
        ? "Approve active Taiwan labor/payroll rule versions, pass validation fixtures, verify executable rule-engine checks, refresh official source review dates, and recalculate any payroll drafts flagged by change control."
        : `Complete Taiwan compliance coverage before launch: ${[
          ...laborComplianceCoverageSummary.blockedItems,
          ...laborComplianceCoverageSummary.needsReviewItems,
        ].join(", ")}.`,
      actionLabel: "Review law rules",
      actionHref: "/settings#law-rules-setup",
    },
    {
      id: "audit",
      area: "Security",
      title: "Audit evidence",
      status: input.auditCount > 0 ? "ready" : "blocked",
      detail: `${input.auditCount} audit event(s) are visible in the current workspace.`,
      nextStep: "Keep every employee, attendance, leave, overtime, payroll, form, workflow, and AI mutation audited.",
      actionLabel: "Open audit logs",
      actionHref: "/settings/audit",
    },
    {
      id: "kpis",
      area: "Product",
      title: "Winning KPI gate",
      status: kpiSummary.readyForSale ? "ready" : "action_required",
      detail: `${kpiSummary.passing}/${kpiSummary.total} KPI(s) passing; ${kpiSummary.failing} failing.`,
      nextStep: "Improve telemetry and workflow speed until sale-readiness KPIs pass.",
      actionLabel: "Open KPIs",
      actionHref: "/hr/kpis",
    },
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  const actionRequiredCount = items.filter((item) => item.status === "action_required").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  return {
    readyForSale: blockedCount === 0 && actionRequiredCount === 0,
    readyCount,
    actionRequiredCount,
    blockedCount,
    setupSteps: buildSetupSteps(items),
    items,
  };
}

function defaultAccessCutoverSummary(): LaunchAccessCutoverSummary {
  return {
    readyForProduction: true,
    status: "ready",
    summary: "Access cutover not evaluated in this test context.",
    topTask: {
      title: "Access cutover",
      nextStep: "Run the production access cutover gate from /settings/access.",
      actionLabel: "Review access gate",
      actionHref: "/settings/access",
    },
  };
}

function buildSetupSteps(items: LaunchReadinessItem[]): LaunchSetupStep[] {
  return [
    setupStep({
      step: 1,
      title: "Create durable tenant foundation",
      itemIds: ["database", "tenant_seed", "subscription", "operational_resilience", "operational_maintenance"],
      summary: "Migrate, seed or import, confirm commercial terms, configure backup/restore and scheduled maintenance evidence, then run production tenant verification before onboarding employees.",
      actionLabel: "Start database setup",
      actionHref: "/settings/readiness#database-setup",
      items,
    }),
    setupStep({
      step: 2,
      title: "Harden access controls",
      itemIds: ["security", "sso_identities", "access_cutover", "support_access", "privacy"],
      summary: "Configure SSO, MFA, password posture, session timeout, allowed domains, privileged SSO identity bindings, support access governance, and privacy controls.",
      actionLabel: "Configure access",
      actionHref: "/settings/access",
      items,
    }),
    setupStep({
      step: 3,
      title: "Connect delivery infrastructure",
      itemIds: ["file_storage", "notifications", "payment_security"],
      summary: "Move documents off demo storage, enable approved external notification channels, and verify payroll payment vault/bank export readiness.",
      actionLabel: "Configure storage",
      actionHref: "/settings/file-storage",
      items,
    }),
    setupStep({
      step: 4,
      title: "Approve compliance controls",
      itemIds: ["calendar", "law_rules", "work_rules", "labor_roster", "training", "offboarding", "incidents", "audit"],
      summary: "Review Taiwan annual calendars, rule versions, company work rules, labor roster profiles, onboarding training, termination offboarding, workplace incident response, and sensitive mutation audit evidence.",
      actionLabel: "Review compliance",
      actionHref: "/settings#law-rules-setup",
      items,
    }),
    setupStep({
      step: 5,
      title: "Validate sale-readiness KPIs",
      itemIds: ["kpis"],
      summary: "Use telemetry to prove the product is fast, safe, and easy enough to adopt.",
      actionLabel: "Open KPIs",
      actionHref: "/hr/kpis",
      items,
    }),
  ];
}

function defaultOperationalMaintenanceSummary(): Pick<
  OperationalMaintenanceReport,
  "status" | "readyForAutomatedMaintenance" | "summary" | "routePath" | "signals"
> {
  return {
    status: "ready",
    readyForAutomatedMaintenance: true,
    summary: "Operational maintenance readiness not evaluated in this test context.",
    routePath: "/api/reports/maintenance/run",
    signals: [],
  };
}

function setupStep(input: {
  step: number;
  title: string;
  itemIds: string[];
  summary: string;
  actionLabel: string;
  actionHref: string;
  items: LaunchReadinessItem[];
}): LaunchSetupStep {
  const matchedItems = input.items.filter((item) => input.itemIds.includes(item.id));
  const status = matchedItems.some((item) => item.status === "blocked")
    ? "blocked"
    : matchedItems.some((item) => item.status === "action_required")
      ? "action_required"
      : "ready";
  const firstOpenItem = matchedItems.find((item) => item.status !== "ready");
  return {
    step: input.step,
    title: input.title,
    status,
    itemIds: input.itemIds,
    summary: firstOpenItem ? `${input.summary} Next: ${firstOpenItem.nextStep}` : input.summary,
    actionLabel: firstOpenItem?.actionLabel ?? input.actionLabel,
    actionHref: firstOpenItem?.actionHref ?? input.actionHref,
  };
}
