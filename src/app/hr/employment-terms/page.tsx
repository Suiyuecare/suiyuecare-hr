import { getDemoSession } from "@/server/auth/demo-session";
import { getEmploymentTermsWorkspace } from "@/server/employees/employment-terms";

type SearchParams = Promise<{ error?: string }>;

export default async function EmploymentTermsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getEmploymentTermsWorkspace(session);
  const firstEmployee = workspace.employees[0];

  return (
    <main className="page">
      <section className="page-header">
        <h1>Employment Terms</h1>
        <p>Keep core working conditions structured, versioned, acknowledged, and audit-ready.</p>
      </section>

      <section className="grid">
        {error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update employment terms</strong>
            <p>{error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Coverage</span>
          <strong>{workspace.coverage.coverageRate}%</strong>
          <span className={`badge ${workspace.coverage.coverageRate >= 90 ? "" : "warning"}`}>target 90%</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Active terms</span>
          <strong>{workspace.coverage.activeTermsCount}</strong>
          <span className="badge">versioned</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Acknowledged</span>
          <strong>{workspace.coverage.acknowledgedCount}</strong>
          <span className="badge">employee</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Pending</span>
          <strong>{workspace.coverage.pendingCount}</strong>
          <span className={`badge ${workspace.coverage.pendingCount ? "warning" : ""}`}>before onboarding</span>
        </div>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Terms wizard</h2>
              <p className="muted">Salary amounts stay in salary profiles; this stores a wage summary hash.</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/employees/employment-terms" method="post" className="mini-form">
            <input type="hidden" name="intent" value="save" />
            <label>
              Employee
              <select name="employeeId" defaultValue={firstEmployee?.id} required>
                {workspace.employees.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.employeeNo} · {employee.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-grid">
              <label>
                Version
                <input name="version" defaultValue="2026.01" required />
              </label>
              <label>
                Status
                <select name="status" defaultValue="active">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
              <label>
                Effective from
                <input name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </label>
              <label>
                Job title
                <input name="jobTitle" defaultValue={firstEmployee?.jobTitle ?? "Employee"} required />
              </label>
            </div>
            <label>
              Work location
              <input name="workLocation" defaultValue="Taipei office / approved remote work" required />
            </label>
            <label>
              Regular work schedule
              <textarea
                name="regularWorkSchedule"
                rows={3}
                defaultValue="Regular 09:00-18:00, one-hour break, based on active shift policy."
                required
              />
            </label>
            <label>
              Wage payment day
              <input name="wagePaymentDay" defaultValue="Monthly, paid by the 5th business day." required />
            </label>
            <label>
              Wage basis summary
              <textarea
                name="wageBasisSummary"
                rows={3}
                defaultValue="Base salary, allowances, deductions, and statutory items are managed in the active salary and payroll compliance profiles."
                required
              />
            </label>
            <label>
              Benefits summary
              <textarea
                name="benefitsSummary"
                rows={3}
                defaultValue="Statutory insurance, labor pension, annual leave, and company benefits follow active HR One policies."
                required
              />
            </label>
            <label>
              Source reference
              <input name="sourceRef" defaultValue="demo://employment-terms/2026.01" />
            </label>
            <label className="check-row">
              <input name="acknowledgementRequired" type="checkbox" defaultChecked />
              Require employee acknowledgement
            </label>
            <button className="button primary" type="submit">
              Save employment terms
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>Current terms</h2>
              <p className="muted">Use source references and hashes to avoid leaking raw wage terms.</p>
            </div>
            <span className="badge">{workspace.terms.length}</span>
          </div>
          <ul className="task-list">
            {workspace.terms.length === 0 ? (
              <li className="task">
                <span>No employment terms yet.</span>
                <span className="badge warning">Open</span>
              </li>
            ) : null}
            {workspace.terms.map((term) => (
              <li className="task" key={term.id}>
                <span>
                  <strong>
                    {term.employeeName} · {term.jobTitle}
                  </strong>
                  <small>
                    {term.version} · {term.status} · effective {term.effectiveFrom.toLocaleDateString("zh-TW")}
                  </small>
                  <small>{term.workLocation}</small>
                  <small>Wage hash {term.wageBasisSummaryHash.slice(0, 12)}</small>
                  {term.acknowledgedAt ? (
                    <small>Acknowledged {term.acknowledgedAt.toLocaleDateString("zh-TW")}</small>
                  ) : null}
                </span>
                <span className={`badge ${term.acknowledgedAt ? "" : "warning"}`}>
                  {term.acknowledgedAt ? "acknowledged" : "pending"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
