import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getNotificationAdminWorkspace } from "@/server/notifications/service";

type SearchParams = Promise<{ error?: string }>;

const channelToggles = [
  ["inAppEnabled", "In-app"],
  ["emailEnabled", "Email"],
  ["lineEnabled", "LINE"],
  ["slackEnabled", "Slack"],
  ["teamsEnabled", "Teams"],
] as const;

const eventToggles = [
  ["approvalSubmittedEnabled", "Approval submitted"],
  ["approvalDecisionEnabled", "Approval decision"],
  ["payrollReleasedEnabled", "Payroll released"],
  ["systemAlertEnabled", "System alert"],
] as const;

export default async function NotificationSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getNotificationAdminWorkspace(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Notifications</h1>
        <p>Configure delivery channels and review delivery metadata without exposing sensitive message bodies.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to update notifications</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Channels enabled</span>
          <strong>{enabledChannelCount(workspace.settings)}</strong>
          <span className="badge">Policy</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">External payload</span>
          <strong>{workspace.settings.externalSummaryOnly ? "Summary" : "Full"}</strong>
          <span className={`badge ${workspace.settings.externalSummaryOnly ? "" : "warning"}`}>Sensitive guard</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Delivery records</span>
          <strong>{workspace.deliveries.length}</strong>
          <span className="badge">Hashed</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Channel setup</h2>
              <p className="muted">Provider credentials stay outside HR One. External delivery stores hashes and status only.</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/settings/notifications" method="post" className="mini-form">
            <div className="toggle-row">
              {channelToggles.map(([name, label]) => (
                <label className="check-row" key={name}>
                  <input name={name} type="checkbox" defaultChecked={workspace.settings[name]} />
                  {label}
                </label>
              ))}
            </div>
            <label className="check-row">
              <input name="externalSummaryOnly" type="checkbox" defaultChecked={workspace.settings.externalSummaryOnly} />
              External channels receive summary only
            </label>
            <div className="toggle-row">
              {eventToggles.map(([name, label]) => (
                <label className="check-row" key={name}>
                  <input name={name} type="checkbox" defaultChecked={workspace.settings[name]} />
                  {label}
                </label>
              ))}
            </div>
            <button className="button primary" type="submit">
              Save notification settings
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Recent deliveries</h2>
          {workspace.deliveries.length === 0 ? (
            <EmptyState title="No delivery records" body="Delivery metadata appears after workflow notifications are created." />
          ) : (
            <ul className="task-list">
              {workspace.deliveries.map((delivery) => (
                <li className="task" key={delivery.id}>
                  <span>
                    <strong>{delivery.channel} · {delivery.status}</strong>
                    <small>payload {delivery.payloadHash.slice(0, 12)} · destination {delivery.destinationHash?.slice(0, 12) ?? "n/a"}</small>
                    {delivery.errorCode ? <small className="warning-text">{delivery.errorCode}</small> : null}
                  </span>
                  <span className={`badge ${delivery.status === "failed" ? "danger" : delivery.status === "skipped" ? "warning" : ""}`}>
                    {delivery.status}
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

function enabledChannelCount(settings: Awaited<ReturnType<typeof getNotificationAdminWorkspace>>["settings"]) {
  return channelToggles.filter(([name]) => settings[name]).length;
}
