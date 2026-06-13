import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getShiftTemplateSettings } from "@/server/scheduling/shift-templates";

type SearchParams = Promise<{
  error?: string;
}>;

const weekdays = [
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
  ["0", "Sun"],
];

export default async function ShiftTemplatesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const templates = await getShiftTemplateSettings(session);
  const activeTemplates = templates.filter((template) => template.status === "active");

  return (
    <main className="page">
      <section className="page-header">
        <h1>Shift Templates</h1>
        <p>Configure reusable shifts and generate daily schedules for active employees.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update shift templates</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Active templates</span>
          <strong>{activeTemplates.length}</strong>
          <span className="badge">Reusable</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Cross-midnight</span>
          <strong>{templates.filter((template) => template.crossesMidnight).length}</strong>
          <span className="badge warning">Review</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Generated schedules</span>
          <strong>{templates.reduce((sum, template) => sum + template.scheduleCount, 0)}</strong>
          <span className="badge">Audited</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Template wizard</h2>
              <p className="muted">Define start/end time once, then generate schedules without editing individual records.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <form action="/api/scheduling/shift-templates" method="post" className="wizard-form">
            <div className="field-grid">
              <label>
                Code
                <input name="code" defaultValue="regular" required />
              </label>
              <label>
                Name
                <input name="name" defaultValue="Regular 09:00-18:00" required />
              </label>
              <label>
                Status
                <select name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label>
                Break minutes
                <input name="breakMinutes" type="number" min="0" step="1" defaultValue="60" />
              </label>
              <label>
                Start time
                <input name="startTime" type="time" defaultValue="09:00" required />
              </label>
              <label>
                End time
                <input name="endTime" type="time" defaultValue="18:00" required />
              </label>
            </div>

            <div className="toggle-row">
              {weekdays.map(([value, label]) => (
                <label key={value}>
                  <input name="eligibleWeekdays" type="checkbox" value={value} defaultChecked={value !== "0" && value !== "6"} />
                  {label}
                </label>
              ))}
            </div>

            <label>
              Notes
              <textarea name="notes" defaultValue="Review against company calendar and attendance policy before generation." />
            </label>

            <button className="button primary" type="submit">
              Save shift template
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Generate schedules</h2>
              <p className="muted">Creates or updates one day of schedules for all active employees.</p>
            </div>
            <span className="badge warning">Audited</span>
          </div>
          {activeTemplates.length === 0 ? (
            <EmptyState title="No active templates" body="Create an active shift template before generating schedules." />
          ) : (
            <form action="/api/scheduling/generate" method="post" className="mini-form">
              <div className="field-grid">
                <label>
                  Shift template
                  <select name="shiftTemplateId">
                    {activeTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.code} · {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Work date
                  <input name="workDate" type="date" defaultValue={today()} required />
                </label>
              </div>
              <label>
                <input name="overwriteExisting" type="checkbox" defaultChecked />
                Overwrite existing schedules for that date
              </label>
              <button className="button primary" type="submit">
                Generate schedules
              </button>
            </form>
          )}
        </section>

        <section className="panel span-12">
          <h2>Configured templates</h2>
          {templates.length === 0 ? (
            <EmptyState title="No shift templates" body="Create the first shift template before scheduling employees." />
          ) : (
            <ul className="task-list">
              {templates.map((template) => (
                <li className="task" key={template.id}>
                  <span>
                    <strong>
                      {template.name} · {template.code}
                    </strong>
                    <small>
                      {template.startTime}-{template.endTime} · {formatHours(template.scheduledMinutes)} · {template.eligibleWeekdays.length} weekday(s)
                      {template.crossesMidnight ? " · crosses midnight" : ""}
                    </small>
                  </span>
                  <span className={`badge ${template.status === "inactive" || template.crossesMidnight ? "warning" : ""}`}>
                    {template.status} · {template.scheduleCount}
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
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}
