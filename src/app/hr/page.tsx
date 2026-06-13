import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getCompanyOverview } from "@/server/dashboard/queries";
import { getPayrollDashboard } from "@/server/payroll/service";
import { getHrAttendanceExceptions } from "@/server/workflows/service";

export default async function HrDashboardPage() {
  const [session, overview] = await Promise.all([getDemoSession(), getCompanyOverview()]);
  const [exceptions, payroll] = await Promise.all([
    getHrAttendanceExceptions(session),
    getPayrollDashboard(session),
  ]);

  if (!overview) {
    return (
      <main className="page">
        <EmptyState
          title="No seed data yet"
          body="Run the database migration and seed commands from README before opening the HR dashboard."
        />
      </main>
    );
  }

  return (
    <main className="page">
      <section className="page-header">
        <h1>Monthly Close</h1>
        <p>HR starts from closing blockers and exceptions, not a function menu.</p>
      </section>

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Employees</span>
          <strong>{overview.employeeCount}</strong>
          <span className="badge">{overview.company.name}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Attendance blockers</span>
          <strong>{exceptions.filter((item) => item.status === "pending").length}</strong>
          <span className="badge warning">Before payroll</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Active rule versions</span>
          <strong>{overview.activeRuleCount}</strong>
          <span className="badge">Versioned</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Employee forms</h2>
              <p className="muted">Build mobile forms and route each request through the same approval Inbox.</p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/employee-import">
                Import
              </a>
              <a className="button" href="/hr/onboarding-readiness">
                Readiness
              </a>
              <a className="button" href="/hr/employee-lifecycle">
                Lifecycle
              </a>
              <a className="button" href="/hr/employment-terms">
                Terms
              </a>
              <a className="button" href="/hr/offboarding">
                Offboarding
              </a>
              <a className="button" href="/hr/documents">
                Documents
              </a>
              <a className="button" href="/hr/work-rules">
                Work rules
              </a>
              <a className="button" href="/hr/training">
                Training
              </a>
              <a className="button" href="/hr/incidents">
                Incidents
              </a>
              <a className="button" href="/hr/copilot">
                AI Copilot
              </a>
              <a className="button" href="/hr/policy-sources">
                Policy sources
              </a>
              <a className="button" href="/hr/kpis">
                KPIs
              </a>
              <a className="button primary" href="/hr/forms">
                Open builder
              </a>
            </div>
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Time operations</h2>
              <p className="muted">Keep attendance policies, calendars, leave rules, and balances configurable without code changes.</p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/shift-templates">
                Shift templates
              </a>
              <a className="button" href="/hr/attendance-policies">
                Attendance policies
              </a>
              <a className="button" href="/hr/attendance-exceptions">
                Exceptions
              </a>
              <a className="button" href="/hr/attendance-signoffs">
                Sign-offs
              </a>
              <a className="button" href="/hr/worktime-compliance">
                Worktime compliance
              </a>
              <a className="button" href="/hr/worktime-agreements">
                Worktime agreements
              </a>
              <a className="button" href="/hr/calendar">
                Company calendar
              </a>
              <a className="button" href="/hr/annual-leave-grants">
                Annual grants
              </a>
              <a className="button" href="/hr/annual-leave-expiry">
                Leave expiry
              </a>
              <a className="button primary" href="/hr/leave-policies">
                Leave policies
              </a>
            </div>
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Payroll close</h2>
              <p className="muted">
                HR must clear blockers, calculate, confirm, lock, then release payslips.
              </p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/salary-profiles">
                Salary profiles
              </a>
              <a className="button" href="/hr/payroll-profile-import">
                Profile import
              </a>
              <a className="button" href="/hr/payment-profiles">
                Payment profiles
              </a>
              <a className="button" href="/hr/payroll-payment-security">
                Payment security
              </a>
              <a className="button" href="/hr/payroll-compliance">
                Compliance profiles
              </a>
              <a className="button" href="/hr/insurance">
                Insurance
              </a>
              <a className="button" href="/hr/payroll-recordkeeping">
                Recordkeeping
              </a>
              <a className="button" href="/hr/annual-leave-settlements">
                Annual leave
              </a>
              <a className="button" href="/hr/payroll-accounting">
                Accounting
              </a>
              <a className="button" href="/hr/payroll-adjustments">
                Adjustments
              </a>
              <a className="button" href="/hr/payroll-exports">
                Exports
              </a>
              <span className="badge">{payroll.run?.status ?? "not started"}</span>
            </div>
          </div>

          <div className="action-row payroll-actions">
            <form action="/api/payroll/create" method="post">
              <button className="button primary" type="submit">
                Create run
              </button>
            </form>
            <form action="/api/payroll/resolve-blockers" method="post">
              <button className="button" type="submit">
                Mark blockers reviewed
              </button>
            </form>
            <form action="/api/payroll/recalculate" method="post">
              <button className="button" type="submit">
                Calculate draft
              </button>
            </form>
            <form action="/api/payroll/confirm" method="post">
              <button className="button" type="submit">
                HR confirm
              </button>
            </form>
            <form action="/api/payroll/lock" method="post">
              <button className="button" type="submit">
                Lock payroll
              </button>
            </form>
            <form action="/api/payroll/release" method="post">
              <button className="button" type="submit">
                Release payslips
              </button>
            </form>
          </div>

          {payroll.checklist.ruleReview.blocksLock ? (
            <div className="risk-box danger-box">
              <strong>Rule review required before payroll lock</strong>
              <p>{payroll.checklist.ruleReview.detail}</p>
              <p className="muted">
                Active rule {payroll.checklist.ruleReview.activeRuleVersion}; payroll draft rule{" "}
                {payroll.checklist.ruleReview.payrollRuleVersionId ?? "not calculated yet"}.
              </p>
            </div>
          ) : (
            <div className="risk-box">
              <strong>Rule version ready</strong>
              <p>{payroll.checklist.ruleReview.detail}</p>
            </div>
          )}

          <ol className="close-steps">
            {payroll.checklist.steps.map((step) => (
              <li key={step.step} className={`close-step ${step.status}`}>
                <strong>
                  {step.step}. {step.title}
                </strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>

          {payroll.run ? (
            <div className="payroll-preview">
              <div className="metric">
                <span className="muted">Gross draft</span>
                <strong>{formatMoney(payroll.run.grossTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">Deductions</span>
                <strong>{formatMoney(payroll.run.deductionTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">Net draft</span>
                <strong>{formatMoney(payroll.run.netTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">Employer statutory cost</span>
                <strong>{formatMoney(payroll.run.employerContributionTotal ?? 0)}</strong>
              </div>
            </div>
          ) : null}

          {payroll.run && payroll.run.items.length > 0 ? (
            <ul className="task-list">
              {payroll.run.items.slice(0, 10).map((item) => (
                <li className="task" key={`${item.employeeId}-${item.kind}-${item.code}`}>
                  <span>
                    <strong>
                      {item.employeeName} · {item.name}
                    </strong>
                    <small>{item.kind} · rule {item.ruleVersionId ?? "n/a"}</small>
                  </span>
                  <span className={`badge ${item.kind === "deduction" ? "warning" : ""}`}>
                    {formatMoney(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="panel span-8">
          <div className="section-heading">
            <div>
              <h2>Attendance exceptions</h2>
              <p className="muted">Resolve blockers before payroll close.</p>
            </div>
            <a className="button" href="/hr/attendance-exceptions">
              Open queue
            </a>
          </div>
          {exceptions.length === 0 ? (
            <p className="muted">No attendance exceptions.</p>
          ) : (
            <ul className="task-list">
              {exceptions.map((exception) => (
                <li className="task" key={exception.id}>
                  <span>
                    <strong>{exception.employeeName}</strong>
                    <small>{exception.exceptionType}</small>
                  </span>
                  <span className={`badge ${exception.severity === "warning" ? "warning" : "danger"}`}>
                    {exception.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel span-4">
          <h2>Departments</h2>
          <ul className="task-list">
            {overview.company.departments.map((department) => (
              <li className="task" key={department.id}>
                <span>{department.name}</span>
                <span className="badge">{department._count.employees}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
