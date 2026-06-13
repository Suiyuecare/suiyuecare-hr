import { getDemoSession } from "@/server/auth/demo-session";
import { getAnnualLeaveExpiryWorkspace } from "@/server/leave/annual-leave-expiry";

type SearchParams = Promise<{
  asOfDate?: string;
  warningDays?: string;
  error?: string;
}>;

export default async function AnnualLeaveExpiryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const asOfDate = parseDate(params.asOfDate) ?? new Date();
  const warningDays = parseInteger(params.warningDays) ?? 60;
  const session = await getDemoSession();
  const workspace = await getAnnualLeaveExpiryWorkspace(session, { asOfDate, warningDays });
  const warningCount = workspace.risks.filter((risk) => risk.severity !== "normal").length;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Annual Leave Expiry</h1>
        <p>Find employees who should use or settle annual leave before year end.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to send reminders</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Risk count</span>
          <strong>{warningCount}</strong>
          <span className={`badge ${warningCount ? "warning" : ""}`}>Needs action</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">As of date</span>
          <strong>{formatDate(workspace.asOfDate)}</strong>
          <span className="badge">{workspace.warningDays} days</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Reminder audit events</span>
          <strong>{workspace.auditCount}</strong>
          <span className="badge">Tracked</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Reminder scan</h2>
              <p className="muted">Reminders are sent only after HR review.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>
          <form action="/api/leave/annual-expiry/remind" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                As of date
                <input name="asOfDate" type="date" defaultValue={formatDate(workspace.asOfDate)} required />
              </label>
              <label>
                Warning days
                <input name="warningDays" type="number" min="1" step="1" defaultValue={workspace.warningDays} required />
              </label>
            </div>
            <button className="button primary" type="submit">
              Send reminders
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Expiry risks</h2>
              <p className="muted">Carried-over days should be used first or settled during close.</p>
            </div>
          </div>
          {workspace.risks.length === 0 ? (
            <p className="muted">No annual leave expiry risks.</p>
          ) : (
            <ul className="task-list">
              {workspace.risks.map((risk) => (
                <li className="task" key={risk.employeeId}>
                  <span>
                    <strong>{risk.employeeName}</strong>
                    <small>
                      {risk.remainingUnits} remaining · {risk.carryoverRemainingUnits} carried over · expires {formatDate(risk.expiryDate)}
                    </small>
                  </span>
                  <span className={`badge ${risk.severity === "warning" ? "warning" : risk.severity === "overdue" ? "danger" : ""}`}>
                    {risk.daysUntilExpiry} day(s) · {risk.severity}
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

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInteger(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
