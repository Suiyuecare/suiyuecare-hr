import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getAnnualLeaveSettlementWorkspace } from "@/server/leave/annual-leave-settlements";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function AnnualLeaveSettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getAnnualLeaveSettlementWorkspace(session);

  if (!workspace.payrollRun) {
    return (
      <main className="page">
        <EmptyState
          title="No payroll run yet"
          body="Create a payroll run before preparing unused annual leave settlements."
        />
      </main>
    );
  }

  const canPrepare = workspace.payrollRun.status !== "locked" && workspace.payrollRun.status !== "released";
  const draftCount = workspace.settlements.filter((settlement) => settlement.status === "draft").length;
  const includedCount = workspace.settlements.filter((settlement) => settlement.status === "included").length;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Annual Leave Settlement</h1>
        <p>Prepare HR-reviewed unused annual leave payout drafts before payroll calculation.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to prepare settlements</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Payroll period</span>
          <strong>{workspace.payrollRun.periodLabel}</strong>
          <span className="badge">{workspace.payrollRun.status}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Draft settlements</span>
          <strong>{draftCount}</strong>
          <span className={`badge ${draftCount ? "warning" : ""}`}>Before calculation</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Included in payroll</span>
          <strong>{includedCount}</strong>
          <span className="badge">Audited</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Prepare settlement draft</h2>
              <p className="muted">
                Uses Article 38 and Enforcement Rule 24-1. Payroll values are kept out of audit metadata.
              </p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>
          <form action="/api/leave/annual-settlements" method="post" className="mini-form">
            <input type="hidden" name="payrollRunId" value={workspace.payrollRun.id} />
            <div className="field-grid">
              <label>
                Settlement reason
                <select name="reason" defaultValue="year_end">
                  <option value="year_end">Year-end unused leave</option>
                  <option value="contract_termination">Contract termination</option>
                </select>
              </label>
            </div>
            <button className="button primary" type="submit" disabled={!canPrepare}>
              Prepare settlements
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Settlement review</h2>
              <p className="muted">HR should review these items before calculating or locking payroll.</p>
            </div>
            <span className="badge">{workspace.auditCount} audit events</span>
          </div>
          {workspace.settlements.length === 0 ? (
            <p className="muted">No settlement drafts prepared yet.</p>
          ) : (
            <ul className="task-list">
              {workspace.settlements.map((settlement) => (
                <li className="task" key={settlement.id}>
                  <span>
                    <strong>
                      {settlement.employeeName} · {settlement.unusedUnits} day(s)
                    </strong>
                    <small>
                      {settlement.reason.replaceAll("_", " ")} · daily wage {formatMoney(settlement.dailyRegularWage)} ·
                      sources {settlement.sourceIds.join(", ")}
                    </small>
                  </span>
                  <span className={`badge ${settlement.status === "draft" ? "warning" : ""}`}>
                    {settlement.status} · {formatMoney(settlement.amount)}
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
