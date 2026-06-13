import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getCompanyOverview } from "@/server/dashboard/queries";
import { getFileStorageSettings } from "@/server/files/storage";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";
import {
  evaluateLegalSourceFreshness,
  validateTaiwanLaborStandardsRuleSet,
} from "@/server/rules/validation";
import { getCompanySecuritySettings, hasSsoMetadata } from "@/server/settings/security";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function AdminSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const [overview, laborConfig, securitySettings, fileStorageSettings] = await Promise.all([
    getCompanyOverview(),
    getTaiwanLaborStandardsConfig(session),
    getCompanySecuritySettings(session),
    getFileStorageSettings(session),
  ]);
  const ssoMetadataReady = hasSsoMetadata(securitySettings);
  const ruleValidation = validateTaiwanLaborStandardsRuleSet(laborConfig);
  const sourceFreshness = evaluateLegalSourceFreshness(laborConfig.sources);
  const staleSourceIds = new Set(sourceFreshness.staleSourceIds);
  const invalidSourceIds = new Set(sourceFreshness.invalidSourceIds);

  if (!overview) {
    return (
      <main className="page">
        <EmptyState
          title="No seed data yet"
          body="Run the database migration and seed commands from README before opening admin settings."
        />
      </main>
    );
  }

  return (
    <main className="page">
      <section className="page-header">
        <h1>Company Settings</h1>
        <p>Owner/admin view for tenant setup, security posture, roles, and audit readiness.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update settings</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Tenant company</span>
          <strong>{overview.company.name}</strong>
          <span className="badge">{overview.company.timezone}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Audit events</span>
          <strong>{overview.auditCount}</strong>
          <span className="badge">PII redacted</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Managers</span>
          <strong>{overview.managerCount}</strong>
          <span className="badge">RBAC enabled</span>
        </div>

        <div className="panel span-6">
          <h2>Setup wizards</h2>
          <ul className="task-list">
            <li className="task">
              <span>Company profile</span>
              <span className="badge">Configured</span>
            </li>
            <li className="task">
              <span>Departments and managers</span>
              <span className="badge">Seeded</span>
            </li>
            <li className="task">
              <span>User access</span>
              <a className="button" href="/settings/access">
                Manage
              </a>
            </li>
            <li className="task">
              <span>Launch readiness</span>
              <a className="button" href="/settings/readiness">
                Review
              </a>
            </li>
            <li className="task">
              <span>Commercial subscription</span>
              <a className="button" href="/settings/subscription">
                Review
              </a>
            </li>
            <li className="task">
              <span>Law rules</span>
              <span className="badge">{laborConfig.version}</span>
            </li>
          </ul>
        </div>

        <div className="panel span-6">
          <h2>Security guardrails</h2>
          <ul className="task-list">
            <li className="task">
              <span>Admin MFA</span>
              <span className={`badge ${securitySettings.mfaRequiredForAdmins ? "" : "warning"}`}>
                {securitySettings.mfaRequiredForAdmins ? "Required" : "Optional"}
              </span>
            </li>
            <li className="task">
              <span>Employee MFA</span>
              <span className={`badge ${securitySettings.mfaRequiredForEmployees ? "" : "warning"}`}>
                {securitySettings.mfaRequiredForEmployees ? "Required" : "Optional"}
              </span>
            </li>
            <li className="task">
              <span>SSO</span>
              <span className={`badge ${securitySettings.ssoEnabled && ssoMetadataReady ? "" : "warning"}`}>
                {securitySettings.ssoEnabled
                  ? ssoMetadataReady ? securitySettings.ssoProvider ?? "Enabled" : "Metadata missing"
                  : "Not enabled"}
              </span>
            </li>
            <li className="task">
              <span>Audit log console</span>
              <a className="button" href="/settings/audit">
                Open logs
              </a>
            </li>
            <li className="task">
              <span>Support access</span>
              <a className="button" href="/settings/support-access">
                Manage
              </a>
            </li>
            <li className="task">
              <span>Privacy Center</span>
              <a className="button" href="/settings/privacy">
                Review
              </a>
            </li>
            <li className="task">
              <span>Operational resilience</span>
              <a className="button" href="/settings/operational-resilience">
                Review
              </a>
            </li>
            <li className="task">
              <span>File storage</span>
              <span className={`badge ${fileStorageSettings.provider === "demo_object_storage" ? "warning" : ""}`}>
                {fileStorageSettings.provider}
              </span>
            </li>
            <li className="task">
              <span>Notification channels</span>
              <a className="button" href="/settings/notifications">
                Configure
              </a>
            </li>
            <li className="task">
              <span>Payroll adjustment approvals</span>
              <a className="button" href="/hr/payroll-adjustments">
                Review
              </a>
            </li>
          </ul>
        </div>

        <section className="panel span-12" id="security-setup">
          <div className="section-heading">
            <div>
              <h2>Security posture setup</h2>
              <p className="muted">
                Configure company authentication guardrails. Provider enforcement comes after production auth integration.
              </p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/settings/security" method="post" className="mini-form">
            <div className="toggle-row">
              <label className="check-row">
                <input name="mfaRequiredForAdmins" type="checkbox" defaultChecked={securitySettings.mfaRequiredForAdmins} />
                Require admin MFA
              </label>
              <label className="check-row">
                <input name="mfaRequiredForEmployees" type="checkbox" defaultChecked={securitySettings.mfaRequiredForEmployees} />
                Require employee MFA
              </label>
              <label className="check-row">
                <input name="ssoEnabled" type="checkbox" defaultChecked={securitySettings.ssoEnabled} />
                Enable SSO placeholder
              </label>
            </div>
            <div className="field-grid">
              <label>
                SSO provider
                <input name="ssoProvider" placeholder="Okta, Entra ID, Google" defaultValue={securitySettings.ssoProvider ?? ""} />
              </label>
              <label>
                SSO issuer URL
                <input
                  name="ssoIssuerUrl"
                  type="url"
                  placeholder="https://login.example.com/{tenant}/v2.0"
                  defaultValue={securitySettings.ssoIssuerUrl ?? ""}
                />
              </label>
              <label>
                SSO client ID
                <input name="ssoClientId" placeholder="public client/application id" defaultValue={securitySettings.ssoClientId ?? ""} />
              </label>
              <label>
                SSO JWKS URL
                <input
                  name="ssoJwksUrl"
                  type="url"
                  placeholder="https://login.example.com/.well-known/jwks.json"
                  defaultValue={securitySettings.ssoJwksUrl ?? ""}
                />
              </label>
              <label>
                Password minimum length
                <input name="passwordMinLength" type="number" min="8" max="128" defaultValue={securitySettings.passwordMinLength} />
              </label>
              <label>
                Session timeout minutes
                <input name="sessionTimeoutMinutes" type="number" min="15" defaultValue={securitySettings.sessionTimeoutMinutes} />
              </label>
              <label>
                Idle timeout minutes
                <input name="idleTimeoutMinutes" type="number" min="5" defaultValue={securitySettings.idleTimeoutMinutes} />
              </label>
            </div>
            <div className="toggle-row">
              <label className="check-row">
                <input name="passwordRequiresNumber" type="checkbox" defaultChecked={securitySettings.passwordRequiresNumber} />
                Require number
              </label>
              <label className="check-row">
                <input name="passwordRequiresSymbol" type="checkbox" defaultChecked={securitySettings.passwordRequiresSymbol} />
                Require symbol
              </label>
            </div>
            <label>
              Allowed email domains
              <input name="allowedEmailDomains" defaultValue={securitySettings.allowedEmailDomains.join(", ")} />
            </label>
            <button className="button primary" type="submit">
              Save security settings
            </button>
          </form>
        </section>

        <section className="panel span-12" id="file-storage-setup">
          <div className="section-heading">
            <div>
              <h2>File storage setup</h2>
              <p className="muted">
                Configure object storage policy for HR documents and future attachments. Secrets stay in the provider vault.
              </p>
            </div>
            <span className="badge">No file bytes in DB</span>
          </div>
          <form action="/api/settings/file-storage" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                Provider
                <select name="provider" defaultValue={fileStorageSettings.provider}>
                  <option value="demo_object_storage">Demo object storage</option>
                  <option value="s3">Amazon S3 compatible</option>
                  <option value="r2">Cloudflare R2</option>
                  <option value="gcs">Google Cloud Storage</option>
                  <option value="azure_blob">Azure Blob</option>
                  <option value="custom">Custom provider</option>
                </select>
              </label>
              <label>
                Bucket name
                <input name="bucketName" defaultValue={fileStorageSettings.bucketName} required />
              </label>
              <label>
                Region
                <input name="region" defaultValue={fileStorageSettings.region ?? ""} placeholder="ap-northeast-1" />
              </label>
              <label>
                Base prefix
                <input name="basePrefix" defaultValue={fileStorageSettings.basePrefix} required />
              </label>
              <label>
                KMS key reference
                <input name="kmsKeyRef" defaultValue={fileStorageSettings.kmsKeyRef ?? ""} placeholder="alias/hr-one-documents" />
              </label>
              <label>
                Signed URL TTL minutes
                <input
                  name="signedUrlTtlMinutes"
                  type="number"
                  min="1"
                  max="120"
                  defaultValue={fileStorageSettings.signedUrlTtlMinutes}
                />
              </label>
              <label>
                Max file size MB
                <input name="maxFileSizeMb" type="number" min="1" max="100" defaultValue={fileStorageSettings.maxFileSizeMb} />
              </label>
              <label>
                Retention days
                <input name="retentionDays" type="number" min="30" max="3650" defaultValue={fileStorageSettings.retentionDays} />
              </label>
              <label>
                Verification status
                <select name="verificationStatus" defaultValue={fileStorageSettings.verificationStatus}>
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label>
                Last verified
                <input value={fileStorageSettings.lastVerifiedAt?.toISOString() ?? "Not verified"} readOnly />
              </label>
            </div>
            <label className="check-row">
              <input
                name="malwareScanningRequired"
                type="checkbox"
                defaultChecked={fileStorageSettings.malwareScanningRequired}
              />
              Require malware scan before download
            </label>
            <label>
              Allowed MIME types
              <input name="allowedMimeTypes" defaultValue={fileStorageSettings.allowedMimeTypes.join(", ")} />
            </label>
            <label>
              Verification note
              <textarea
                name="verificationNote"
                rows={3}
                defaultValue={fileStorageSettings.verificationNote ?? ""}
                placeholder="Record the external provider smoke test result. Do not paste secrets."
              />
            </label>
            <button className="button primary" type="submit">
              Save file storage settings
            </button>
          </form>
        </section>

        <section className="panel span-12" id="law-rules-setup">
          <div className="section-heading">
            <div>
              <h2>Taiwan labor rule setup</h2>
              <p className="muted">
                Versioned defaults come from official law sources. Company overrides must remain at or above legal minimums.
              </p>
            </div>
            <span className={`badge ${laborConfig.changeControl.reviewStatus === "approved" ? "" : "warning"}`}>
              {laborConfig.changeControl.reviewStatus === "approved" ? "Reviewed" : "Review pending"}
            </span>
          </div>
          <div className="panel-subtle">
            <strong>Rule validation</strong>
            <p className="muted">
              {ruleValidation.passedCount}/{ruleValidation.fixtureCount} fixtures passed · {ruleValidation.fixtureSetVersion}
            </p>
            <span className={`badge ${ruleValidation.passed ? "" : "danger"}`}>
              {ruleValidation.passed ? "Validation passed" : "Validation failed"}
            </span>
            <p className="muted">
              Sources fresh: {sourceFreshness.freshSourceCount}/{sourceFreshness.totalSourceCount} · oldest {sourceFreshness.oldestCheckedAt ?? "missing"} · max {sourceFreshness.maxAgeDays} days
            </p>
            <span className={`badge ${sourceFreshness.passed ? "" : "warning"}`}>
              {sourceFreshness.passed ? "Sources current" : "Source review needed"}
            </span>
          </div>
          <div className={`panel-subtle ${sourceFreshness.passed ? "success-box" : "warning-box"}`}>
            <div className="section-heading compact-heading">
              <div>
                <h3>Legal source monitor</h3>
                <p className="muted">
                  Review official Taiwan law, MOL, BLI, NHI, and tax sources before payroll, attendance, leave, or termination rules are trusted for launch.
                </p>
              </div>
              <span className={`badge ${sourceFreshness.passed ? "" : "warning"}`}>
                {sourceFreshness.staleSourceCount + sourceFreshness.invalidSourceCount} needs review
              </span>
            </div>
            <ul className="task-list">
              {laborConfig.sources.map((source) => {
                const stale = staleSourceIds.has(source.id);
                const invalid = invalidSourceIds.has(source.id);
                return (
                  <li className="task" key={source.id}>
                    <span>
                      <strong>{source.title}</strong>
                      <small>{source.id} · {source.url}</small>
                    </span>
                    <span className="inline-actions">
                      <span className={`badge ${stale || invalid ? "warning" : ""}`}>
                        {invalid ? "Invalid date" : stale ? "Review due" : "Fresh"}
                      </span>
                      <span className="badge">{source.checkedAt}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <form action="/api/settings/law-rules" method="post" className="mini-form">
            <div className="section-heading compact-heading">
              <div>
                <h3>Change control</h3>
                <p className="muted">
                  Every rule change keeps its reason, source, review status, and payroll recalculation flag with the rule version.
                </p>
              </div>
              <span className="badge">Audited version</span>
            </div>
            <div className="field-grid">
              <label>
                Change reason
                <textarea
                  name="changeReason"
                  rows={3}
                  defaultValue={laborConfig.changeControl.reason}
                  required
                />
              </label>
              <label>
                Source URL
                <input
                  name="changeSourceUrl"
                  type="url"
                  defaultValue={laborConfig.changeControl.sourceUrl ?? ""}
                  placeholder="https://laws.mol.gov.tw/..."
                />
              </label>
              <label>
                Reviewed by
                <input
                  name="reviewedBy"
                  defaultValue={laborConfig.changeControl.reviewedBy ?? ""}
                  placeholder="HR owner or legal reviewer"
                />
              </label>
              <label>
                Review status
                <select name="reviewStatus" defaultValue={laborConfig.changeControl.reviewStatus}>
                  <option value="pending_legal_review">Pending legal review</option>
                  <option value="approved">Approved</option>
                </select>
              </label>
            </div>
            <label className="check-row">
              <input
                name="requiresPayrollRecalculation"
                type="checkbox"
                defaultChecked={laborConfig.changeControl.requiresPayrollRecalculation}
              />
              Mark existing payroll drafts for recalculation review
            </label>
            <ul className="task-list">
              <li className="task">
                <span>
                  <strong>Last review</strong>
                  <small>
                    {laborConfig.changeControl.reviewedAt
                      ? `${laborConfig.changeControl.reviewedAt} by ${laborConfig.changeControl.reviewedBy ?? "Unknown reviewer"}`
                      : "No approved review timestamp yet."}
                  </small>
                </span>
                <span className={`badge ${laborConfig.changeControl.requiresPayrollRecalculation ? "warning" : ""}`}>
                  {laborConfig.changeControl.requiresPayrollRecalculation ? "Recalculate payroll" : "No payroll impact"}
                </span>
              </li>
            </ul>
            <div className="section-heading compact-heading">
              <div>
                <h3>Official source review</h3>
                <p className="muted">
                  Keep the source inventory editable so HR/legal can refresh citations without code changes.
                </p>
              </div>
              <span className="badge">CSV wizard</span>
            </div>
            <label>
              Official legal sources
              <textarea
                name="legalSourcesCsv"
                rows={10}
                defaultValue={formatLegalSourcesCsv(laborConfig.sources)}
                aria-describedby="legal-sources-help"
              />
            </label>
            <p className="muted" id="legal-sources-help">
              Format: id,title,url,checkedAt. Use YYYY-MM-DD for checkedAt. Do not paste internal notes or private employee data.
            </p>
            <div className="field-grid">
              <label>
                Minimum monthly wage
                <input
                  name="minimumMonthlyWage"
                  type="number"
                  min="1"
                  defaultValue={laborConfig.minimumMonthlyWage}
                />
              </label>
              <label>
                Minimum hourly wage
                <input
                  name="minimumHourlyWage"
                  type="number"
                  min="1"
                  defaultValue={laborConfig.minimumHourlyWage}
                />
              </label>
              <label>
                Payroll standard monthly hours
                <input
                  name="payrollStandardMonthlyHours"
                  type="number"
                  min="1"
                  defaultValue={laborConfig.payrollStandardMonthlyHours}
                />
              </label>
              <label>
                Normal weekly hours
                <input value={laborConfig.normalWeeklyMinutes / 60} readOnly />
              </label>
            </div>
            <div className="section-heading compact-heading">
              <div>
                <h3>Working time and leave compliance</h3>
                <p className="muted">
                  Article 24, 36, 37, 38, and 39 settings stay versioned for payroll and schedule checks.
                </p>
              </div>
              <span className="badge warning">Legal review</span>
            </div>
            <div className="field-grid">
              <label>
                Holiday work multiplier
                <input
                  name="holidayWorkMultiplier"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue={laborConfig.holidayWorkMultiplier}
                />
              </label>
              <label>
                Regular leave work multiplier
                <input
                  name="regularLeaveWorkMultiplier"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue={laborConfig.regularLeaveWorkMultiplier}
                />
              </label>
              <label>
                Emergency overtime multiplier
                <input
                  name="emergencyOvertimeMultiplier"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue={laborConfig.emergencyOvertimeMultiplier}
                />
              </label>
              <label>
                Daily max hours including overtime
                <input
                  name="maxDailyWorkHoursIncludingOvertime"
                  type="number"
                  min="1"
                  step="0.5"
                  defaultValue={laborConfig.maxDailyWorkMinutesIncludingOvertime / 60}
                />
              </label>
              <label>
                Monthly overtime max hours
                <input
                  name="maxMonthlyOvertimeHours"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={laborConfig.maxMonthlyOvertimeMinutes / 60}
                />
              </label>
              <label>
                Monthly overtime max with agreement
                <input
                  name="maxMonthlyOvertimeHoursWithAgreement"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={laborConfig.maxMonthlyOvertimeMinutesWithAgreement / 60}
                />
              </label>
              <label>
                Three-month overtime max with agreement
                <input
                  name="maxThreeMonthOvertimeHoursWithAgreement"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={laborConfig.maxThreeMonthOvertimeMinutesWithAgreement / 60}
                />
              </label>
              <label>
                Rest cycle days
                <input
                  name="restDayCycleDays"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={laborConfig.restDayCycleDays}
                />
              </label>
              <label>
                Regular leave days per cycle
                <input
                  name="requiredRegularLeaveDaysPerCycle"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={laborConfig.requiredRegularLeaveDaysPerCycle}
                />
              </label>
              <label>
                Rest days per cycle
                <input
                  name="requiredRestDaysPerCycle"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={laborConfig.requiredRestDaysPerCycle}
                />
              </label>
            </div>
            <ul className="task-list">
              <li className="task">
                <span>
                  <strong>Regular day overtime tiers</strong>
                  <small>{laborConfig.regularDayOvertimeTiers.map((tier) => `${tier.label} x${tier.multiplier.toFixed(2)}`).join(" · ")}</small>
                </span>
                <span className="badge">Article 24</span>
              </li>
              <li className="task">
                <span>
                  <strong>Annual leave tiers</strong>
                  <small>{laborConfig.annualLeaveTiers.length} service tiers configured</small>
                </span>
                <span className="badge">Article 38</span>
              </li>
            </ul>

            <div className="section-heading compact-heading">
              <div>
                <h3>Statutory onboarding</h3>
                <p className="muted">
                  HR onboarding readiness uses these due-day settings for labor insurance, employment insurance, occupational accident insurance, and withdrawal follow-up.
                </p>
              </div>
              <span className="badge warning">BLI timing</span>
            </div>
            <div className="field-grid">
              <label>
                Labor insurance enrollment due days from hire
                <input
                  name="laborInsuranceEnrollmentDueDaysFromHire"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={laborConfig.statutoryOnboarding.laborInsuranceEnrollmentDueDaysFromHire}
                />
              </label>
              <label>
                Employment insurance enrollment due days from hire
                <input
                  name="employmentInsuranceEnrollmentDueDaysFromHire"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={laborConfig.statutoryOnboarding.employmentInsuranceEnrollmentDueDaysFromHire}
                />
              </label>
              <label>
                Occupational accident insurance enrollment due days from hire
                <input
                  name="occupationalAccidentInsuranceEnrollmentDueDaysFromHire"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={laborConfig.statutoryOnboarding.occupationalAccidentInsuranceEnrollmentDueDaysFromHire}
                />
              </label>
              <label>
                Insurance withdrawal due days from termination
                <input
                  name="insuranceWithdrawalDueDaysFromTermination"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={laborConfig.statutoryOnboarding.insuranceWithdrawalDueDaysFromTermination}
                />
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>Termination compliance</h3>
                <p className="muted">
                  HR lifecycle termination checks use these versioned notice and severance settings as a review aid.
                </p>
              </div>
              <span className="badge warning">Human review</span>
            </div>
            <div className="field-grid">
              <label>
                Advance notice tiers
                <textarea
                  name="terminationAdvanceNoticeTiersCsv"
                  rows={4}
                  defaultValue={formatAdvanceNoticeTiersCsv(laborConfig.terminationCompliance.advanceNoticeTiers)}
                />
              </label>
              <label>
                Labor Pension Act severance multiplier per service year
                <input
                  name="laborPensionSeveranceMultiplierPerServiceYear"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={laborConfig.terminationCompliance.laborPensionSeveranceMultiplierPerServiceYear}
                />
              </label>
              <label>
                Labor Pension Act severance max average-wage months
                <input
                  name="laborPensionSeveranceMaxAverageWageMonths"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={laborConfig.terminationCompliance.laborPensionSeveranceMaxAverageWageMonths}
                />
              </label>
              <label>
                Labor Standards Act severance multiplier per service year
                <input
                  name="laborStandardsSeveranceMultiplierPerServiceYear"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={laborConfig.terminationCompliance.laborStandardsSeveranceMultiplierPerServiceYear}
                />
              </label>
            </div>
            <ul className="task-list">
              <li className="task">
                <span>
                  <strong>Advance notice</strong>
                  <small>
                    {laborConfig.terminationCompliance.advanceNoticeTiers.map((tier) =>
                      `${tier.serviceMonthsFrom}+ month(s): ${tier.noticeDays} day(s)`,
                    ).join(" · ")}
                  </small>
                </span>
                <span className="badge">Article 16</span>
              </li>
              <li className="task">
                <span>
                  <strong>Severance review basis</strong>
                  <small>
                    New pension system x{laborConfig.terminationCompliance.laborPensionSeveranceMultiplierPerServiceYear}/year capped at {laborConfig.terminationCompliance.laborPensionSeveranceMaxAverageWageMonths} month(s); old system x{laborConfig.terminationCompliance.laborStandardsSeveranceMultiplierPerServiceYear}/year.
                  </small>
                </span>
                <span className="badge">Article 17 / LPA 12</span>
              </li>
            </ul>

            <div className="section-heading compact-heading">
              <div>
                <h3>Statutory payroll settings</h3>
                <p className="muted">
                  Keep rates versioned here. Payroll uses these records instead of hidden constants.
                </p>
              </div>
            </div>
            <div className="field-grid">
              <label>
                Labor insurance employee rate (%)
                <input
                  name="laborInsuranceEmployeeRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.laborInsuranceEmployeeRate)}
                />
              </label>
              <label>
                Labor insurance employer share (%)
                <input
                  name="laborInsuranceEmployerShare"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.laborInsuranceEmployerShare)}
                />
              </label>
              <label>
                NHI premium rate (%)
                <input
                  name="nationalHealthInsuranceRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.nationalHealthInsuranceRate)}
                />
              </label>
              <label>
                NHI employee share (%)
                <input
                  name="nationalHealthInsuranceEmployeeShare"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.nationalHealthInsuranceEmployeeShare)}
                />
              </label>
              <label>
                NHI employer share (%)
                <input
                  name="nationalHealthInsuranceEmployerShare"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.nationalHealthInsuranceEmployerShare)}
                />
              </label>
              <label>
                NHI employer average dependents
                <input
                  name="nationalHealthInsuranceAverageDependentCount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={laborConfig.statutoryPayroll.nationalHealthInsuranceAverageDependentCount}
                />
              </label>
              <label>
                NHI dependent limit
                <input
                  name="nationalHealthInsuranceDependentLimit"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={laborConfig.statutoryPayroll.nationalHealthInsuranceDependentLimit}
                />
              </label>
              <label>
                NHI supplementary premium rate (%)
                <input
                  name="nationalHealthInsuranceSupplementaryPremiumRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.001"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.nationalHealthInsuranceSupplementaryPremiumRate)}
                />
              </label>
              <label>
                NHI bonus threshold multiplier
                <input
                  name="nationalHealthInsuranceSupplementaryBonusThresholdMultiplier"
                  type="number"
                  min="1"
                  step="0.1"
                  defaultValue={laborConfig.statutoryPayroll.nationalHealthInsuranceSupplementaryBonusThresholdMultiplier}
                />
              </label>
              <label>
                Occupational accident industry rate (%)
                <input
                  name="occupationalAccidentIndustryRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.001"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.occupationalAccidentIndustryRate)}
                />
              </label>
              <label>
                Occupational accident commute rate (%)
                <input
                  name="occupationalAccidentCommuteRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.001"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.occupationalAccidentCommuteRate)}
                />
              </label>
              <label>
                Labor pension employer rate (%)
                <input
                  name="laborPensionEmployerContributionRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.laborPensionEmployerContributionRate)}
                />
              </label>
              <label>
                Legacy flat withholding rate (%)
                <input
                  name="incomeTaxWithholdingRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={formatPercentInput(laborConfig.statutoryPayroll.incomeTaxWithholdingRate)}
                />
              </label>
            </div>
            <div className="toggle-row">
              <label>
                <input
                  name="nationalHealthInsuranceSupplementaryPremiumEnabled"
                  type="checkbox"
                  defaultChecked={laborConfig.statutoryPayroll.nationalHealthInsuranceSupplementaryPremiumEnabled}
                />
                Calculate NHI supplementary premium for bonus items
              </label>
            </div>
            <div className="section-heading compact-heading">
              <div>
                <h3>Income tax withholding estimate</h3>
                <p className="muted">
                  Annualized progressive estimate for payroll draft. HR must review against official withholding tables before lock.
                </p>
              </div>
              <span className="badge warning">Review required</span>
            </div>
            <div className="field-grid">
              <label>
                Annualization months
                <input
                  name="incomeTaxWithholdingMonthsPerYear"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={laborConfig.statutoryPayroll.incomeTaxWithholding.monthsPerYear}
                />
              </label>
              <label>
                Monthly exemption amount
                <input
                  name="monthlyExemptionAmount"
                  type="number"
                  min="0"
                  defaultValue={laborConfig.statutoryPayroll.incomeTaxWithholding.monthlyExemptionAmount}
                />
              </label>
              <label>
                Monthly standard deduction
                <input
                  name="monthlyStandardDeductionAmount"
                  type="number"
                  min="0"
                  defaultValue={laborConfig.statutoryPayroll.incomeTaxWithholding.monthlyStandardDeductionAmount}
                />
              </label>
              <label>
                Annual salary special deduction
                <input
                  name="annualSalarySpecialDeductionAmount"
                  type="number"
                  min="0"
                  defaultValue={laborConfig.statutoryPayroll.incomeTaxWithholding.annualSalarySpecialDeductionAmount}
                />
              </label>
              <label>
                Minimum monthly withholding
                <input
                  name="minimumMonthlyWithholding"
                  type="number"
                  min="0"
                  defaultValue={laborConfig.statutoryPayroll.incomeTaxWithholding.minimumMonthlyWithholding}
                />
              </label>
              <label>
                Tax brackets
                <textarea
                  name="incomeTaxBracketsCsv"
                  rows={5}
                  defaultValue={formatTaxBracketsCsv(laborConfig.statutoryPayroll.incomeTaxWithholding.brackets)}
                />
              </label>
            </div>
            <div className="section-heading compact-heading">
              <div>
                <h3>Salary grade tables</h3>
                <p className="muted">
                  CSV lines use level, insured salary, salary from, salary to. Leave salary to blank for the top open-ended grade.
                </p>
              </div>
              <span className="badge warning">Versioned</span>
            </div>
            <div className="field-grid">
              <label>
                Labor insurance salary grades
                <textarea
                  name="laborInsuranceSalaryGradesCsv"
                  rows={6}
                  defaultValue={formatSalaryGradesCsv(laborConfig.statutoryPayroll.laborInsuranceSalaryGrades)}
                />
              </label>
              <label>
                NHI salary grades
                <textarea
                  name="healthInsuranceSalaryGradesCsv"
                  rows={6}
                  defaultValue={formatSalaryGradesCsv(laborConfig.statutoryPayroll.healthInsuranceSalaryGrades)}
                />
              </label>
              <label>
                Labor pension contribution grades
                <textarea
                  name="laborPensionContributionGradesCsv"
                  rows={6}
                  defaultValue={formatSalaryGradesCsv(laborConfig.statutoryPayroll.laborPensionContributionGrades)}
                />
              </label>
            </div>
            <ul className="task-list">
              <li className="task">
                <span>
                  <strong>Labor insurance salary grades</strong>
                  <small>{describeGradeCoverage(laborConfig.statutoryPayroll.laborInsuranceSalaryGrades)}</small>
                </span>
                <span className="badge">{laborConfig.statutoryPayroll.laborInsuranceSalaryGrades.length} levels</span>
              </li>
              <li className="task">
                <span>
                  <strong>NHI salary grades</strong>
                  <small>{describeGradeCoverage(laborConfig.statutoryPayroll.healthInsuranceSalaryGrades)}</small>
                </span>
                <span className="badge">{laborConfig.statutoryPayroll.healthInsuranceSalaryGrades.length} levels</span>
              </li>
              <li className="task">
                <span>
                  <strong>Labor pension contribution grades</strong>
                  <small>{describeGradeCoverage(laborConfig.statutoryPayroll.laborPensionContributionGrades)}</small>
                </span>
                <span className="badge">{laborConfig.statutoryPayroll.laborPensionContributionGrades.length} levels</span>
              </li>
            </ul>
            <div className="section-heading compact-heading">
              <div>
                <h3>Statutory filing package mappings</h3>
                <p className="muted">
                  Define which payroll item codes roll up into each HR/accounting review package before government filing.
                </p>
              </div>
              <span className="badge warning">Rule controlled</span>
            </div>
            <label>
              Statutory filing report mappings
              <textarea
                name="statutoryFilingReportsCsv"
                rows={6}
                defaultValue={formatStatutoryFilingReportsCsv(laborConfig.statutoryPayroll.statutoryFilingReports)}
                aria-describedby="statutory-filing-help"
              />
            </label>
            <p className="muted" id="statutory-filing-help">
              Format: report,authority,payroll item codes. Separate multiple payroll item codes with |. Do not include employee names, salary amounts, national IDs, or bank data.
            </p>
            <ul className="task-list">
              {laborConfig.statutoryPayroll.statutoryFilingReports.map((report) => (
                <li className="task" key={`${report.report}:${report.authority}`}>
                  <span>
                    <strong>{report.report}</strong>
                    <small>{report.authority} · {report.payrollItemCodes.join(", ")}</small>
                  </span>
                  <span className="badge">{report.payrollItemCodes.length} code(s)</span>
                </li>
              ))}
            </ul>
            <button className="button primary" type="submit">
              Save rule settings
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function formatPercentInput(value: number) {
  return Number((value * 100).toFixed(4));
}

function describeGradeCoverage(grades: Array<{ insuredSalary: number; salaryFrom: number; salaryTo: number | null }>) {
  if (grades.length === 0) return "No grade table configured.";
  const sortedGrades = [...grades].sort((a, b) => a.insuredSalary - b.insuredSalary);
  const first = sortedGrades[0];
  const last = sortedGrades.at(-1)!;
  return `${formatMoney(first.insuredSalary)} first insured salary; top configured insured salary ${formatMoney(last.insuredSalary)}.`;
}

function formatSalaryGradesCsv(
  grades: Array<{ level: number; insuredSalary: number; salaryFrom: number; salaryTo: number | null }>,
) {
  return grades
    .map((grade) => [
      grade.level,
      grade.insuredSalary,
      grade.salaryFrom,
      grade.salaryTo ?? "",
    ].join(","))
    .join("\n");
}

function formatTaxBracketsCsv(
  brackets: Array<{
    taxableIncomeFrom: number;
    taxableIncomeTo: number | null;
    rate: number;
    progressiveDifference: number;
  }>,
) {
  return brackets
    .map((bracket) => [
      bracket.taxableIncomeFrom,
      bracket.taxableIncomeTo ?? "",
      Number((bracket.rate * 100).toFixed(4)),
      bracket.progressiveDifference,
    ].join(","))
    .join("\n");
}

function formatAdvanceNoticeTiersCsv(
  tiers: Array<{ serviceMonthsFrom: number; serviceMonthsTo: number | null; noticeDays: number }>,
) {
  return tiers
    .map((tier) => [
      tier.serviceMonthsFrom,
      tier.serviceMonthsTo ?? "",
      tier.noticeDays,
    ].join(","))
    .join("\n");
}

function formatLegalSourcesCsv(
  sources: Array<{ id: string; title: string; url: string; checkedAt: string }>,
) {
  return sources
    .map((source) => [
      source.id,
      source.title,
      source.url,
      source.checkedAt,
    ].map(escapeCsvCell).join(","))
    .join("\n");
}

function formatStatutoryFilingReportsCsv(
  reports: Array<{ report: string; authority: string; payrollItemCodes: string[] }>,
) {
  return reports
    .map((report) => [
      report.report,
      report.authority,
      report.payrollItemCodes.join("|"),
    ].map(escapeCsvCell).join(","))
    .join("\n");
}

function escapeCsvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
