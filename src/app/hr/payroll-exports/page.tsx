import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getPayrollExportWorkspace } from "@/server/payroll/exports";

type SearchParams = Promise<{ error?: string }>;

export default async function PayrollExportsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getPayrollExportWorkspace(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Payroll Exports</h1>
        <p>Generate audited export packages for bank transfer readiness, accounting close, and Taiwan statutory filing review.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to generate export</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {!workspace.payrollRun ? (
        <EmptyState title="No payroll run" body="Create, calculate, confirm, and lock payroll before generating export packages." />
      ) : (
        <section className="grid">
          <div className="panel span-4 metric">
            <span className="muted">Payroll period</span>
            <strong>{formatPeriod(workspace.payrollRun.periodStart)}</strong>
            <span className="badge">{workspace.payrollRun.status}</span>
          </div>
          <div className="panel span-4 metric">
            <span className="muted">Calculated items</span>
            <strong>{workspace.payrollRun.items.length}</strong>
            <span className="badge">Hash verified</span>
          </div>
          <div className="panel span-4 metric">
            <span className="muted">Export packages</span>
            <strong>{workspace.exports.length}</strong>
            <span className="badge">Audited</span>
          </div>
          <div className="panel span-12 metric">
            <span className="muted">Payment profile coverage</span>
            <strong>
              {workspace.paymentProfileCoverage.configuredEmployees}/{workspace.paymentProfileCoverage.totalEmployees}
            </strong>
            <span className={`badge ${workspace.paymentProfileCoverage.missingEmployees ? "warning" : ""}`}>
              {workspace.paymentProfileCoverage.missingEmployees
                ? `${workspace.paymentProfileCoverage.missingEmployees} missing`
                : "Ready for export review"}
            </span>
            <a className="button" href="/hr/payment-profiles">
              Manage payment profiles
            </a>
          </div>
          <div className="panel span-12 metric">
            <span className="muted">Accounting mapping</span>
            <strong>
              {workspace.accountingSettings.grossPayrollDebitAccountCode} · {workspace.accountingSettings.grossPayrollDebitAccountName}
            </strong>
            <span className="badge">Used in journal export</span>
            <a className="button" href="/hr/payroll-accounting">
              Manage accounting
            </a>
          </div>
          <div className="panel span-12 metric">
            <span className="muted">Payment security</span>
            <strong>{workspace.paymentSecurity.ready ? "Bank upload ready" : "Readiness package only"}</strong>
            <span className={`badge ${workspace.paymentSecurity.ready ? "" : "warning"}`}>
              {workspace.paymentSecurity.settings.verificationStatus}
            </span>
            <small>{workspace.paymentSecurity.detail}</small>
            <a className="button" href="/hr/payroll-payment-security">
              Configure payment security
            </a>
          </div>

          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>Generate package</h2>
                <p className="muted">Exports are available only after payroll is locked or released.</p>
              </div>
              <span className={`badge ${workspace.canGenerate ? "" : "warning"}`}>
                {workspace.canGenerate ? "Ready" : "Lock payroll first"}
              </span>
            </div>

            <div className="action-row payroll-actions">
              <form action="/api/payroll/exports" method="post">
                <input type="hidden" name="exportType" value="bank_transfer" />
                <button className="button primary" type="submit" disabled={!workspace.canGenerate}>
                  Generate bank package
                </button>
              </form>
              <form action="/api/payroll/exports" method="post">
                <input type="hidden" name="exportType" value="accounting_journal" />
                <button className="button" type="submit" disabled={!workspace.canGenerate}>
                  Generate accounting package
                </button>
              </form>
              <form action="/api/payroll/exports" method="post">
                <input type="hidden" name="exportType" value="statutory_filing" />
                <button className="button" type="submit" disabled={!workspace.canGenerate}>
                  Generate statutory filing draft
                </button>
              </form>
            </div>
          </section>

          <section className="panel span-12">
            <h2>Recent packages</h2>
            {workspace.exports.length === 0 ? (
              <p className="muted">No export package has been generated yet.</p>
            ) : (
              <ul className="task-list">
                {workspace.exports.map((item) => (
                  <li className="task export-task" key={item.id}>
                    <span>
                      <strong>{exportTypeLabel(item.exportType)} · {item.fileName}</strong>
                      <small>
                        {item.periodLabel} · {item.format} · {item.recordCount} records · hash {item.contentHash.slice(0, 12)}
                      </small>
                      {item.warnings.map((warning) => (
                        <small className="warning-text" key={warning}>{warning}</small>
                      ))}
                    </span>
                    <span className="stacked-actions">
                      <span className="badge">{item.status}</span>
                      <a className="button" href={`/api/payroll/exports/${item.id}/download`}>
                        Download manifest
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {workspace.exports[0] ? (
            <section className="panel span-12">
              <h2>Latest preview</h2>
              <ul className="task-list">
                {workspace.exports[0].previewRows.map((row) => (
                  <li className="task" key={`${row.label}-${row.description}`}>
                    <span>
                      <strong>{row.label}</strong>
                      <small>{row.description}</small>
                    </span>
                    <span className="badge">{row.amountLabel}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      )}
    </main>
  );
}

function exportTypeLabel(type: "bank_transfer" | "accounting_journal" | "statutory_filing") {
  if (type === "accounting_journal") return "Accounting journal";
  if (type === "statutory_filing") return "Statutory filing";
  return "Bank transfer";
}

function formatPeriod(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
