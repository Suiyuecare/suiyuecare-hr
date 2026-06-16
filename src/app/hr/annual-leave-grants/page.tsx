import { getDemoSession } from "@/server/auth/session";
import { getAnnualLeaveGrantWorkspace } from "@/server/leave/annual-leave-grants";

type SearchParams = Promise<{
  asOfDate?: string;
  error?: string;
}>;

export default async function AnnualLeaveGrantsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const asOfDate = parseDate(params.asOfDate) ?? new Date();
  const session = await getDemoSession();
  const workspace = await getAnnualLeaveGrantWorkspace(session, asOfDate);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Annual Leave Grants</h1>
        <p>Review and create yearly annual leave balances using Article 38 entitlement tiers.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to run grant batch</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">As of date</span>
          <strong>{formatDate(workspace.asOfDate)}</strong>
          <span className="badge">Article 38</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Employees reviewed</span>
          <strong>{workspace.rows.length}</strong>
          <span className="badge">Active</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Batch audit events</span>
          <strong>{workspace.auditCount}</strong>
          <span className="badge">Tracked</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Run annual grant batch</h2>
              <p className="muted">Creates current-year entitlement and carries forward prior remaining units.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>
          <form action="/api/leave/annual-grants" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                As of date
                <input name="asOfDate" type="date" defaultValue={formatDateInput(workspace.asOfDate)} required />
              </label>
            </div>
            <button className="button primary" type="submit">
              Create balances
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Grant preview</h2>
              <p className="muted">Carried-over leave will be consumed before current-year leave.</p>
            </div>
          </div>
          <ul className="task-list">
            {workspace.rows.map((row) => (
              <li className="task" key={row.employeeId}>
                <span>
                  <strong>{row.employeeName}</strong>
                  <small>
                    service {row.serviceMonths} months · carryover {row.carryoverUnits} · source {row.sourceIds.join(", ")}
                  </small>
                </span>
                <span className="badge">
                  {row.entitlementUnits} + {row.carryoverUnits} = {row.totalAvailableUnits} day(s)
                </span>
              </li>
            ))}
          </ul>
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

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return formatDateInput(date);
}
