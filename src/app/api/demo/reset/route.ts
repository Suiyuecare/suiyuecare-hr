import { NextResponse } from "next/server";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import { resetAuditEvidenceDemoState } from "@/server/audit/evidence-packages";
import { resetAiDemoState } from "@/server/ai/demo-store";
import { resetPolicyDocumentDemoState } from "@/server/ai/policy-docs";
import { resetAttendancePolicyDemoState } from "@/server/attendance/policies";
import { resetWorktimeAgreementDemoState } from "@/server/attendance/worktime-agreements";
import { resetWorktimeComplianceDemoState } from "@/server/attendance/worktime-compliance";
import { resetCompanyCalendarDemoState } from "@/server/calendar/company-calendar";
import { resetEmployeeDocumentDemoState } from "@/server/employees/documents";
import { resetEmployeeImportDemoState } from "@/server/employees/imports";
import { resetEmployeeLifecycleDemoState } from "@/server/employees/lifecycle";
import { resetOffboardingDemoState } from "@/server/employees/offboarding";
import { resetFileStorageDemoState } from "@/server/files/storage";
import { resetStatutoryInsuranceDemoState } from "@/server/insurance/statutory";
import { resetIncidentDemoState } from "@/server/incidents/workplace";
import { resetAnnualLeaveExpiryDemoState } from "@/server/leave/annual-leave-expiry";
import { resetAnnualLeaveSettlementDemoState } from "@/server/leave/annual-leave-settlements";
import { resetAnnualLeaveGrantDemoState } from "@/server/leave/annual-leave-grants";
import { resetLeavePolicyDemoState } from "@/server/leave/policies";
import { resetNotificationDemoState } from "@/server/notifications/service";
import {
  demoCookieOptions,
  defaultDemoAuthClaimsForRole,
  demoAuthenticatedAtCookie,
  demoAuthMethodCookie,
  demoLastSeenAtCookie,
  demoMfaCookie,
  demoRoleCookie,
} from "@/server/auth/demo-session";
import { resetAccessDemoState } from "@/server/auth/access-management";
import { resetPayrollAdjustmentDemoState } from "@/server/payroll/adjustments";
import { resetPayrollAccountingSettingsDemoState } from "@/server/payroll/accounting-settings";
import { resetPayrollComplianceDemoState } from "@/server/payroll/compliance";
import { resetPayrollDemoState } from "@/server/payroll/demo-store";
import { resetPayrollExportDemoState } from "@/server/payroll/exports";
import { resetPaymentProfileDemoState } from "@/server/payroll/payment-profiles";
import { resetPayrollPaymentSecurityDemoState } from "@/server/payroll/payment-security";
import { resetPayrollProfileImportDemoState } from "@/server/payroll/profile-imports";
import { resetPayrollRecordkeepingDemoState } from "@/server/payroll/recordkeeping";
import { resetSalaryProfileDemoState } from "@/server/payroll/salary-profiles";
import { resetPrivacyDemoState } from "@/server/privacy/governance";
import { resetOperationalResilienceDemoState } from "@/server/readiness/operational-resilience";
import { resetRuleSettingsDemoState } from "@/server/rules/settings";
import { resetShiftTemplateDemoState } from "@/server/scheduling/shift-templates";
import { resetSecuritySettingsDemoState } from "@/server/settings/security";
import { resetSubscriptionDemoState } from "@/server/subscriptions/service";
import { resetSupportAccessDemoState } from "@/server/support/access";
import { resetTrainingDemoState } from "@/server/training/compliance";
import { resetWorkRulesDemoState } from "@/server/work-rules/service";
import { resetDemoWorkflowState } from "@/server/workflows/demo-store";
import { resetProductTelemetryDemoState } from "@/server/telemetry/product";

export async function POST() {
  if (!process.env.DATABASE_URL) {
    resetDemoWorkflowState();
    resetAccessDemoState();
    resetPayrollAdjustmentDemoState();
    resetPayrollAccountingSettingsDemoState();
    resetPayrollComplianceDemoState();
    resetPayrollDemoState();
    resetPayrollExportDemoState();
    resetPayrollPaymentSecurityDemoState();
    resetPayrollProfileImportDemoState();
    resetPayrollRecordkeepingDemoState();
    resetPrivacyDemoState();
    resetOperationalResilienceDemoState();
    resetPaymentProfileDemoState();
    resetSalaryProfileDemoState();
    resetAiDemoState();
    resetPolicyDocumentDemoState();
    resetAttendancePolicyDemoState();
    resetWorktimeAgreementDemoState();
    resetWorktimeComplianceDemoState();
    resetCompanyCalendarDemoState();
    resetEmployeeDocumentDemoState();
    resetEmployeeImportDemoState();
    resetEmployeeLifecycleDemoState();
    resetOffboardingDemoState();
    resetFileStorageDemoState();
    resetStatutoryInsuranceDemoState();
    resetIncidentDemoState();
    resetAnnualLeaveExpiryDemoState();
    resetAnnualLeaveGrantDemoState();
    resetAnnualLeaveSettlementDemoState();
    resetLeavePolicyDemoState();
    resetNotificationDemoState();
    resetRuleSettingsDemoState();
    resetSecuritySettingsDemoState();
    resetSubscriptionDemoState();
    resetSupportAccessDemoState();
    resetShiftTemplateDemoState();
    resetTrainingDemoState();
    resetWorkRulesDemoState();
    resetProductTelemetryDemoState();
    resetAuditEvidenceDemoState();
    resetAuditDemoState();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(demoRoleCookie, "employee", demoCookieOptions());
  const claims = defaultDemoAuthClaimsForRole("employee");
  response.cookies.set(demoAuthMethodCookie, claims.method, demoCookieOptions());
  response.cookies.set(demoMfaCookie, String(claims.mfaVerified), demoCookieOptions());
  response.cookies.set(demoAuthenticatedAtCookie, claims.authenticatedAt, demoCookieOptions());
  response.cookies.set(demoLastSeenAtCookie, claims.lastSeenAt, demoCookieOptions());
  return response;
}
