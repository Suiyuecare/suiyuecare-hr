import { DashboardLink } from "@/components/DashboardLink";
import { getDemoSession } from "@/server/auth/demo-session";
import { getEmployeeWorkspace } from "@/server/workflows/service";
import type { FormField, FormTemplateView, WorkflowRequest } from "@/server/workflows/types";

export default async function EmployeeHomePage() {
  const session = await getDemoSession();
  const workspace = await getEmployeeWorkspace(session);
  const today = toInputDate(new Date());
  const pendingRequests = workspace.requests.filter((request) => request.status === "pending");

  return (
    <>
      <main className="page mobile-page">
        <section className="page-header">
          <h1>Today</h1>
          <p>
            {session.employee?.displayName ?? "Demo employee"} ·{" "}
            {session.employee?.department?.name ?? "Product Engineering"}
          </p>
        </section>

        <section className="grid">
          <div className="panel span-12 today-card">
            <div>
              <span className="muted">Shift</span>
              <h2>{workspace.attendance.shiftName}</h2>
              <p className="muted">
                {formatTime(workspace.attendance.scheduledStart)}-
                {formatTime(workspace.attendance.scheduledEnd)}
              </p>
            </div>
            <div className="today-status">
              <span className="badge">{labelStatus(workspace.attendance.status)}</span>
              <strong>
                {workspace.attendance.clockInAt
                  ? formatTime(workspace.attendance.clockInAt)
                  : "--:--"}
                {" / "}
                {workspace.attendance.clockOutAt
                  ? formatTime(workspace.attendance.clockOutAt)
                  : "--:--"}
              </strong>
            </div>
            <div className="action-row">
              <form action="/api/workflows/clock-in" method="post">
                <input type="hidden" name="source" value="mobile" />
                <button className="button primary" type="submit">
                  Clock in
                </button>
              </form>
              <form action="/api/workflows/clock-out" method="post">
                <input type="hidden" name="source" value="mobile" />
                <button className="button" type="submit">
                  Clock out
                </button>
              </form>
            </div>
          </div>

          <div className="panel span-6 metric">
            <span className="muted">Annual leave</span>
            <strong>{workspace.leaveBalance.remainingUnits}</strong>
            <span className="badge">{workspace.leaveBalance.pendingUnits} pending</span>
            {workspace.leaveBalance.carryoverUnits ? (
              <small className="muted">
                {Math.max(
                  0,
                  workspace.leaveBalance.carryoverUnits - (workspace.leaveBalance.carryoverUsedUnits ?? 0),
                )} carried over first
              </small>
            ) : null}
          </div>

          <div className="panel span-6 metric">
            <span className="muted">Pending requests</span>
            <strong>{pendingRequests.length}</strong>
            <span className="badge">Manager Inbox</span>
          </div>

          <section className="panel span-12" aria-labelledby="quick-actions">
            <h2 id="quick-actions">Quick actions</h2>
            <div className="form-stack">
              <form
                action="/api/workflows/leave"
                method="post"
                className="mini-form"
                aria-label="Submit leave"
              >
                <h3>Leave</h3>
                <div className="field-grid">
                  <label>
                    Start date
                    <input name="startDate" type="date" defaultValue={today} required />
                  </label>
                  <label>
                    Start time
                    <input name="startTime" type="time" defaultValue="09:00" required />
                  </label>
                  <label>
                    End date
                    <input name="endDate" type="date" defaultValue={today} required />
                  </label>
                  <label>
                    End time
                    <input name="endTime" type="time" defaultValue="18:00" required />
                  </label>
                  <label>
                    Units
                    <input name="units" type="number" min="0.5" step="0.5" defaultValue="1" required />
                  </label>
                  <label>
                    Attachment
                    <input disabled placeholder="Placeholder" />
                  </label>
                </div>
                <label>
                  Reason
                  <input name="reason" placeholder="Family care, personal leave..." required />
                </label>
                <button className="button primary" type="submit">
                  Submit leave
                </button>
              </form>

              <form
                action="/api/workflows/overtime"
                method="post"
                className="mini-form"
                aria-label="Submit overtime"
              >
                <h3>Overtime</h3>
                <div className="field-grid">
                  <label>
                    Start date
                    <input name="startDate" type="date" defaultValue={today} required />
                  </label>
                  <label>
                    Start time
                    <input name="startTime" type="time" defaultValue="18:30" required />
                  </label>
                  <label>
                    End date
                    <input name="endDate" type="date" defaultValue={today} required />
                  </label>
                  <label>
                    End time
                    <input name="endTime" type="time" defaultValue="20:00" required />
                  </label>
                </div>
                <label>
                  Reason
                  <input name="reason" placeholder="Release support..." required />
                </label>
                <button className="button primary" type="submit">
                  Submit overtime
                </button>
              </form>

              <form
                action="/api/workflows/punch-correction"
                method="post"
                className="mini-form"
                aria-label="Submit punch correction"
              >
                <h3>Punch correction</h3>
                <div className="field-grid">
                  <label>
                    Work date
                    <input name="workDate" type="date" defaultValue={today} required />
                  </label>
                  <label>
                    Clock in
                    <input name="clockInTime" type="time" defaultValue="09:02" />
                  </label>
                  <label>
                    Clock out
                    <input name="clockOutTime" type="time" defaultValue="18:04" />
                  </label>
                </div>
                <label>
                  Reason
                  <input name="reason" placeholder="Forgot to punch on mobile..." required />
                </label>
                <button className="button primary" type="submit">
                  Submit correction
                </button>
              </form>
            </div>
          </section>

          <section className="panel span-12" aria-labelledby="custom-forms">
            <div className="section-heading">
              <div>
                <h2 id="custom-forms">Forms</h2>
                <p className="muted">Send HR requests without hunting through menus.</p>
              </div>
              <span className="badge">{workspace.formTemplates.length} active</span>
            </div>
            {workspace.formTemplates.length === 0 ? (
              <p className="muted">No custom forms are active.</p>
            ) : (
              <div className="form-stack">
                {workspace.formTemplates.map((template) => (
                  <CustomForm key={template.id} template={template} today={today} />
                ))}
              </div>
            )}
          </section>

          <section className="panel span-12" id="requests">
            <h2>Request status</h2>
            {workspace.requests.length === 0 ? (
              <p className="muted">No requests yet.</p>
            ) : (
              <ul className="task-list">
                {workspace.requests.map((request) => (
                  <RequestItem key={request.id} request={request} />
                ))}
              </ul>
            )}
          </section>

          <section className="panel span-12">
            <h2>Notifications</h2>
            {workspace.notifications.length === 0 ? (
              <p className="muted">No notifications.</p>
            ) : (
              <ul className="task-list">
                {workspace.notifications.map((notification) => (
                  <li className="task" key={notification.id}>
                    <span>
                      <strong>{notification.title}</strong>
                      <small>{notification.body}</small>
                    </span>
                    <span className="badge">{notification.status}</span>
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
        <DashboardLink href="/app/training" label="Training" />
        <DashboardLink href="/app/privacy" label="Privacy" />
        <DashboardLink href="/app/payslip" label="Payslip" />
        <DashboardLink href="/manager/inbox" label="Inbox" />
      </nav>
    </>
  );
}

function RequestItem({ request }: { request: WorkflowRequest }) {
  return (
    <li className="task request-task">
      <div>
        <strong>{request.title}</strong>
        <small>{request.detail}</small>
        {request.currentStepLabel ? <small>Current step: {request.currentStepLabel}</small> : null}
        <ol className="timeline">
          {request.timeline.map((item) => (
            <li key={item.id}>
              {item.action} · {item.actorName}
              {item.comment ? ` · ${item.comment}` : ""}
            </li>
          ))}
        </ol>
      </div>
      <span className={`badge ${request.status === "rejected" ? "danger" : ""}`}>
        {request.status}
      </span>
    </li>
  );
}

function CustomForm({ template, today }: { template: FormTemplateView; today: string }) {
  return (
    <form
      action="/api/forms/submissions"
      method="post"
      className="mini-form"
      aria-label={`Submit ${template.title}`}
    >
      <input type="hidden" name="templateId" value={template.id} />
      <div>
        <h3>{template.title}</h3>
        <p className="muted">{template.description}</p>
      </div>
      <div className="field-grid">
        {template.fields.map((field) => (
          <FormFieldInput key={field.id} field={field} today={today} />
        ))}
      </div>
      <button className="button primary" type="submit">
        Submit form
      </button>
    </form>
  );
}

function FormFieldInput({ field, today }: { field: FormField; today: string }) {
  const commonProps = {
    name: field.id,
    required: field.required,
  };

  if (field.type === "textarea") {
    return (
      <label>
        {field.label}
        <textarea {...commonProps} placeholder={field.label} />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label>
        {field.label}
        <select {...commonProps} defaultValue="">
          <option value="" disabled>
            Select
          </option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="check-row">
        <input name={field.id} type="checkbox" value="yes" />
        {field.label}
      </label>
    );
  }

  if (field.type === "file") {
    return (
      <label>
        {field.label}
        <input disabled placeholder="Attachment placeholder" />
      </label>
    );
  }

  return (
    <label>
      {field.label}
      <input
        {...commonProps}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        defaultValue={field.type === "date" ? today : undefined}
        placeholder={field.label}
      />
    </label>
  );
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function labelStatus(status: string) {
  if (status === "clocked_in") return "Clocked in";
  if (status === "complete") return "Complete";
  if (status === "corrected") return "Corrected";
  return "Ready";
}
