import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getLeavePolicySettings } from "@/server/leave/policies";
import { evaluateTaiwanStatutoryLeavePolicyCoverage } from "@/server/leave/statutory";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function LeavePoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const policies = await getLeavePolicySettings(session);
  const coverage = evaluateTaiwanStatutoryLeavePolicyCoverage(policies);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Leave Policies</h1>
        <p>Configure leave types, accrual behavior, documentation, and employee balances without engineering support.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to save leave policy</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Active policies</span>
          <strong>{policies.filter((policy) => policy.status === "active").length}</strong>
          <span className="badge">Configurable</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Attachment rules</span>
          <strong>{policies.filter((policy) => policy.attachmentRequired).length}</strong>
          <span className="badge warning">Evidence</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Balance coverage</span>
          <strong>{policies.reduce((total, policy) => total + policy.balanceCount, 0)}</strong>
          <span className="badge">Employees</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Legal review needed</span>
          <strong>{policies.filter((policy) => policy.requiresLegalReview).length}</strong>
          <span className="badge warning">Before rollout</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Taiwan statutory leave coverage</h2>
              <p className="muted">{coverage.detail}</p>
            </div>
            <span className={`badge ${coverage.ready ? "" : "warning"}`}>
              {coverage.ready ? "Ready" : "Action needed"}
            </span>
          </div>
          {coverage.missing.length > 0 || coverage.needsReview.length > 0 ? (
            <ul className="task-list">
              {coverage.missing.map((requirement) => (
                <li className="task" key={`missing-${requirement.category}`}>
                  <span>
                    <strong>{requirement.name}</strong>
                    <small>{requirement.note}</small>
                  </span>
                  <span className="badge warning">Missing · {requirement.recommendedCode}</span>
                </li>
              ))}
              {coverage.needsReview.map((requirement) => (
                <li className="task" key={`review-${requirement.category}`}>
                  <span>
                    <strong>{requirement.name}</strong>
                    <small>{requirement.policyName} needs HR/legal approval before rollout.</small>
                  </span>
                  <span className="badge warning">Review · {requirement.policyCode}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">All required Taiwan statutory leave categories have active approved policies.</p>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Policy wizard</h2>
              <p className="muted">Use a new code to create a policy, or reuse an existing code to update it.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <form action="/api/leave/policies" method="post" className="wizard-form">
            <div className="section-heading compact-heading">
              <div>
                <h3>1. Basic leave type</h3>
              </div>
              <span className="badge">Required</span>
            </div>
            <div className="field-grid">
              <label>
                Code
                <input name="code" defaultValue="personal" required />
              </label>
              <label>
                Name
                <input name="name" defaultValue="Personal leave" required />
              </label>
              <label>
                Status
                <select name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label>
                Unit
                <select name="unit" defaultValue="day">
                  <option value="day">Day</option>
                  <option value="hour">Hour</option>
                </select>
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>2. Balance rules</h3>
              </div>
              <span className="badge">Version safely</span>
            </div>
            <div className="field-grid">
              <label>
                Annual units
                <input name="annualUnits" type="number" min="0" step="0.5" defaultValue="14" required />
              </label>
              <label>
                Accrual method
                <select name="accrualMethod" defaultValue="annual_grant">
                  <option value="annual_grant">Annual grant</option>
                  <option value="monthly_accrual">Monthly accrual</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label>
                Minimum notice days
                <input name="minNoticeDays" type="number" min="0" step="1" defaultValue="0" />
              </label>
              <label>
                Carryover limit
                <input name="carryoverLimitUnits" type="number" min="0" step="0.5" placeholder="No limit" />
              </label>
            </div>

            <div className="toggle-row">
              <label>
                <input name="paid" type="checkbox" defaultChecked />
                Paid leave
              </label>
              <label>
                <input name="attachmentRequired" type="checkbox" />
                Attachment required
              </label>
              <label>
                <input name="syncBalancesOnUpdate" type="checkbox" defaultChecked />
                Create missing employee balances
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>3. Compliance and eligibility</h3>
              </div>
              <span className="badge warning">HR review</span>
            </div>
            <div className="field-grid">
              <label>
                Statutory category
                <select name="statutoryCategory" defaultValue="personal_leave">
                  <option value="company">Company policy</option>
                  <option value="annual_leave">Annual leave</option>
                  <option value="sick_leave">Sick leave</option>
                  <option value="personal_leave">Personal leave</option>
                  <option value="family_care">Family care</option>
                  <option value="menstrual">Menstrual leave</option>
                  <option value="parental">Parental</option>
                  <option value="maternity">Maternity</option>
                  <option value="paternity">Paternity/checkup accompaniment</option>
                  <option value="bereavement">Bereavement</option>
                  <option value="marriage">Marriage</option>
                  <option value="official">Official duty</option>
                  <option value="occupational_injury">Occupational injury/sickness</option>
                </select>
              </label>
              <label>
                Eligibility rule
                <select name="eligibilityRule" defaultValue="all_employees">
                  <option value="all_employees">All employees</option>
                  <option value="employee_self">Employee self</option>
                  <option value="caregiver">Caregiver</option>
                  <option value="parent">Parent</option>
                  <option value="pregnancy_related">Pregnancy related</option>
                  <option value="manual_review">Manual HR review</option>
                </select>
              </label>
              <label>
                Pay rate percent
                <input name="payRatePercent" type="number" min="0" max="100" step="0.01" defaultValue="100" />
              </label>
              <label>
                Annual limit note
                <input name="annualLimitNote" placeholder="Policy source, legal note, or company cap" />
              </label>
            </div>
            <label className="check-row">
              <input name="requiresLegalReview" type="checkbox" defaultChecked />
              Require legal/HR review before rollout
            </label>

            <button className="button primary" type="submit">
              Save policy
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Configured policies</h2>
          {policies.length === 0 ? (
            <EmptyState title="No leave policies" body="Create the first policy before employees submit leave." />
          ) : (
            <ul className="task-list">
              {policies.map((policy) => (
                <li className="task" key={policy.id}>
                  <span>
                    <strong>
                      {policy.name} · {policy.code}
                    </strong>
                    <small>
                      {policy.annualUnits} {policy.unit}(s) · {policy.accrualMethod} · pay {policy.payRatePercent}% · {policy.eligibilityRule}
                    </small>
                    {policy.annualLimitNote ? <small>{policy.annualLimitNote}</small> : null}
                  </span>
                  <span className={`badge ${policy.status === "inactive" || policy.requiresLegalReview ? "warning" : ""}`}>
                    {policy.status} · {policy.statutoryCategory} · {policy.balanceCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
