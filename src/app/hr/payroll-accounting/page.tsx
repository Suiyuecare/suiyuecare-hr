import { getDemoSession } from "@/server/auth/demo-session";
import { getPayrollAccountingSettings } from "@/server/payroll/accounting-settings";

type SearchParams = Promise<{ error?: string }>;

const accountRows = [
  {
    title: "Gross payroll debit",
    codeName: "grossPayrollDebitAccountCode",
    nameName: "grossPayrollDebitAccountName",
    note: "Regular salary, allowances, and overtime expense.",
  },
  {
    title: "Employer contribution debit",
    codeName: "employerContributionDebitAccountCode",
    nameName: "employerContributionDebitAccountName",
    note: "Employer-side statutory payroll cost.",
  },
  {
    title: "Deduction credit",
    codeName: "deductionCreditAccountCode",
    nameName: "deductionCreditAccountName",
    note: "Employee deductions, withholding, and payable offsets.",
  },
  {
    title: "Net payable credit",
    codeName: "netPayableCreditAccountCode",
    nameName: "netPayableCreditAccountName",
    note: "Net salary payable after deductions.",
  },
] as const;

export default async function PayrollAccountingPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const settings = await getPayrollAccountingSettings(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Payroll Accounting</h1>
        <p>Map payroll export summaries to the company chart of accounts before monthly close.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to update accounting mappings</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Accounting mapping wizard</h2>
              <p className="muted">These mappings affect accounting export packages only; payroll amounts stay protected.</p>
            </div>
            <a className="button" href="/hr/payroll-exports">
              Open exports
            </a>
          </div>

          <form className="wizard-form" action="/api/payroll/accounting-settings" method="post">
            {accountRows.map((row) => (
              <fieldset className="form-card" key={row.codeName}>
                <legend>{row.title}</legend>
                <p className="muted">{row.note}</p>
                <label>
                  Account code
                  <input
                    name={row.codeName}
                    defaultValue={settings[row.codeName]}
                    required
                    inputMode="text"
                    maxLength={32}
                  />
                </label>
                <label>
                  Account name
                  <input
                    name={row.nameName}
                    defaultValue={settings[row.nameName]}
                    required
                    maxLength={80}
                  />
                </label>
              </fieldset>
            ))}

            <button className="button primary" type="submit">
              Save accounting mappings
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Current export preview labels</h2>
          <ul className="task-list">
            {accountRows.map((row) => (
              <li className="task" key={`preview-${row.codeName}`}>
                <span>
                  <strong>{settings[row.codeName]} · {settings[row.nameName]}</strong>
                  <small>{row.title}</small>
                </span>
                <span className="badge">Configured</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
