import { getDemoSession } from "@/server/auth/demo-session";
import { getPrivacyWorkspace } from "@/server/privacy/governance";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function EmployeePrivacyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getPrivacyWorkspace(session);
  const currentConsent = workspace.consents.find(
    (consent) => consent.employeeId === session.employee?.id &&
      consent.consentVersion === workspace.settings.consentVersion,
  );

  return (
    <main className="page mobile-page">
      <section className="page-header">
        <h1>Privacy</h1>
        <p>Review your employee data notice and send a personal data request when needed.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update privacy request</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>{workspace.settings.consentTitle}</h2>
              <p className="muted">Version {workspace.settings.consentVersion}</p>
            </div>
            <span className={`badge ${currentConsent ? "" : "warning"}`}>
              {currentConsent ? "Acknowledged" : "Action needed"}
            </span>
          </div>
          <p>{workspace.settings.consentBody}</p>
          <div className="panel-subtle">
            <strong>Purpose</strong>
            <p className="muted">{workspace.settings.collectionPurpose}</p>
            <p className="muted">
              Retention target {workspace.settings.dataRetentionYears} years · data request response target{" "}
              {workspace.settings.dataSubjectRequestResponseDays} days.
            </p>
          </div>
          {currentConsent ? (
            <p className="muted">
              Acknowledged on {currentConsent.acceptedAt.toLocaleDateString("zh-TW")} · hash{" "}
              {currentConsent.policyHash.slice(0, 10)}
            </p>
          ) : (
            <form action="/api/settings/privacy" method="post">
              <input type="hidden" name="intent" value="consent" />
              <button className="button primary" type="submit">
                Acknowledge notice
              </button>
            </form>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Personal data request</h2>
              <p className="muted">Ask HR to review, correct, export, restrict, or evaluate deletion of your data.</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/settings/privacy" method="post" className="mini-form">
            <input type="hidden" name="intent" value="request" />
            <label>
              Request type
              <select name="requestType" defaultValue="access">
                <option value="access">Review my data</option>
                <option value="correction">Correct my data</option>
                <option value="export">Export my data</option>
                <option value="restriction">Restrict processing</option>
                <option value="deletion">Deletion review</option>
              </select>
            </label>
            <label>
              What should HR check?
              <textarea
                name="summary"
                rows={4}
                required
                placeholder="Keep it short. Do not include bank account, national ID, or medical details."
              />
            </label>
            <button className="button primary" type="submit">
              Send request
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Request status</h2>
              <p className="muted">Your privacy requests and HR responses.</p>
            </div>
            <span className="badge">{workspace.requests.length}</span>
          </div>
          <ul className="task-list">
            {workspace.requests.length === 0 ? (
              <li className="task">
                <span>No privacy requests yet.</span>
                <span className="badge">Clear</span>
              </li>
            ) : null}
            {workspace.requests.map((request) => (
              <li className="task" key={request.id}>
                <span>
                  <strong>{request.requestType}</strong>
                  <small>
                    {request.status} · due {request.dueAt.toLocaleDateString("zh-TW")}
                  </small>
                  <small>{request.resolutionNote ?? request.summary}</small>
                </span>
                <span className={`badge ${request.status === "rejected" ? "danger" : ""}`}>
                  {request.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
