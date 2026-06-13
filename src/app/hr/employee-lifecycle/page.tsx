import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getEmployeeLifecycleWorkspace } from "@/server/employees/lifecycle";

type SearchParams = Promise<{ error?: string }>;

export default async function EmployeeLifecyclePage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getEmployeeLifecycleWorkspace(session);
  const activeCount = workspace.employees.filter((employee) => employee.employmentStatus === "active").length;
  const onLeaveCount = workspace.employees.filter((employee) => employee.employmentStatus === "on_leave").length;
  const terminatedCount = workspace.employees.filter((employee) => employee.employmentStatus === "terminated").length;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Employee Lifecycle</h1>
        <p>Record transfers, promotions, leave, return, and termination changes with effective dates and audit logs.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to record lifecycle event</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Active</span>
          <strong>{activeCount}</strong>
          <span className="badge">Employees</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">On leave</span>
          <strong>{onLeaveCount}</strong>
          <span className="badge warning">Watch payroll</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Terminated</span>
          <strong>{terminatedCount}</strong>
          <span className="badge">History kept</span>
        </div>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Record change</h2>
              <p className="muted">Effective-dated changes update the employee profile and keep the event trail.</p>
            </div>
          </div>
          <form action="/api/employees/lifecycle" method="post" className="wizard-form">
            <label>
              Employee
              <select name="employeeId" required>
                {workspace.employees.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.employeeNo} · {employee.displayName} · {statusLabel(employee.employmentStatus)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event type
              <select name="eventType" required>
                <option value="transfer">Transfer</option>
                <option value="promotion">Promotion</option>
                <option value="leave">Leave of absence</option>
                <option value="return">Return to work</option>
                <option value="termination">Termination</option>
              </select>
            </label>
            <label>
              Effective date
              <input name="effectiveDate" type="date" defaultValue="2026-07-01" required />
            </label>
            <label>
              New department
              <select name="nextDepartmentId">
                <option value="">Keep current department</option>
                {workspace.departments.map((department) => (
                  <option value={department.id} key={department.id}>
                    {department.code} · {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              New job title
              <input name="nextJobTitle" placeholder="Leave blank to keep current title" />
            </label>
            <label>
              Reason
              <textarea name="reason" placeholder="Record the HR-approved reason or reference." required />
            </label>
            <button className="button primary" type="submit">
              Record lifecycle event
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <h2>Employee status</h2>
          <ul className="task-list">
            {workspace.employees.map((employee) => (
              <li className="task" key={employee.id}>
                <span>
                  <strong>{employee.displayName} · {employee.employeeNo}</strong>
                  <small>{employee.jobTitle}</small>
                </span>
                <span className={`badge ${employee.employmentStatus === "on_leave" ? "warning" : ""}`}>
                  {statusLabel(employee.employmentStatus)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12">
          <h2>Lifecycle timeline</h2>
          {workspace.events.length === 0 ? (
            <EmptyState title="No lifecycle events" body="Record employee changes here so payroll, access, and HR records stay aligned." />
          ) : (
            <ul className="task-list">
              {workspace.events.map((event) => (
                <li className="task request-task" key={event.id}>
                  <span>
                    <strong>
                      {event.employeeName} · {eventTypeLabel(event.eventType)}
                    </strong>
                    <small>{formatDate(event.effectiveDate)} · {event.reason}</small>
                    <small>
                      {event.previousJobTitle ?? "n/a"} → {event.nextJobTitle ?? "n/a"}
                      {event.nextDepartmentName ? ` · ${event.nextDepartmentName}` : ""}
                    </small>
                  </span>
                  <span className={`badge ${event.nextStatus === "on_leave" ? "warning" : ""}`}>
                    {event.nextStatus ? statusLabel(event.nextStatus) : eventTypeLabel(event.eventType)}
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

function eventTypeLabel(type: string) {
  switch (type) {
    case "promotion":
      return "Promotion";
    case "leave":
      return "Leave of absence";
    case "return":
      return "Return to work";
    case "termination":
      return "Termination";
    default:
      return "Transfer";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "on_leave":
      return "On leave";
    case "terminated":
      return "Terminated";
    default:
      return "Active";
  }
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
