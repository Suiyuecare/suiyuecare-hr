import { getDemoSession } from "@/server/auth/demo-session";
import { getLaunchReadinessReport } from "@/server/readiness/launch";

export default async function LaunchReadinessPage() {
  const session = await getDemoSession();
  const report = await getLaunchReadinessReport(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Launch Readiness</h1>
        <p>Owner checklist for turning HR One from a demo workspace into a customer-ready deployment.</p>
      </section>

      <section className="grid">
        <div className="panel span-3 metric">
          <span className="muted">Ready</span>
          <strong>{report.readyCount}</strong>
          <span className="badge">checks</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Action required</span>
          <strong>{report.actionRequiredCount}</strong>
          <span className="badge warning">before launch</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Blocked</span>
          <strong>{report.blockedCount}</strong>
          <span className={`badge ${report.blockedCount > 0 ? "danger" : ""}`}>hard gate</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Sale status</span>
          <strong>{report.readyForSale ? "Ready" : "Not ready"}</strong>
          <span className={`badge ${report.readyForSale ? "" : "warning"}`}>launch gate</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Production setup wizard</h2>
              <p className="muted">
                Work through these gates in order before selling or onboarding a customer tenant.
              </p>
            </div>
            <span className="badge">Guided path</span>
          </div>
          <ol className="close-steps">
            {report.setupSteps.map((step) => (
              <li key={step.step} className={`close-step ${step.status === "ready" ? "done" : step.status}`}>
                <strong>
                  {step.step}. {step.title}
                </strong>
                <span>{step.summary}</span>
                <a className="button" href={step.actionHref}>
                  {step.actionLabel}
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Readiness checks</h2>
              <p className="muted">
                These checks focus on persistence, security, compliance governance, operational delivery, auditability, and KPI proof.
              </p>
            </div>
            <a className="button" href="/settings">
              Settings
            </a>
          </div>

          <ul className="task-list">
            {report.items.map((item) => (
              <li className="task" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.area} · {item.detail}
                  </small>
                  <small>{item.nextStep}</small>
                </span>
                <span className="inline-actions">
                  <a className="button" href={item.actionHref}>
                    {item.actionLabel}
                  </a>
                  <span className={`badge ${badgeClass(item.status)}`}>
                    {label(item.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12" id="database-setup">
          <div className="section-heading">
            <div>
              <h2>Database setup path</h2>
              <p className="muted">
                Run these commands in a production-like environment with PostgreSQL before onboarding a customer tenant.
              </p>
            </div>
            <span className="badge">Required</span>
          </div>
          <ul className="task-list">
            <li className="task">
              <span>
                <strong>1. Apply migrations</strong>
                <small>pnpm db:migrate</small>
              </span>
              <span className="badge">Schema</span>
            </li>
            <li className="task">
              <span>
                <strong>2. Load baseline data</strong>
                <small>pnpm db:seed</small>
              </span>
              <span className="badge">Tenant</span>
            </li>
            <li className="task">
              <span>
                <strong>3. Provision customer foundation</strong>
                <small>pnpm db:provision:tenant -- --tenant-slug=&lt;customer-slug&gt; ...</small>
              </span>
              <span className="badge warning">Customer</span>
            </li>
            <li className="task">
              <span>
                <strong>4. Verify demo baseline</strong>
                <small>pnpm db:verify</small>
              </span>
              <span className="badge">Demo gate</span>
            </li>
            <li className="task">
              <span>
                <strong>5. Verify production tenant</strong>
                <small>pnpm db:verify:production -- --tenant-slug=&lt;customer-slug&gt;</small>
              </span>
              <span className="badge danger">Launch gate</span>
            </li>
          </ul>
        </section>
      </section>
    </main>
  );
}

function badgeClass(status: string) {
  if (status === "blocked") return "danger";
  if (status === "action_required") return "warning";
  return "";
}

function label(status: string) {
  if (status === "action_required") return "Action required";
  return status;
}
