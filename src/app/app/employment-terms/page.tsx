import { DashboardLink } from "@/components/DashboardLink";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getOwnEmploymentTerms } from "@/server/employees/employment-terms";

type SearchParams = Promise<{ error?: string }>;

export default async function EmployeeEmploymentTermsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const terms = await getOwnEmploymentTerms(session);
  const pending = terms.filter((term) => term.acknowledgementRequired && !term.acknowledgedAt);

  return (
    <>
      <main className="page mobile-page">
        <section className="page-header">
          <h1>Employment Terms</h1>
          <p>Review your current working conditions and acknowledge receipt.</p>
        </section>

        <section className="grid">
          {error ? (
            <div className="panel span-12 risk-box danger-box">
              <strong>Unable to acknowledge employment terms</strong>
              <p>{error}</p>
            </div>
          ) : null}

          <section className="panel span-12 today-card">
            <div>
              <span className="muted">Need acknowledgement</span>
              <h2>{pending.length}</h2>
              <p className="muted">Wage details stay in payroll profiles; this page shows core terms.</p>
            </div>
            <span className={`badge ${pending.length ? "warning" : ""}`}>
              {pending.length ? "Action needed" : "Done"}
            </span>
          </section>

          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>Current terms</h2>
                <p className="muted">Confirm the latest active version.</p>
              </div>
              <span className="badge">{terms.length}</span>
            </div>
            {terms.length === 0 ? (
              <EmptyState title="No employment terms" body="HR-published terms will appear here." />
            ) : (
              <ul className="task-list">
                {terms.map((term) => (
                  <li className="task" key={term.id}>
                    <span>
                      <strong>{term.jobTitle}</strong>
                      <small>
                        {term.version} · effective {term.effectiveFrom.toLocaleDateString("zh-TW")}
                      </small>
                      <small>{term.workLocation}</small>
                      <small>{term.regularWorkSchedule}</small>
                      <small>{term.wagePaymentDay}</small>
                      <small>{term.benefitsSummary}</small>
                      {term.acknowledgedAt ? (
                        <small>Acknowledged {term.acknowledgedAt.toLocaleDateString("zh-TW")}</small>
                      ) : null}
                    </span>
                    {term.acknowledgedAt ? (
                      <span className="badge">acknowledged</span>
                    ) : (
                      <form action="/api/employees/employment-terms" method="post">
                        <input type="hidden" name="intent" value="acknowledge" />
                        <input type="hidden" name="termId" value={term.id} />
                        <button className="button primary" type="submit">
                          Acknowledge
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </main>

      <nav className="bottom-nav" aria-label="Employee mobile navigation">
        <DashboardLink href="/app" label="Home" />
        <DashboardLink href="/app/employment-terms" label="Terms" />
        <DashboardLink href="/app/documents" label="Docs" />
        <DashboardLink href="/app/payslip" label="Payslip" />
        <DashboardLink href="/manager/inbox" label="Inbox" />
      </nav>
    </>
  );
}
