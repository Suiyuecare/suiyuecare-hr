import { getPolicyDocuments } from "@/server/ai/policy-docs";
import { getDemoSession } from "@/server/auth/demo-session";

type SearchParams = Promise<{ error?: string }>;

export default async function PolicySourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const docs = await getPolicyDocuments(session);
  const approvedCount = docs.filter((doc) => doc.status === "approved").length;
  const draftCount = docs.filter((doc) => doc.status === "draft").length;
  const inactiveCount = docs.filter((doc) => doc.status === "inactive").length;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Policy Sources</h1>
        <p>Manage approved company policy excerpts that AI Copilot may cite.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to save policy source</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Approved</span>
          <strong>{approvedCount}</strong>
          <span className="badge">AI usable</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Draft</span>
          <strong>{draftCount}</strong>
          <span className={`badge ${draftCount ? "warning" : ""}`}>Needs review</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Inactive</span>
          <strong>{inactiveCount}</strong>
          <span className="badge">Excluded</span>
        </div>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Source wizard</h2>
              <p className="muted">Save short approved excerpts. Do not paste personal data or salary details.</p>
            </div>
          </div>
          <form action="/api/ai/policy-documents" method="post" className="wizard-form">
            <label>
              Title
              <input name="title" placeholder="Annual leave handbook v2" required />
            </label>
            <div className="field-grid">
              <label>
                Category
                <input name="category" placeholder="Leave" required />
              </label>
              <label>
                Version
                <input name="version" placeholder="v2" defaultValue="v1" />
              </label>
              <label>
                Status
                <select name="status" defaultValue="draft">
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label>
                Source reference
                <input name="sourceRef" placeholder="handbook://leave/v2" />
              </label>
            </div>
            <label>
              Keywords
              <input name="keywords" placeholder="leave, annual, 特休" required />
            </label>
            <label>
              Approved excerpt
              <textarea
                name="excerpt"
                placeholder="Use a concise approved excerpt that Copilot can cite."
                required
              />
            </label>
            <button className="button primary" type="submit">
              Save policy source
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>Source library</h2>
              <p className="muted">Only approved sources are available to policy Q&A.</p>
            </div>
            <a className="button" href="/hr/copilot">
              AI Copilot
            </a>
          </div>
          <ul className="task-list">
            {docs.map((doc) => (
              <li className="task request-task" key={doc.id}>
                <span>
                  <strong>{doc.title}</strong>
                  <small>
                    {doc.category} · {doc.version} · {doc.keywords.join(", ")}
                  </small>
                  <small>{doc.excerpt}</small>
                </span>
                <span className={`badge ${doc.status === "draft" ? "warning" : doc.status === "inactive" ? "danger" : ""}`}>
                  {doc.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
