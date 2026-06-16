import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { evaluateSalaryProfileMinimumWageCompliance } from "@/server/payroll/minimum-wage";
import { getSalaryProfileWorkspace } from "@/server/payroll/salary-profiles";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function SalaryProfilesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const [workspace, laborConfig] = await Promise.all([
    getSalaryProfileWorkspace(session),
    getTaiwanLaborStandardsConfig(session),
  ]);
  const currentProfiles = workspace.profiles.filter((profile) => !profile.effectiveTo);
  const minimumWage = evaluateSalaryProfileMinimumWageCompliance(currentProfiles, laborConfig);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Salary Profiles</h1>
        <p>Maintain employee salary profiles with payroll-only permissions and redacted audit logs.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to save salary profile</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Employees</span>
          <strong>{workspace.employees.length}</strong>
          <span className="badge">Active</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Profiles</span>
          <strong>{workspace.profiles.length}</strong>
          <span className="badge">Effective dated</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Audit mode</span>
          <strong>Redacted</strong>
          <span className="badge warning">Sensitive</span>
        </div>
        <div className="panel span-12 risk-box">
          <div className="section-heading">
            <div>
              <h2>Taiwan minimum wage check</h2>
              <p className="muted">{minimumWage.detail}</p>
            </div>
            <span className={`badge ${minimumWage.ready ? "" : "danger"}`}>
              {minimumWage.ready ? "Ready" : "Action needed"}
            </span>
          </div>
          <p className="muted">
            Configured monthly minimum {formatMoney(laborConfig.minimumMonthlyWage)} · hourly minimum{" "}
            {formatMoney(laborConfig.minimumHourlyWage)}
          </p>
          {minimumWage.violations.length ? (
            <ul className="task-list compact">
              {minimumWage.violations.slice(0, 5).map((violation) => (
                <li className="task" key={`${violation.employeeId}-${violation.type}`}>
                  <span>
                    <strong>
                      {violation.employeeName ?? "Employee"} {violation.employeeNo ? `· ${violation.employeeNo}` : ""}
                    </strong>
                    <small>{violation.message}</small>
                  </span>
                  <span className="badge danger">Min {formatMoney(violation.requiredMinimum)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Profile wizard</h2>
              <p className="muted">Create a new effective-dated profile. Existing payroll runs are not silently changed.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <form action="/api/payroll/salary-profiles" method="post" className="wizard-form">
            <div className="field-grid">
              <label>
                Employee
                <select name="employeeId">
                  {workspace.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employeeNo} · {employee.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Effective from
                <input name="effectiveFrom" type="date" defaultValue={today()} required />
              </label>
              <label>
                Base salary
                <input name="baseSalary" type="number" min="0" step="1" defaultValue="60000" required />
              </label>
              <label>
                Hourly wage
                <input name="hourlyWage" type="number" min="0" step="1" placeholder="Optional" />
              </label>
            </div>

            <div className="field-grid">
              <label>
                Allowance code
                <input name="allowanceCode" defaultValue="meal" />
              </label>
              <label>
                Allowance name
                <input name="allowanceName" defaultValue="Meal allowance" />
              </label>
              <label>
                Allowance amount
                <input name="allowanceAmount" type="number" min="0" step="1" defaultValue="2000" />
              </label>
              <label>
                Deduction code
                <input name="deductionCode" defaultValue="welfare" />
              </label>
              <label>
                Deduction name
                <input name="deductionName" defaultValue="Welfare deduction" />
              </label>
              <label>
                Deduction amount
                <input name="deductionAmount" type="number" min="0" step="1" defaultValue="1000" />
              </label>
            </div>

            <button className="button primary" type="submit">
              Save salary profile
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Current and historical profiles</h2>
          {workspace.profiles.length === 0 ? (
            <EmptyState title="No salary profiles" body="Create salary profiles before payroll calculation." />
          ) : (
            <ul className="task-list">
              {workspace.profiles.map((profile) => (
                <li className="task" key={profile.id}>
                  <span>
                    <strong>
                      {profile.employeeName} · {profile.employeeNo}
                    </strong>
                    <small>
                      effective {formatDate(profile.effectiveFrom)}
                      {profile.effectiveTo ? ` - ${formatDate(profile.effectiveTo)}` : " - current"}
                    </small>
                  </span>
                  <span className="badge warning">{formatMoney(profile.baseSalary)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
