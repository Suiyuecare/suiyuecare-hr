import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import {
  canUseSupportAccess,
  listSupportAccessGrants,
  supportAccessScopes,
} from "@/server/support/access";

type SearchParams = Promise<{ error?: string }>;

export default async function SupportAccessPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const grants = await listSupportAccessGrants(session);
  const now = new Date();
  const activeCount = grants.filter((grant) =>
    grant.status === "approved" && grant.expiresAt > now
  ).length;
  const expiredCount = grants.filter((grant) =>
    grant.status === "approved" && grant.expiresAt <= now
  ).length;
  const revokedCount = grants.filter((grant) => grant.status === "revoked").length;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Support Access</h1>
        <p>Approve customer support access with a ticket, scope, expiry, and audit trail.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to update support access</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Active grants</span>
          <strong>{activeCount}</strong>
          <span className="badge">Owner approved</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Expired still approved</span>
          <strong>{expiredCount}</strong>
          <span className={`badge ${expiredCount > 0 ? "danger" : ""}`}>Gate checked</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Revoked</span>
          <strong>{revokedCount}</strong>
          <span className="badge">Audit retained</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Approve support access</h2>
              <p className="muted">
                Keep grants short-lived and scoped to the customer-approved task. Raw payroll and personal data stay restricted.
              </p>
            </div>
            <span className="badge">72 hour max</span>
          </div>
          <form action="/api/settings/support-access" method="post" className="mini-form">
            <input type="hidden" name="action" value="approve" />
            <div className="field-grid">
              <label>
                Support email
                <input name="supportPrincipalEmail" type="email" placeholder="support@hrone.example" required />
              </label>
              <label>
                Support name
                <input name="supportPrincipalName" placeholder="Support engineer" />
              </label>
              <label>
                Ticket ID
                <input name="ticketId" placeholder="INC-2026-0001" required />
              </label>
              <label>
                Expires at
                <input name="expiresAt" type="datetime-local" required />
              </label>
              <label>
                Data access
                <select name="dataAccessLevel" defaultValue="metadata_only">
                  <option value="metadata_only">Metadata only</option>
                  <option value="customer_approved_records">Customer-approved records</option>
                </select>
              </label>
            </div>
            <fieldset className="fieldset">
              <legend>Scope</legend>
              <div className="toggle-row">
                {supportAccessScopes.map((scope) => (
                  <label className="check-row" key={scope}>
                    <input name="scopes" type="checkbox" value={scope} defaultChecked={scope === "technical_support"} />
                    {scope.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Reason
              <textarea
                name="reason"
                placeholder="Customer approved investigation for ticket INC-2026-0001"
                required
              />
            </label>
            <button className="button primary" type="submit">
              Approve access
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Support access history</h2>
              <p className="muted">Production verification blocks unapproved active access and expired grants still marked approved.</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          {grants.length === 0 ? (
            <EmptyState title="No support access grants" body="Approve temporary access only when a customer support ticket needs it." />
          ) : (
            <ul className="task-list">
              {grants.map((grant) => {
                const activeScopes = grant.scopes.filter((scope) => canUseSupportAccess(grant, scope, now));
                const expired = grant.status === "approved" && grant.expiresAt <= now;
                return (
                  <li className="task request-task" key={grant.id}>
                    <span>
                      <strong>{grant.supportPrincipalName || grant.supportPrincipalEmail}</strong>
                      <small>{grant.supportPrincipalEmail}</small>
                      <small>
                        {grant.ticketId} · {grant.dataAccessLevel.replaceAll("_", " ")}
                      </small>
                      <small>
                        scopes {grant.scopes.map((scope) => scope.replaceAll("_", " ")).join(", ")}
                      </small>
                      <small>
                        expires {formatDate(grant.expiresAt)} · approved {formatDate(grant.approvedAt)}
                      </small>
                    </span>
                    <div className="stacked-actions">
                      <span className={`badge ${grant.status === "revoked" || expired ? "danger" : ""}`}>
                        {grant.status === "revoked" ? "revoked" : expired ? "expired" : "active"}
                      </span>
                      {activeScopes.length > 0 ? (
                        <span className="badge">{activeScopes.length} usable scope(s)</span>
                      ) : null}
                    </div>
                    {grant.status === "approved" && !expired ? (
                      <form action="/api/settings/support-access" method="post" className="mini-form compact-form">
                        <input type="hidden" name="action" value="revoke" />
                        <input type="hidden" name="grantId" value={grant.id} />
                        <label>
                          Revoke reason
                          <input name="revokeReason" placeholder="Support work completed" required />
                        </label>
                        <button className="button" type="submit">
                          Revoke access
                        </button>
                      </form>
                    ) : grant.revokeReason ? (
                      <small>Revoked because {grant.revokeReason}</small>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(value);
}
