import { getHrOneKpis, summarizeHrOneKpis } from "@/server/kpis/hr-one";

export default async function HrOneKpiPage() {
  const kpis = await getHrOneKpis();
  const summary = summarizeHrOneKpis(kpis);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Winning KPIs</h1>
        <p>Track whether HR One is becoming faster, safer, and easier to adopt instead of merely broader.</p>
      </section>

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Passing</span>
          <strong>{summary.passing}</strong>
          <span className="badge">of {summary.total}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Watch</span>
          <strong>{summary.watch}</strong>
          <span className="badge warning">Needs focus</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Sale readiness</span>
          <strong>{summary.readyForSale ? "Ready" : "Not yet"}</strong>
          <span className={`badge ${summary.readyForSale ? "" : "warning"}`}>
            KPI gate
          </span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>KPI scorecard</h2>
              <p className="muted">Each KPI is owned by a product area and should map to telemetry before production rollout.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <ul className="task-list">
            {kpis.map((kpi) => (
              <li className="task kpi-task" key={kpi.id}>
                <span>
                  <strong>{kpi.name}</strong>
                  <small>
                    Target {kpi.target} · current {kpi.current} · {kpi.owner}
                  </small>
                  <small>{kpi.nextStep}</small>
                </span>
                <span className={`badge ${badgeClass(kpi.status)}`}>
                  {kpi.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function badgeClass(status: string) {
  if (status === "failing") return "danger";
  if (status === "watch") return "warning";
  return "";
}
