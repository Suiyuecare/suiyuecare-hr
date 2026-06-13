import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getLaborRosterWorkspace } from "@/server/employees/labor-roster";

type SearchParams = Promise<{ error?: string }>;

export default async function LaborRosterPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getLaborRosterWorkspace(session);
  const firstEmployee = workspace.employees[0];

  return (
    <main className="page">
      <section className="page-header">
        <h1>Labor Roster</h1>
        <p>Keep Taiwan worker roster readiness complete without exposing national ID, address, or emergency contact values in audit logs.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to update labor roster</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-3 metric">
          <span className="muted">Coverage</span>
          <strong>{workspace.coverage.coverageRate}%</strong>
          <span className={`badge ${workspace.coverage.coverageRate >= 100 ? "" : "warning"}`}>target 100%</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Complete</span>
          <strong>{workspace.coverage.completeCount}/{workspace.coverage.employeeCount}</strong>
          <span className="badge">Labor roster</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Verified</span>
          <strong>{workspace.coverage.verifiedCount}</strong>
          <span className="badge">HR reviewed</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Missing</span>
          <strong>{workspace.coverage.missingCount}</strong>
          <span className={`badge ${workspace.coverage.missingCount ? "warning" : ""}`}>before launch</span>
        </div>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Roster wizard</h2>
              <p className="muted">Sensitive values are hashed before storage and audit evidence.</p>
            </div>
            <span className="badge">Article 7 readiness</span>
          </div>
          <form action="/api/employees/labor-roster" method="post" className="wizard-form" aria-label="Update labor roster">
            <label>
              Employee
              <select name="employeeId" defaultValue={firstEmployee?.id} required>
                {workspace.employees.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.employeeNo} · {employee.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-grid">
              <label>
                Legal name
                <input name="legalName" defaultValue={firstEmployee?.displayName ?? ""} required />
              </label>
              <label>
                National ID
                <input name="nationalId" placeholder="Stored as hash" required />
              </label>
            </div>
            <div className="field-grid">
              <label>
                Birth date
                <input name="birthDate" type="date" defaultValue="1990-01-01" required />
              </label>
              <label>
                Gender
                <select name="gender" defaultValue="female" required>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_disclosed">Not disclosed</option>
                </select>
              </label>
            </div>
            <label>
              Nationality
              <input name="nationality" defaultValue="TW" required />
            </label>
            <label>
              Registered address
              <input name="registeredAddress" placeholder="Stored as hash" required />
            </label>
            <label>
              Emergency contact
              <input name="emergencyContact" placeholder="Stored as hash" required />
            </label>
            <div className="field-grid">
              <label>
                Education summary
                <input name="educationSummary" defaultValue="Highest education evidence reviewed." />
              </label>
              <label>
                Work experience summary
                <input name="workExperienceSummary" defaultValue="Prior work experience reviewed." />
              </label>
            </div>
            <label>
              Source reference
              <input name="rosterSourceRef" defaultValue="demo://labor-roster/2026.01" />
            </label>
            <label>
              Verification status
              <select name="verificationStatus" defaultValue="verified">
                <option value="verified">Verified</option>
                <option value="needs_review">Needs review</option>
                <option value="unverified">Unverified</option>
              </select>
            </label>
            <button className="button primary" type="submit">
              Save roster profile
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>Roster readiness</h2>
              <p className="muted">Hash evidence proves collection without showing raw private values.</p>
            </div>
            <span className="badge">{workspace.profiles.length}</span>
          </div>
          {workspace.profiles.length === 0 ? (
            <EmptyState title="No active employees" body="Active employees will appear here." />
          ) : (
            <ul className="task-list">
              {workspace.profiles.map((profile) => (
                <li className="task request-task" key={profile.id}>
                  <span>
                    <strong>{profile.employeeName} · {profile.status}</strong>
                    <small>{profile.employeeNo} · {profile.jobTitle} · {profile.departmentName ?? "No department"}</small>
                    <small>Missing {profile.missingFields.length ? profile.missingFields.join(", ") : "none"}</small>
                    <small>
                      ID hash {shortHash(profile.nationalIdHash)} · address hash {shortHash(profile.registeredAddressHash)} · emergency hash {shortHash(profile.emergencyContactHash)}
                    </small>
                  </span>
                  <span className={`badge ${profile.status === "complete" ? "" : "warning"}`}>
                    {profile.verificationStatus}
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

function shortHash(value: string | null) {
  return value ? value.slice(0, 12) : "missing";
}
