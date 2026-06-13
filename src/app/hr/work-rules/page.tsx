import { getDemoSession } from "@/server/auth/demo-session";
import { getWorkRulesWorkspace } from "@/server/work-rules/service";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function WorkRulesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getWorkRulesWorkspace(session);
  const { readiness } = workspace;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Work Rules</h1>
        <p>Publish company work rules or an employee handbook, then track employee acknowledgement evidence.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update work rules</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Readiness</span>
          <strong>{readiness.ready ? "Ready" : "Open"}</strong>
          <span className={`badge ${readiness.ready ? "" : "warning"}`}>Compliance</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Active rules</span>
          <strong>{readiness.activeRequiredCount}</strong>
          <span className="badge">Required</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Acknowledgements</span>
          <strong>{readiness.acknowledgedCount}</strong>
          <span className="badge">of {readiness.requiredAcknowledgementCount}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Pending review</span>
          <strong>{readiness.pendingReviewCount}</strong>
          <span className={`badge ${readiness.pendingReviewCount ? "danger" : ""}`}>HR/legal</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Readiness</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <span className="badge">Audited</span>
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
            <p className="muted">Work rules are approved, active, and acknowledged by active employees.</p>
          )}
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Rule wizard</h2>
              <p className="muted">Keep the source file outside audit logs. HR One stores only a content hash.</p>
            </div>
            <span className="badge">No code</span>
          </div>
          <form action="/api/work-rules" method="post" className="mini-form">
            <input type="hidden" name="intent" value="save" />
            <div className="field-grid">
              <label>
                Title
                <input name="title" defaultValue="Employee handbook and work rules" required />
              </label>
              <label>
                Category
                <input name="category" defaultValue="Company rules" required />
              </label>
              <label>
                Version
                <input name="version" defaultValue="2026.01" required />
              </label>
              <label>
                Effective from
                <input name="effectiveFrom" type="date" defaultValue={today} required />
              </label>
              <label>
                Status
                <select name="status" defaultValue="active">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
              <label>
                Review status
                <select name="reviewStatus" defaultValue="approved">
                  <option value="pending_review">Pending review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
            </div>
            <label>
              Source reference
              <input name="sourceRef" defaultValue="demo://work-rules/employee-handbook-2026" />
            </label>
            <label>
              Summary
              <textarea
                name="summary"
                rows={4}
                defaultValue="Covers attendance, leave, overtime approval, payroll close evidence, information security, and respectful workplace expectations."
                required
              />
            </label>
            <label>
              Source content for hash
              <textarea
                name="content"
                rows={4}
                defaultValue="Employee handbook and work rules 2026.01"
                required
              />
            </label>
            <label className="check-row">
              <input name="acknowledgementRequired" type="checkbox" defaultChecked />
              Require employee acknowledgement
            </label>
            <button className="button primary" type="submit">
              Save work rule
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>Published rules</h2>
              <p className="muted">Employees only see active rules that require acknowledgement.</p>
            </div>
            <span className="badge">{workspace.rules.length}</span>
          </div>
          <ul className="task-list">
            {workspace.rules.map((rule) => (
              <li className="task" key={rule.id}>
                <span>
                  <strong>{rule.title}</strong>
                  <small>
                    {rule.category} · {rule.version} · effective {rule.effectiveFrom.toLocaleDateString("zh-TW")}
                  </small>
                  <small>{rule.summary}</small>
                  <small>Hash {rule.contentHash.slice(0, 12)}</small>
                </span>
                <span className={`badge ${rule.reviewStatus === "approved" && rule.status === "active" ? "" : "warning"}`}>
                  {rule.status} · {rule.reviewStatus}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Acknowledgement evidence</h2>
              <p className="muted">Audit records store hashes and references, not raw policy content.</p>
            </div>
            <span className="badge">{workspace.acknowledgements.length}</span>
          </div>
          <ul className="task-list">
            {workspace.acknowledgements.length === 0 ? (
              <li className="task">
                <span>No acknowledgements yet.</span>
                <span className="badge warning">Open</span>
              </li>
            ) : null}
            {workspace.acknowledgements.map((acknowledgement) => (
              <li className="task" key={acknowledgement.id}>
                <span>
                  <strong>{acknowledgement.employeeName}</strong>
                  <small>
                    {acknowledgement.workRuleTitle} · {acknowledgement.version} ·{" "}
                    {acknowledgement.acknowledgedAt.toLocaleDateString("zh-TW")}
                  </small>
                  <small>Hash {acknowledgement.acknowledgementHash.slice(0, 12)}</small>
                </span>
                <span className="badge">{acknowledgement.source}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
