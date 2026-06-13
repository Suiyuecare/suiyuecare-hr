import { DashboardLink } from "@/components/DashboardLink";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getEmployeeAttendanceRecordWorkspace } from "@/server/attendance/employee-records";
import { getEmployeeAttendanceSignoffWorkspace } from "@/server/attendance/signoffs";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function EmployeeAttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const [workspace, signoffWorkspace] = await Promise.all([
    getEmployeeAttendanceRecordWorkspace(session),
    getEmployeeAttendanceSignoffWorkspace(session),
  ]);
  const { policy, records } = workspace;

  return (
    <>
      <main className="page mobile-page">
        <section className="page-header">
          <h1>Attendance Records</h1>
          <p>{session.employee?.displayName ?? "Demo employee"} can review recent work-time records without asking HR.</p>
        </section>

        <section className="grid">
          {params.error ? (
            <div className="panel span-12 risk-box danger-box">
              <strong>Unable to sign attendance</strong>
              <p>{params.error}</p>
            </div>
          ) : null}

          <div className="panel span-12 today-card">
            <div>
              <span className="muted">Record access</span>
              <h2>{policy.employeeSelfServiceEnabled ? "Self-service enabled" : "Self-service paused"}</h2>
              <p className="muted">
                Retention {policy.attendanceRecordRetentionDays} days · export {policy.employeeExportEnabled ? "available" : "paused"}
              </p>
            </div>
            <span className={`badge ${policy.employeeSelfServiceEnabled ? "" : "danger"}`}>
              {policy.employeeSelfServiceEnabled ? "Employee view" : "HR action needed"}
            </span>
          </div>

          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>Monthly sign-off</h2>
                <p className="muted">
                  {formatDate(signoffWorkspace.periodStart)} to {formatDate(signoffWorkspace.periodEnd)}
                </p>
              </div>
              <span className={`badge ${signoffWorkspace.signoff ? "" : "warning"}`}>
                {signoffWorkspace.signoff ? "Signed" : "Needs review"}
              </span>
            </div>
            <div className="payroll-preview">
              <div className="metric">
                <span className="muted">Records</span>
                <strong>{signoffWorkspace.recordCount}</strong>
              </div>
              <div className="metric">
                <span className="muted">Exceptions</span>
                <strong>{signoffWorkspace.exceptionCount}</strong>
              </div>
              <div className="metric">
                <span className="muted">Open</span>
                <strong>{signoffWorkspace.openExceptionCount}</strong>
              </div>
            </div>
            {signoffWorkspace.signoff ? (
              <p className="muted">
                Signed {signoffWorkspace.signoff.signedAt.toLocaleDateString("zh-TW")} · hash{" "}
                {signoffWorkspace.signoff.summaryHash.slice(0, 12)}
              </p>
            ) : (
              <form action="/api/attendance/signoffs" method="post">
                <input type="hidden" name="periodStart" value={formatDate(signoffWorkspace.periodStart)} />
                <input type="hidden" name="periodEnd" value={formatDate(signoffWorkspace.periodEnd)} />
                <button className="button primary" type="submit" disabled={signoffWorkspace.openExceptionCount > 0}>
                  Sign off attendance
                </button>
              </form>
            )}
          </section>

          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>Recent records</h2>
                <p className="muted">Last 31 recorded work days.</p>
              </div>
              <span className="badge">{records.length} day(s)</span>
            </div>

            {!policy.employeeSelfServiceEnabled ? (
              <EmptyState
                title="Attendance access is paused"
                body="HR needs to enable employee self-service access in attendance policy settings."
              />
            ) : records.length === 0 ? (
              <EmptyState title="No attendance records" body="Clock in or ask HR to review missing records." />
            ) : (
              <ul className="task-list">
                {records.map((record) => (
                  <li className="task" key={record.id}>
                    <span>
                      <strong>{formatDate(record.workDate)}</strong>
                      <small>
                        {formatTime(record.clockInAt)} / {formatTime(record.clockOutAt)}
                      </small>
                      <small>
                        source {record.clockInSource ?? "missing"} / {record.clockOutSource ?? "missing"}
                      </small>
                    </span>
                    <span className={`badge ${record.status === "complete" ? "" : "warning"}`}>{record.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </main>

      <nav className="bottom-nav" aria-label="Employee mobile navigation">
        <DashboardLink href="/app" label="Home" />
        <DashboardLink href="/app/attendance" label="Time" />
        <DashboardLink href="/app/documents" label="Docs" />
        <DashboardLink href="/app/payslip" label="Payslip" />
        <DashboardLink href="/manager/inbox" label="Inbox" />
      </nav>
    </>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(date: Date | null) {
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).format(date);
}
