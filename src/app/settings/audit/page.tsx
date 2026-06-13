import { getDemoSession } from "@/server/auth/demo-session";
import { getAuditLogs } from "@/server/audit/queries";

export default async function AuditLogPage() {
  const session = await getDemoSession();
  const logs = await getAuditLogs(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Audit Logs</h1>
        <p>Sensitive changes are shown as hashes and redacted metadata, not raw private values.</p>
      </section>

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
