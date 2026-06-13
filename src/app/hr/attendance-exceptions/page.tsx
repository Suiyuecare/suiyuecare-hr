import { getDemoSession } from "@/server/auth/demo-session";
import {
  listAttendanceExceptions,
  summarizeAttendanceExceptionResolution,
} from "@/server/attendance/exceptions";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function AttendanceExceptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const exceptions = await listAttendanceExceptions(session);
  const summary = summarizeAttendanceExceptionResolution(exceptions);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Attendance Exceptions</h1>
        <p>Resolve missing punches and working-time risks before payroll close.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update attendance exceptions</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Resolution rate</span>
          <strong>{summary.resolutionRate}%</strong>
          <span className={`badge ${summary.kpiReady ? "" : "warning"}`}>target 90%</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Pending</span>
          <strong>{summary.pendingCount}</strong>
          <span className="badge">before payroll</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Safe suggestions</span>
          <strong>{summary.autoResolvableCount}</strong>
          <span className="badge">HR confirms</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">High risk</span>
          <strong>{summary.highRiskCount}</strong>
          <span className={`badge ${summary.highRiskCount ? "danger" : ""}`}>legal review</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Monthly close readiness</h2>
              <p className="muted">{summary.detail}</p>
            </div>
            <form action="/api/attendance/exceptions" method="post">
              <input type="hidden" name="intent" value="resolve_safe" />
              <button className="button primary" type="submit" disabled={summary.autoResolvableCount === 0}>
                Apply safe suggestions
              </button>
            </form>
          </div>
          <p className="muted">
            Safe suggestions still require HR confirmation. Working-time risks are not auto-closed.
          </p>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Exception queue</h2>
              <p className="muted">Resolve warnings quickly; keep high-risk records reviewed before locking payroll.</p>
            </div>
            <span className="badge">{exceptions.length}</span>
          </div>
          {exceptions.length === 0 ? (
            <p className="muted">No attendance exceptions.</p>
          ) : (
            <ul className="task-list">
              {exceptions.map((exception) => (
                <li className="task" key={exception.id}>
                  <span>
                    <strong>{exception.employeeName}</strong>
                    <small>
                      {exception.exceptionType} · {exception.severity} ·{" "}
                      {exception.createdAt.toLocaleDateString("zh-TW")}
                    </small>
                    <small>{exception.suggestedResolution}</small>
                    {exception.resolvedAt ? (
                      <small>
                        Resolved {exception.resolvedAt.toLocaleDateString("zh-TW")} ·{" "}
                        {exception.resolutionCode}
                      </small>
                    ) : null}
                  </span>
                  {exception.status === "pending" ? (
                    <form action="/api/attendance/exceptions" method="post" className="inline-form">
                      <input type="hidden" name="intent" value="resolve" />
                      <input type="hidden" name="exceptionId" value={exception.id} />
                      <select
                        name="resolutionCode"
                        aria-label={`Resolution for ${exception.employeeName}`}
                        defaultValue={
                          exception.autoResolvable
                            ? "employee_self_correction_requested"
                            : "hr_reviewed_for_payroll"
                        }
                      >
                        <option value="employee_self_correction_requested">Correction requested</option>
                        <option value="hr_reviewed_for_payroll">HR reviewed</option>
                        <option value="worktime_legal_reviewed">Worktime reviewed</option>
                      </select>
                      <input
                        name="evidenceRef"
                        aria-label={`Evidence for ${exception.employeeName}`}
                        placeholder="evidence ref"
                      />
                      <input
                        name="comment"
                        aria-label={`Comment for ${exception.employeeName}`}
                        placeholder="private note"
                      />
                      <button className="button" type="submit">
                        Resolve
                      </button>
                    </form>
                  ) : (
                    <span className="badge">resolved</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
