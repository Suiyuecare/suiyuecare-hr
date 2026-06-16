import { getWorktimeAgreementReadiness, getWorktimeAgreementSettings } from "@/server/attendance/worktime-agreements";
import { getDemoSession } from "@/server/auth/session";

type SearchParams = Promise<{ error?: string }>;

export default async function WorktimeAgreementsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const [settings, readiness] = await Promise.all([
    getWorktimeAgreementSettings(session),
    getWorktimeAgreementReadiness(session),
  ]);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Worktime Agreements</h1>
        <p>Keep overtime agreement evidence, effective dates, and filing status reviewable before monthly close.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to update worktime agreements</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Readiness</span>
          <strong>{readiness.ready ? "Ready" : "Action needed"}</strong>
          <span className={`badge ${readiness.ready ? "" : "danger"}`}>
            {settings.verificationStatus}
          </span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Evidence</span>
          <strong>{settings.approvalOnFile ? "On file" : "Missing"}</strong>
          <span className={`badge ${settings.evidenceRef ? "" : "warning"}`}>
            {settings.evidenceRef ? "Reference saved" : "No reference"}
          </span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Effective period</span>
          <strong>{formatPeriod(settings.effectiveFrom, settings.effectiveTo)}</strong>
          <span className="badge">{minutesToHours(settings.monthlyOvertimeLimitMinutes)}h / month</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Agreement wizard</h2>
              <p className="muted">
                Configure the evidence HR relies on before extended overtime limits are used.
              </p>
            </div>
            <a className="button" href="/hr/worktime-compliance">
              Worktime compliance
            </a>
          </div>

          <form className="wizard-form" action="/api/attendance/worktime-agreements" method="post">
            <div className="field-grid">
              <label>
                Approval type
                <select name="approvalType" defaultValue={settings.approvalType}>
                  <option value="labor_management_conference">Labor-management conference</option>
                  <option value="labor_union">Labor union</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Verification status
                <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label>
                Evidence reference
                <input
                  name="evidenceRef"
                  placeholder="meeting://2026-06"
                  defaultValue={settings.evidenceRef ?? ""}
                />
              </label>
              <label>
                Effective from
                <input name="effectiveFrom" type="date" defaultValue={formatDateInput(settings.effectiveFrom)} />
              </label>
              <label>
                Effective to
                <input name="effectiveTo" type="date" defaultValue={formatDateInput(settings.effectiveTo)} />
              </label>
              <label>
                Monthly overtime limit hours
                <input
                  name="monthlyOvertimeLimitHours"
                  type="number"
                  min="1"
                  step="0.5"
                  defaultValue={minutesToHours(settings.monthlyOvertimeLimitMinutes)}
                />
              </label>
              <label>
                Three-month overtime limit hours
                <input
                  name="threeMonthOvertimeLimitHours"
                  type="number"
                  min="1"
                  step="0.5"
                  defaultValue={minutesToHours(settings.threeMonthOvertimeLimitMinutes)}
                />
              </label>
            </div>

            <div className="toggle-row">
              <label>
                <input name="approvalOnFile" type="checkbox" defaultChecked={settings.approvalOnFile} />
                Approval evidence is on file
              </label>
              <label>
                <input
                  name="localAuthorityReportRequired"
                  type="checkbox"
                  defaultChecked={settings.localAuthorityReportRequired}
                />
                Local authority filing is required
              </label>
              <label>
                <input
                  name="localAuthorityReportFiled"
                  type="checkbox"
                  defaultChecked={settings.localAuthorityReportFiled}
                />
                Local authority filing is completed
              </label>
            </div>

            <label>
              Verification note
              <textarea
                name="verificationNote"
                placeholder="Keep notes concise and avoid personal data."
                defaultValue={settings.verificationNote ?? ""}
              />
            </label>

            <button className="button primary" type="submit">
              Save worktime agreement
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Readiness detail</h2>
          <p className="muted">{readiness.detail}</p>
          {readiness.missing.length ? (
            <ul className="task-list compact">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge danger">Required</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function formatDateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function formatPeriod(from: Date | null, to: Date | null) {
  if (!from || !to) return "Not set";
  return `${formatDateInput(from)} to ${formatDateInput(to)}`;
}

function minutesToHours(value: number) {
  return Number.isInteger(value / 60) ? String(value / 60) : (value / 60).toFixed(1);
}
