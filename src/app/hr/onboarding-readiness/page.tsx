import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getOnboardingReadinessReport } from "@/server/onboarding/readiness";

export default async function OnboardingReadinessPage() {
  const session = await getDemoSession();
  const report = await getOnboardingReadinessReport(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Onboarding Readiness</h1>
        <p>Turn customer setup gaps into a short HR action list before production verification.</p>
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
          <span className="badge warning">setup</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Blocked</span>
          <strong>{report.blockedCount}</strong>
          <span className={`badge ${report.blockedCount ? "danger" : ""}`}>verify gate</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Production verify</span>
          <strong>{report.readyForProductionVerify ? "Ready" : "Not ready"}</strong>
          <span className={`badge ${report.readyForProductionVerify ? "" : "warning"}`}>tenant data</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Customer data checklist</h2>
              <p className="muted">Clear blocked items before running the production tenant verification command.</p>
            </div>
            <a className="button" href="/settings/readiness#database-setup">
              Launch gate
            </a>
          </div>

          <ul className="task-list">
            {report.checks.map((check) => (
              <li className="task" key={check.id}>
                <span>
                  <strong>{check.title}</strong>
                  <small>{check.detail}</small>
                  {check.missingEmployees?.slice(0, 4).map((employee) => (
                    <small className="warning-text" key={`${check.id}-${employee.id}`}>
                      Missing: {employee.employeeNo} · {employee.displayName}
                    </small>
                  ))}
                  {check.missingEmployees && check.missingEmployees.length > 4 ? (
                    <small className="warning-text">
                      +{check.missingEmployees.length - 4} more employee(s)
                    </small>
                  ) : null}
                </span>
                <span className="inline-actions">
                  <a className="button" href={check.actionHref}>
                    {check.actionLabel}
                  </a>
                  <span className={`badge ${badgeClass(check.status)}`}>{label(check.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {report.checks.length === 0 ? (
          <section className="panel span-12">
            <EmptyState title="No onboarding checks" body="Provision a tenant and import employee data before reviewing readiness." />
          </section>
        ) : null}
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
