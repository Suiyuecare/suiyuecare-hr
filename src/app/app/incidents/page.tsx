import { getDemoSession } from "@/server/auth/session";
import { getIncidentWorkspace } from "@/server/incidents/workplace";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function EmployeeIncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getIncidentWorkspace(session);

  return (
    <main className="page mobile-page">
      <section className="page-header">
        <h1>Report</h1>
        <p>Report safety hazards, accidents, harassment, or workplace violence. HR will review confidential reports.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to submit report</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>New report</h2>
              <p className="muted">Use plain facts. Do not include national ID, bank, medical diagnosis, or unrelated personal details.</p>
            </div>
            <span className={`badge ${workspace.settings.reportingEnabled ? "" : "danger"}`}>
              {workspace.settings.reportingEnabled ? "Open" : "Paused"}
            </span>
          </div>
          <form action="/api/incidents" method="post" className="mini-form">
            <input type="hidden" name="intent" value="report" />
            <div className="field-grid">
              <label>
                Type
                <select name="incidentType" defaultValue="safety_hazard">
                  <option value="safety_hazard">Safety hazard</option>
                  <option value="near_miss">Near miss</option>
                  <option value="occupational_accident">Occupational accident</option>
                  <option value="harassment">Harassment</option>
                  <option value="workplace_violence">Workplace violence</option>
                </select>
              </label>
              <label>
                Severity
                <select name="severity" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="severe">Severe</option>
                </select>
              </label>
              <label>
                Occurred at
                <input name="occurredAt" type="datetime-local" defaultValue={toDateTimeLocal(new Date())} required />
              </label>
              <label>
                Location
                <input name="location" placeholder="Office, site, remote" />
              </label>
            </div>
            <label>
              What happened?
              <textarea name="summary" rows={4} placeholder="Describe what happened and what needs follow-up." required />
            </label>
            <label className="check-row">
              <input name="confidential" type="checkbox" defaultChecked />
              Mark confidential
            </label>
            <button className="button primary" type="submit" disabled={!workspace.settings.reportingEnabled}>
              Submit report
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>My reports</h2>
              <p className="muted">Track review status without deep menus.</p>
            </div>
            <span className="badge">{workspace.incidents.length}</span>
          </div>
          <ul className="task-list">
            {workspace.incidents.length === 0 ? (
              <li className="task">
                <span>No reports submitted.</span>
                <span className="badge">Clear</span>
              </li>
            ) : null}
            {workspace.incidents.map((incident) => (
              <li className="task" key={incident.id}>
                <span>
                  <strong>{incident.incidentType.replaceAll("_", " ")}</strong>
                  <small>
                    {incident.severity} · {incident.status} · due {incident.investigationDueAt.toLocaleDateString("zh-TW")}
                  </small>
                  <small>{incident.correctiveAction ?? incident.summary}</small>
                </span>
                <span className={`badge ${incident.status === "submitted" ? "warning" : ""}`}>{incident.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function toDateTimeLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
