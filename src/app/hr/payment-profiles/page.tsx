import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getPaymentProfileWorkspace } from "@/server/payroll/payment-profiles";

type SearchParams = Promise<{ error?: string }>;

export default async function PaymentProfilesPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getPaymentProfileWorkspace(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Payment Profiles</h1>
        <p>Maintain employee payment destinations with payroll-only access and redacted audit logs.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to save payment profile</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Active employees</span>
          <strong>{workspace.activeCoverage.totalEmployees}</strong>
          <span className="badge">Payroll scope</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Payment configured</span>
          <strong>{workspace.activeCoverage.configuredEmployees}</strong>
          <span className={`badge ${workspace.activeCoverage.missingEmployees.length ? "warning" : ""}`}>
            {workspace.activeCoverage.missingEmployees.length ? "Action needed" : "Ready"}
          </span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Missing profiles</span>
          <strong>{workspace.activeCoverage.missingEmployees.length}</strong>
          <span className="badge">Before bank export</span>
        </div>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Add profile</h2>
              <p className="muted">Only the account hash and last four digits are retained in this foundation.</p>
            </div>
          </div>
          <form action="/api/payroll/payment-profiles" method="post" className="wizard-form">
            <label>
              Employee
              <select name="employeeId" required>
                {workspace.employees.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.employeeNo} · {employee.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-grid">
              <label>
                Bank code
                <input name="bankCode" inputMode="numeric" pattern="[0-9]{3,7}" placeholder="004" required />
              </label>
              <label>
                Branch code
                <input name="bankBranchCode" inputMode="numeric" pattern="[0-9]{3,7}" placeholder="0123" />
              </label>
            </div>
            <label>
              Account name
              <input name="accountName" placeholder="Employee legal account name" required />
            </label>
            <label>
              Account number
              <input name="accountNumber" inputMode="numeric" pattern="[0-9]{6,20}" placeholder="Digits only" required />
            </label>
            <label>
              Effective from
              <input name="effectiveFrom" type="date" defaultValue="2026-07-01" required />
            </label>
            <button className="button primary" type="submit">
              Save payment profile
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <h2>Current coverage</h2>
          {workspace.activeCoverage.missingEmployees.length === 0 ? (
            <p className="muted">All active employees have payment profiles.</p>
          ) : (
            <ul className="task-list">
              {workspace.activeCoverage.missingEmployees.map((employee) => (
                <li className="task" key={employee.id}>
                  <span>
                    <strong>{employee.displayName}</strong>
                    <small>{employee.employeeNo} · payment profile missing</small>
                  </span>
                  <span className="badge warning">Missing</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12">
          <h2>Profiles</h2>
          {workspace.profiles.length === 0 ? (
            <EmptyState title="No payment profiles" body="Create payment profiles before production bank transfer exports." />
          ) : (
            <ul className="task-list">
              {workspace.profiles.map((profile) => (
                <li className="task" key={profile.id}>
                  <span>
                    <strong>
                      {profile.employeeName} · {profile.employeeNo}
                    </strong>
                    <small>
                      bank {profile.bankCode}
                      {profile.bankBranchCode ? `-${profile.bankBranchCode}` : ""} · account ending {profile.accountNumberLast4}
                    </small>
                    <small>{formatDate(profile.effectiveFrom)} - {profile.effectiveTo ? formatDate(profile.effectiveTo) : "current"}</small>
                  </span>
                  <span className={`badge ${profile.status === "inactive" ? "warning" : ""}`}>{profile.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
