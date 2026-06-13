import { getDemoSession } from "@/server/auth/demo-session";
import { getWorktimeComplianceWorkspace } from "@/server/attendance/worktime-compliance";

type SearchParams = Promise<{
  periodStart?: string;
  periodEnd?: string;
  error?: string;
}>;

export default async function WorktimeCompliancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const periodStart = parseDate(params.periodStart);
  const periodEnd = parseDate(params.periodEnd);
  const session = await getDemoSession();
  const workspace = await getWorktimeComplianceWorkspace(session, {
    periodStart: periodStart ?? undefined,
    periodEnd: periodEnd ?? undefined,
  });
  const dangerCount = workspace.risks.filter((risk) => risk.severity === "danger").length;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Worktime Compliance</h1>
        <p>Scan Labor Standards Act working-time risks before payroll close.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to create exceptions</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Risks</span>
          <strong>{workspace.risks.length}</strong>
          <span className={`badge ${workspace.risks.length ? "warning" : ""}`}>Before payroll</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Danger risks</span>
          <strong>{dangerCount}</strong>
          <span className={`badge ${dangerCount ? "danger" : ""}`}>Needs HR review</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Scan audits</span>
          <strong>{workspace.auditCount}</strong>
          <span className="badge">Tracked</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Monthly scan</h2>
              <p className="muted">Creates attendance exceptions only after HR review.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>
          <form action="/api/attendance/worktime-compliance" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                Period start
                <input name="periodStart" type="date" defaultValue={formatDate(workspace.periodStart)} required />
              </label>
              <label>
                Period end
                <input name="periodEnd" type="date" defaultValue={formatDate(workspace.periodEnd)} required />
              </label>
            </div>
            <button className="button primary" type="submit">
              Create exceptions
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Risk review</h2>
              <p className="muted">Sources are attached so HR can trace the configured law rule.</p>
            </div>
          </div>
          {workspace.risks.length === 0 ? (
            <p className="muted">No working-time compliance risks.</p>
          ) : (
            <ul className="task-list">
              {workspace.risks.map((risk, index) => (
                <li className="task" key={`${risk.employeeId}-${risk.riskType}-${index}`}>
                  <span>
                    <strong>
                      {risk.employeeName} · {risk.riskType.replaceAll("_", " ")}
                    </strong>
                    <small>
                      {risk.detail} · sources {risk.sourceIds.join(", ")}
                    </small>
                  </span>
                  <span className={`badge ${risk.severity === "danger" ? "danger" : "warning"}`}>
                    {risk.severity}
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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
