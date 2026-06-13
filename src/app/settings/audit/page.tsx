import { getDemoSession } from "@/server/auth/demo-session";
import { getAuditLogs } from "@/server/audit/queries";
import { getAuditEvidenceWorkspace } from "@/server/audit/evidence-packages";

type SearchParams = Promise<{ error?: string }>;

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const [logs, evidence] = await Promise.all([getAuditLogs(session), getAuditEvidenceWorkspace(session)]);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Audit Logs</h1>
        <p>Sensitive changes are shown as hashes and redacted metadata, not raw private values.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to generate evidence package</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Events</span>
          <strong>{logs.length}</strong>
          <span className="badge">Latest 25</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Sensitive payloads</span>
          <strong>0</strong>
          <span className="badge">Raw values hidden</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Coverage target</span>
          <strong>100%</strong>
          <span className="badge warning">KPI</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Labor inspection evidence package</h2>
              <p className="muted">Generate a redacted summary package with counts, hashes, and coverage gaps.</p>
            </div>
            <span className="badge">{evidence.packages.length} package(s)</span>
          </div>
          <form action="/api/settings/audit-evidence" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                Period start
                <input name="periodStart" type="date" defaultValue={defaultPeriodStart()} />
              </label>
              <label>
                Period end
                <input name="periodEnd" type="date" defaultValue={defaultPeriodEnd()} />
              </label>
            </div>
            <button className="button primary" type="submit">
              Generate evidence package
            </button>
          </form>
        </section>

        {evidence.latest ? (
          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>Latest evidence package</h2>
                <p className="muted">
                  {formatDate(evidence.latest.periodStart)} to {formatDate(evidence.latest.periodEnd)} · hash{" "}
                  {evidence.latest.contentHash.slice(0, 12)}
                </p>
              </div>
              <span className={`badge ${evidence.latest.warnings.length ? "warning" : ""}`}>
                {evidence.latest.recordCount} event(s)
              </span>
            </div>
            {evidence.latest.warnings.length ? (
              <ul className="task-list compact">
                {evidence.latest.warnings.map((warning) => (
                  <li className="task" key={warning}>
                    <span>{warning}</span>
                    <span className="badge warning">Gap</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="task-list">
              {evidence.latest.summaryRows.map((row) => (
                <li className="task" key={row.entityType}>
                  <span>
                    <strong>{row.entityType}</strong>
                    <small>{row.actions.join(", ") || "n/a"}</small>
                  </span>
                  <span className="badge">{row.count}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="panel span-12">
          <h2>Recent events</h2>
          {logs.length === 0 ? (
            <p className="muted">No audit events yet. Update a setting or process a workflow to create one.</p>
          ) : (
            <ul className="task-list">
              {logs.map((log) => (
                <li className="task audit-task" key={log.id}>
                  <span>
                    <strong>
                      {log.action} · {log.entityType}
                    </strong>
                    <small>
                      {log.actorName} · {log.entityId} · {formatDateTime(log.createdAt)}
                    </small>
                    <small>
                      before {shortHash(log.beforeHash)} · after {shortHash(log.afterHash)}
                    </small>
                    <small>{metadataSummary(log.metadata)}</small>
                  </span>
                  <span className="badge">{log.id.slice(0, 8)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function defaultPeriodStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultPeriodEnd() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortHash(value: string | null) {
  return value ? value.slice(0, 10) : "n/a";
}

function metadataSummary(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "No metadata.";
  return entries
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
}
