import { getDemoSession } from "@/server/auth/demo-session";
import { getPrivacyWorkspace } from "@/server/privacy/governance";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function PrivacySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getPrivacyWorkspace(session);
  const { settings, readiness } = workspace;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Privacy Center</h1>
        <p>Manage employee personal data notices, acknowledgements, request handling, and retention controls.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update privacy controls</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Readiness</span>
          <strong>{readiness.ready ? "Ready" : "Open"}</strong>
          <span className={`badge ${readiness.ready ? "" : "warning"}`}>{settings.verificationStatus}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Acknowledgements</span>
          <strong>
            {readiness.acknowledgedCount}/{readiness.requiredEmployeeCount}
          </strong>
          <span className="badge">{settings.consentVersion}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Open requests</span>
          <strong>{readiness.openRequestCount}</strong>
          <span className={`badge ${readiness.overdueRequestCount > 0 ? "danger" : ""}`}>
            {readiness.overdueRequestCount} overdue
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Retention</span>
          <strong>{settings.dataRetentionYears}y</strong>
          <span className="badge">HR records</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Privacy readiness</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <span className={`badge ${readiness.ready ? "" : "warning"}`}>
              {readiness.ready ? "Complete" : "Needs review"}
            </span>
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
            <p className="muted">Privacy controls are reviewed, acknowledged, and request handling is within target.</p>
          )}
        </section>

        <section className="panel span-12" id="privacy-setup">
          <div className="section-heading">
            <div>
              <h2>Employee privacy notice</h2>
              <p className="muted">Keep this plain. It is what employees acknowledge from the mobile self-service page.</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/settings/privacy" method="post" className="mini-form">
            <input type="hidden" name="intent" value="settings" />
            <div className="field-grid">
              <label>
                Notice version
                <input name="consentVersion" defaultValue={settings.consentVersion} required />
              </label>
              <label>
                Notice title
                <input name="consentTitle" defaultValue={settings.consentTitle} required />
              </label>
              <label>
                Retention years
                <input name="dataRetentionYears" type="number" min="5" max="30" defaultValue={settings.dataRetentionYears} />
              </label>
              <label>
                Request response days
                <input
                  name="dataSubjectRequestResponseDays"
                  type="number"
                  min="1"
                  max="30"
                  defaultValue={settings.dataSubjectRequestResponseDays}
                />
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
            <label>
              Collection purpose
              <textarea name="collectionPurpose" rows={3} defaultValue={settings.collectionPurpose} required />
            </label>
            <label>
              Employee-facing notice
              <textarea name="consentBody" rows={5} defaultValue={settings.consentBody} required />
            </label>
            <div className="toggle-row">
              <label className="check-row">
                <input
                  name="requiresEmployeeAcknowledgement"
                  type="checkbox"
                  defaultChecked={settings.requiresEmployeeAcknowledgement}
                />
                Require employee acknowledgement
              </label>
              <label className="check-row">
                <input name="deletionReviewRequired" type="checkbox" defaultChecked={settings.deletionReviewRequired} />
                Human review before deletion
              </label>
              <label className="check-row">
                <input
                  name="crossBorderTransferEnabled"
                  type="checkbox"
                  defaultChecked={settings.crossBorderTransferEnabled}
                />
                Cross-border transfer enabled
              </label>
            </div>
            <label>
              Approved subprocessors
              <textarea
                name="subprocessors"
                rows={3}
                defaultValue={settings.subprocessors.join("\n")}
                placeholder="One vendor per line. Do not paste credentials."
              />
            </label>
            <button className="button primary" type="submit">
              Save privacy controls
            </button>
          </form>
        </section>

        <section className="panel span-6">
          <div className="section-heading">
            <div>
              <h2>Employee acknowledgements</h2>
              <p className="muted">Current and historical notice acknowledgements.</p>
            </div>
            <span className="badge">{workspace.consents.length}</span>
          </div>
          <ul className="task-list">
            {workspace.consents.map((consent) => (
              <li className="task" key={consent.id}>
                <span>
                  <strong>{consent.employeeName}</strong>
                  <small>
                    {consent.consentVersion} · {consent.acceptedAt.toLocaleDateString("zh-TW")} · hash {consent.policyHash.slice(0, 10)}
                  </small>
                </span>
                <span className="badge">{consent.source}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="section-heading">
            <div>
              <h2>Personal data requests</h2>
              <p className="muted">Track access, correction, export, restriction, and deletion review requests.</p>
            </div>
            <span className="badge">{workspace.requests.length}</span>
          </div>
          <ul className="task-list">
            {workspace.requests.length === 0 ? (
              <li className="task">
                <span>No open personal data requests.</span>
                <span className="badge">Clear</span>
              </li>
            ) : null}
            {workspace.requests.map((request) => (
              <li className="task" key={request.id}>
                <span>
                  <strong>
                    {request.employeeName} · {request.requestType}
                  </strong>
                  <small>
                    {request.status} · due {request.dueAt.toLocaleDateString("zh-TW")}
                  </small>
                  <small>{request.summary}</small>
                </span>
                {request.status === "submitted" || request.status === "in_review" ? (
                  <form action="/api/settings/privacy" method="post" className="inline-actions">
                    <input type="hidden" name="intent" value="resolve_request" />
                    <input type="hidden" name="requestId" value={request.id} />
                    <select name="status" defaultValue="in_review" aria-label={`Status for ${request.employeeName}`}>
                      <option value="in_review">In review</option>
                      <option value="fulfilled">Fulfilled</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <input name="resolutionNote" placeholder="Resolution note" aria-label={`Resolution for ${request.employeeName}`} />
                    <button className="button" type="submit">
                      Update
                    </button>
                  </form>
                ) : (
                  <span className="badge">{request.status}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
