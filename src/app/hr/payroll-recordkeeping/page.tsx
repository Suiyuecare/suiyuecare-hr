import { getDemoSession } from "@/server/auth/session";
import {
  getPayrollRecordkeepingReadiness,
  getPayrollRecordkeepingSettings,
  minimumWageRosterRetentionDays,
} from "@/server/payroll/recordkeeping";

type SearchParams = Promise<{ error?: string }>;

export default async function PayrollRecordkeepingPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const [settings, readiness] = await Promise.all([
    getPayrollRecordkeepingSettings(session),
    getPayrollRecordkeepingReadiness(session),
  ]);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Payroll Recordkeeping</h1>
        <p>Configure wage roster retention, employee wage statements, and labor inspection export readiness.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to update payroll recordkeeping</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Wage roster retention</span>
          <strong>{settings.wageRosterRetentionDays} days</strong>
          <span className={`badge ${settings.wageRosterRetentionDays >= minimumWageRosterRetentionDays ? "" : "danger"}`}>
            {settings.wageRosterRetentionDays >= minimumWageRosterRetentionDays ? "5-year ready" : "Too short"}
          </span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Employee statements</span>
          <strong>{settings.employeePayslipEnabled ? "Enabled" : "Paused"}</strong>
          <span className={`badge ${settings.wageCalculationDetailsEnabled ? "" : "warning"}`}>
            {settings.wageCalculationDetailsEnabled ? "Calculation details" : "Details missing"}
          </span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Readiness</span>
          <strong>{readiness.ready ? "Ready" : "Action needed"}</strong>
          <span className={`badge ${readiness.ready ? "" : "danger"}`}>Article 23</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Recordkeeping wizard</h2>
              <p className="muted">
                Wage roster settings affect payroll close evidence and employee wage statement access.
              </p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <form className="wizard-form" action="/api/payroll/recordkeeping" method="post">
            <div className="field-grid">
              <label>
                Wage roster retention days
                <input
                  name="wageRosterRetentionDays"
                  type="number"
                  min={minimumWageRosterRetentionDays}
                  step="1"
                  defaultValue={settings.wageRosterRetentionDays}
                />
              </label>
            </div>
            <div className="toggle-row">
              <label>
                <input name="employeePayslipEnabled" type="checkbox" defaultChecked={settings.employeePayslipEnabled} />
                Employee wage statement access
              </label>
              <label>
                <input
                  name="wageCalculationDetailsEnabled"
                  type="checkbox"
                  defaultChecked={settings.wageCalculationDetailsEnabled}
                />
                Include wage calculation details
              </label>
              <label>
                <input
                  name="laborInspectionExportEnabled"
                  type="checkbox"
                  defaultChecked={settings.laborInspectionExportEnabled}
                />
                Labor inspection export ready
              </label>
            </div>

            <button className="button primary" type="submit">
              Save recordkeeping settings
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Readiness detail</h2>
          <p className="muted">{readiness.detail}</p>
          {readiness.missing.length ? (
            <ul className="task-list compact">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge danger">Required</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </section>
    </main>
  );
}
