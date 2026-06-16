import { getDemoSession } from "@/server/auth/session";
import { getAttendanceSignoffCoverage } from "@/server/attendance/signoffs";

export default async function AttendanceSignoffsPage() {
  const session = await getDemoSession();
  const coverage = await getAttendanceSignoffCoverage(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Attendance Sign-offs</h1>
        <p>Track employee confirmation of monthly attendance records before payroll close.</p>
      </section>

      <section className="grid">
        <div className="panel span-3 metric">
          <span className="muted">Coverage</span>
          <strong>{coverage.coverageRate}%</strong>
          <span className={`badge ${coverage.readyForPayroll ? "" : "warning"}`}>target 90%</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Signed</span>
          <strong>{coverage.signedCount}</strong>
          <span className="badge">of {coverage.employeeCount}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Missing</span>
          <strong>{coverage.missingCount}</strong>
          <span className={`badge ${coverage.missingCount ? "warning" : ""}`}>employees</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Open exceptions</span>
          <strong>{coverage.openExceptionCount}</strong>
          <span className={`badge ${coverage.openExceptionCount ? "danger" : ""}`}>before lock</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Payroll readiness</h2>
              <p className="muted">
                {formatDate(coverage.periodStart)} to {formatDate(coverage.periodEnd)}
              </p>
            </div>
            <span className={`badge ${coverage.readyForPayroll ? "" : "warning"}`}>
              {coverage.readyForPayroll ? "Ready" : "Action needed"}
            </span>
          </div>
          <p className="muted">
            Require employee confirmation before payroll close to reduce attendance disputes and keep audit evidence.
          </p>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Signed employees</h2>
              <p className="muted">Sign-off logs contain hashes and counts, not raw attendance details.</p>
            </div>
            <span className="badge">{coverage.signoffs.length}</span>
          </div>
          {coverage.signoffs.length === 0 ? (
            <p className="muted">No employee sign-offs yet.</p>
          ) : (
            <ul className="task-list">
              {coverage.signoffs.map((signoff) => (
                <li className="task" key={signoff.id}>
                  <span>
                    <strong>{signoff.employeeName}</strong>
                    <small>
                      {signoff.recordCount} record(s) · {signoff.exceptionCount} exception(s) · signed{" "}
                      {signoff.signedAt.toLocaleDateString("zh-TW")}
                    </small>
                    <small>Hash {signoff.summaryHash.slice(0, 12)}</small>
                  </span>
                  <span className="badge">{signoff.source}</span>
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
