import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import {
  evaluateAttendanceRecordkeepingReadiness,
  getAttendancePolicySettings,
  minimumAttendanceRetentionDays,
} from "@/server/attendance/policies";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function AttendancePoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const policies = await getAttendancePolicySettings(session);
  const activePolicy = policies.find((policy) => policy.status === "active");
  const recordkeeping = evaluateAttendanceRecordkeepingReadiness(activePolicy);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Attendance Policies</h1>
        <p>Configure attendance thresholds, overtime warnings, punch controls, and approval guardrails.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to save attendance policy</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Active policy</span>
          <strong>{activePolicy?.name ?? "None"}</strong>
          <span className="badge">Versioned</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Regular daily work</span>
          <strong>{formatHours(activePolicy?.regularDailyMinutes ?? 0)}</strong>
          <span className="badge">Configurable</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Overtime warning</span>
          <strong>{formatHours(activePolicy?.overtimeWarningDailyMinutes ?? 0)}</strong>
          <span className="badge warning">Risk card</span>
        </div>
        <div className="panel span-12 risk-box">
          <div className="section-heading">
            <div>
              <h2>Attendance recordkeeping</h2>
              <p className="muted">{recordkeeping.detail}</p>
            </div>
            <span className={`badge ${recordkeeping.ready ? "" : "danger"}`}>
              {recordkeeping.ready ? "Ready" : "Action needed"}
            </span>
          </div>
          {recordkeeping.missing.length ? (
            <ul className="task-list compact">
              {recordkeeping.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge danger">Required</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Policy wizard</h2>
              <p className="muted">Create a new effective policy instead of editing code. Review legal/company rules before activation.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <form action="/api/attendance/policies" method="post" className="wizard-form">
            <div className="section-heading compact-heading">
              <div>
                <h3>1. Effective policy</h3>
              </div>
              <span className="badge">Required</span>
            </div>
            <div className="field-grid">
              <label>
                Name
                <input name="name" defaultValue="Standard office attendance" required />
              </label>
              <label>
                Status
                <select name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label>
                Effective from
                <input name="effectiveFrom" type="date" defaultValue={today()} required />
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>2. Time thresholds</h3>
              </div>
              <span className="badge">Minutes</span>
            </div>
            <div className="field-grid">
              <label>
                Regular daily minutes
                <input name="regularDailyMinutes" type="number" min="1" step="1" defaultValue="540" required />
              </label>
              <label>
                Overtime warning minutes
                <input name="overtimeWarningDailyMinutes" type="number" min="1" step="1" defaultValue="720" required />
              </label>
              <label>
                Clock-in grace minutes
                <input name="clockInGraceMinutes" type="number" min="0" step="1" defaultValue="5" />
              </label>
              <label>
                Clock-out grace minutes
                <input name="clockOutGraceMinutes" type="number" min="0" step="1" defaultValue="5" />
              </label>
            </div>

            <div className="toggle-row">
              <label>
                <input name="requireOvertimeApproval" type="checkbox" defaultChecked />
                Overtime approval required
              </label>
              <label>
                <input name="requirePunchCorrectionApproval" type="checkbox" defaultChecked />
                Punch correction approval required
              </label>
              <label>
                <input name="allowMobilePunch" type="checkbox" defaultChecked />
                Mobile punch allowed
              </label>
            </div>
            <div className="section-heading compact-heading">
              <div>
                <h3>3. Recordkeeping</h3>
              </div>
              <span className="badge">Labor records</span>
            </div>
            <div className="field-grid">
              <label>
                Attendance record retention days
                <input
                  name="attendanceRecordRetentionDays"
                  type="number"
                  min={minimumAttendanceRetentionDays}
                  step="1"
                  defaultValue={activePolicy?.attendanceRecordRetentionDays ?? minimumAttendanceRetentionDays}
                />
              </label>
            </div>
            <div className="toggle-row">
              <label>
                <input name="employeeSelfServiceEnabled" type="checkbox" defaultChecked={activePolicy?.employeeSelfServiceEnabled ?? true} />
                Employee self-service access
              </label>
              <label>
                <input name="employeeExportEnabled" type="checkbox" defaultChecked={activePolicy?.employeeExportEnabled ?? true} />
                Employee export access
              </label>
            </div>

            <button className="button primary" type="submit">
              Save attendance policy
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Configured policies</h2>
          {policies.length === 0 ? (
            <EmptyState title="No attendance policies" body="Create one policy before opening attendance operations." />
          ) : (
            <ul className="task-list">
              {policies.map((policy) => (
                <li className="task" key={policy.id}>
                  <span>
                    <strong>
                      {policy.name} · {policy.status}
                    </strong>
                    <small>
                      regular {formatHours(policy.regularDailyMinutes)} · warning {formatHours(policy.overtimeWarningDailyMinutes)} · effective {formatDate(policy.effectiveFrom)}
                    </small>
                    <small>
                      retention {policy.attendanceRecordRetentionDays} days · employee access {policy.employeeSelfServiceEnabled ? "on" : "off"} · export {policy.employeeExportEnabled ? "on" : "off"}
                    </small>
                  </span>
                  <span className={`badge ${policy.status === "inactive" ? "warning" : ""}`}>
                    grace {policy.clockInGraceMinutes}/{policy.clockOutGraceMinutes}
                  </span>
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

function formatHours(minutes: number) {
  if (!minutes) return "n/a";
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
