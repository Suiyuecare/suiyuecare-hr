import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getPayrollProfileImportWorkspace } from "@/server/payroll/profile-imports";

type SearchParams = Promise<{ error?: string; imported?: string; preview?: string }>;

const sampleCsv = `employeeNo,baseSalary,hourlyWage,allowanceCode,allowanceName,allowanceAmount,deductionCode,deductionName,deductionAmount,taxResidency,dependentCount,laborInsuranceMonthlyWage,healthInsuranceMonthlyWage,laborPensionMonthlyWage,nonResidentWithholdingRatePercent,bankCode,bankBranchCode,accountName,accountNumber,effectiveFrom
E003,56000,,meal,Meal allowance,2000,welfare,Welfare deduction,1000,resident,1,,,,,004,0123,張小安,123456789012,2026-07-01
E005,58000,,meal,Meal allowance,2000,welfare,Welfare deduction,1000,non_resident,0,,,,18,004,0123,黃小宇,987654321098,2026-07-01`;

export default async function PayrollProfileImportPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, imported, preview }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getPayrollProfileImportWorkspace(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Payroll Profile Import</h1>
        <p>Batch import salary, payment, and payroll compliance profiles before production verification.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to import payroll profiles</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {imported ? (
        <div className="panel success-panel">
          <strong>Payroll profiles imported</strong>
          <p>Salary, payment, and compliance profile mutations were audited with sensitive values redacted.</p>
        </div>
      ) : null}
      {preview ? (
        <div className="panel">
          <strong>Preview ready</strong>
          <p className="muted">Review validation results before confirming the import.</p>
        </div>
      ) : null}

      <section className="grid">
        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>Step 1: paste CSV</h2>
              <p className="muted">
                Required: employeeNo, baseSalary, taxResidency, dependentCount, bankCode, accountName, accountNumber, effectiveFrom.
              </p>
            </div>
          </div>
          <form action="/api/payroll/profile-import" method="post" className="wizard-form">
            <input type="hidden" name="intent" value="preview" />
            <label>
              CSV content
              <textarea name="rawCsv" defaultValue={workspace.preview?.rawCsv ?? sampleCsv} rows={10} required />
            </label>
            <button className="button primary" type="submit">
              Preview import
            </button>
          </form>
        </section>

        <section className="panel span-5">
          <h2>Employee numbers</h2>
          <ul className="task-list">
            {workspace.employees.slice(0, 8).map((employee) => (
              <li className="task" key={employee.id}>
                <span>
                  <strong>{employee.employeeNo}</strong>
                  <small>{employee.displayName}</small>
                </span>
                <span className="badge">Active</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Step 2: validate</h2>
              <p className="muted">Raw salary and account numbers are used only for this import flow; audit logs store redacted hashes.</p>
            </div>
            {workspace.preview ? (
              <span className={`badge ${workspace.preview.invalidCount ? "warning" : ""}`}>
                {workspace.preview.validCount} valid · {workspace.preview.invalidCount} invalid
              </span>
            ) : null}
          </div>

          {!workspace.preview ? (
            <EmptyState title="No preview yet" body="Paste CSV data and preview it before confirming payroll profile import." />
          ) : (
            <>
              <ul className="task-list">
                {workspace.preview.rows.map((row) => (
                  <li className="task request-task" key={`${row.rowNumber}-${row.employeeNo}`}>
                    <span>
                      <strong>
                        Row {row.rowNumber} · {row.employeeNo || "missing employeeNo"} · {row.employeeName ?? "unknown employee"}
                      </strong>
                      <small>
                        {row.taxResidency} · base {row.baseSalary ?? "invalid"} · bank {row.bankCode || "invalid"} · account ending {row.accountNumberLast4 ?? "invalid"}
                      </small>
                      {row.errors.map((message) => (
                        <small className="warning-text" key={message}>{message}</small>
                      ))}
                    </span>
                    <span className={`badge ${row.status === "invalid" ? "warning" : ""}`}>{row.status}</span>
                  </li>
                ))}
              </ul>

              <form action="/api/payroll/profile-import" method="post" className="mini-form">
                <input type="hidden" name="intent" value="import" />
                <input type="hidden" name="previewId" value={workspace.preview.id} />
                <button className="button primary" type="submit" disabled={workspace.preview.invalidCount > 0}>
                  Confirm import
                </button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
