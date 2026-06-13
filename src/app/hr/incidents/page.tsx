import { getDemoSession } from "@/server/auth/demo-session";
import { getIncidentWorkspace } from "@/server/incidents/workplace";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function HrIncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getIncidentWorkspace(session);
  const { settings, readiness } = workspace;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Workplace Incidents</h1>
        <p>Track safety hazards, occupational accidents, harassment reports, investigations, and authority follow-up.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update incident center</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Readiness</span>
          <strong>{readiness.ready ? "Ready" : "Open"}</strong>
          <span className={`badge ${readiness.ready ? "" : "warning"}`}>{settings.verificationStatus}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Open incidents</span>
          <strong>{readiness.openIncidentCount}</strong>
          <span className="badge">active</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Investigations</span>
          <strong>{readiness.overdueInvestigationCount}</strong>
          <span className={`badge ${readiness.overdueInvestigationCount > 0 ? "danger" : ""}`}>overdue</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Authority reports</span>
          <strong>{readiness.overdueAuthorityReportCount}</strong>
          <span className={`badge ${readiness.overdueAuthorityReportCount > 0 ? "danger" : ""}`}>overdue</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Incident readiness</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <span className={`badge ${readiness.ready ? "" : "warning"}`}>{readiness.ready ? "Complete" : "Needs review"}</span>
          </div>
          {readiness.missing.length > 0 ? (
            <ul className="task-list">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge warning">Open</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Incident reporting and response controls are reviewed and within target.</p>
          )}
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Response controls</h2>
              <p className="muted">Keep severe incident notification at 8 hours or less and investigations time-boxed.</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/incidents" method="post" className="mini-form">
            <input type="hidden" name="intent" value="settings" />
            <label className="check-row">
              <input name="reportingEnabled" type="checkbox" defaultChecked={settings.reportingEnabled} />
              Enable employee reporting
            </label>
            <label className="check-row">
              <input name="anonymousReportingEnabled" type="checkbox" defaultChecked={settings.anonymousReportingEnabled} />
              Allow anonymous placeholder
            </label>
            <label className="check-row">
              <input name="authorityReportRequired" type="checkbox" defaultChecked={settings.authorityReportRequired} />
              Require authority-report tracking
            </label>
            <div className="field-grid">
              <label>
                Severe notify hours
                <input name="severeIncidentNotifyHours" type="number" min="1" max="24" defaultValue={settings.severeIncidentNotifyHours} />
              </label>
              <label>
                Investigation target days
                <input name="investigationTargetDays" type="number" min="1" max="30" defaultValue={settings.investigationTargetDays} />
              </label>
              <label>
                Harassment policy version
                <input name="harassmentPolicyVersion" defaultValue={settings.harassmentPolicyVersion} />
              </label>
              <label>
                Safety policy version
                <input name="safetyPolicyVersion" defaultValue={settings.safetyPolicyVersion} />
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
                Last reviewed
                <input value={settings.lastReviewedAt?.toISOString() ?? "Not reviewed"} readOnly />
              </label>
            </div>
            <button className="button primary" type="submit">
              Save incident controls
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>Incident queue</h2>
              <p className="muted">Use status and corrective action to keep investigations moving without exposing raw details in audit logs.</p>
            </div>
            <span className="badge">{workspace.incidents.length}</span>
          </div>
          <ul className="task-list">
            {workspace.incidents.length === 0 ? (
              <li className="task">
                <span>No workplace incidents reported.</span>
                <span className="badge">Clear</span>
              </li>
            ) : null}
            {workspace.incidents.map((incident) => (
              <li className="task" key={incident.id}>
                <span>
                  <strong>
                    {incident.reporterName} · {labelType(incident.incidentType)}
                  </strong>
                  <small>
                    {incident.severity} · {incident.status} · investigation due {incident.investigationDueAt.toLocaleDateString("zh-TW")}
                  </small>
                  <small>{incident.confidential ? "Confidential" : "Standard"} · {incident.summary}</small>
                </span>
                <form action="/api/incidents" method="post" className="inline-actions">
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <select name="status" defaultValue={incident.status} aria-label={`Status for ${incident.reporterName}`}>
                    <option value="in_review">In review</option>
                    <option value="authority_reported">Authority reported</option>
                    <option value="corrective_action">Corrective action</option>
                    <option value="closed">Closed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <label className="check-row compact-check">
                    <input name="authorityReported" type="checkbox" defaultChecked={Boolean(incident.authorityReportedAt)} />
                    Reported
                  </label>
                  <input name="correctiveAction" placeholder="Corrective action" aria-label={`Corrective action for ${incident.reporterName}`} />
                  <button className="button" type="submit">
                    Update
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function labelType(type: string) {
  return type.replaceAll("_", " ");
}
