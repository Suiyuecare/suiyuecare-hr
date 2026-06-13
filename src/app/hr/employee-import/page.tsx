import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getEmployeeImportWorkspace } from "@/server/employees/imports";

type SearchParams = Promise<{ error?: string; imported?: string; preview?: string }>;

const sampleCsv = `employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo
E006,王小明,QA Engineer,ENG,2026-07-01,E002
E007,鄭小美,HR Specialist,POPS,2026-07-01,E001`;

export default async function EmployeeImportPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, imported, preview }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getEmployeeImportWorkspace(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Employee Import</h1>
        <p>Preview, validate, and import employee master data without engineering support.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to import employees</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {imported ? (
        <div className="panel success-panel">
          <strong>Employees imported</strong>
          <p>Employee records were created and audit logs were written.</p>
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
              <p className="muted">Required headers: employeeNo, displayName, jobTitle, departmentCode, hireDate.</p>
            </div>
          </div>
          <form action="/api/employees/import" method="post" className="wizard-form">
            <input type="hidden" name="intent" value="preview" />
            <label>
              CSV content
              <textarea name="rawCsv" defaultValue={workspace.preview?.rawCsv ?? sampleCsv} rows={8} required />
            </label>
            <button className="button primary" type="submit">
              Preview import
            </button>
          </form>
        </section>

        <section className="panel span-5">
          <h2>Department codes</h2>
          <ul className="task-list">
            {workspace.departments.map((department) => (
              <li className="task" key={department.id}>
                <span>
                  <strong>{department.code}</strong>
                  <small>{department.name}</small>
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
              <p className="muted">Invalid rows must be fixed before importing.</p>
            </div>
            {workspace.preview ? (
              <span className={`badge ${workspace.preview.invalidCount ? "warning" : ""}`}>
                {workspace.preview.validCount} valid · {workspace.preview.invalidCount} invalid
              </span>
            ) : null}
          </div>

          {!workspace.preview ? (
            <EmptyState title="No preview yet" body="Paste CSV data and preview it before confirming an import." />
          ) : (
            <>
              <ul className="task-list">
                {workspace.preview.rows.map((row) => (
                  <li className="task request-task" key={`${row.rowNumber}-${row.employeeNo}`}>
                    <span>
                      <strong>
                        Row {row.rowNumber} · {row.employeeNo || "missing employeeNo"} · {row.displayName || "missing name"}
                      </strong>
                      <small>
                        {row.jobTitle || "missing title"} · {(row.departmentName ?? row.departmentCode) || "unknown department"} · {row.hireDate ? formatDate(row.hireDate) : "invalid date"}
                      </small>
                      {row.errors.map((message) => (
                        <small className="warning-text" key={message}>{message}</small>
                      ))}
                    </span>
                    <span className={`badge ${row.status === "invalid" ? "warning" : ""}`}>{row.status}</span>
                  </li>
                ))}
              </ul>

              <form action="/api/employees/import" method="post" className="mini-form">
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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
