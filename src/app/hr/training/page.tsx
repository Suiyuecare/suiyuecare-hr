import { getDemoSession } from "@/server/auth/session";
import { getTrainingWorkspace } from "@/server/training/compliance";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function TrainingCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getTrainingWorkspace(session);
  const { settings, readiness } = workspace;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Training Center</h1>
        <p>Keep first-week onboarding short, track required acknowledgements, and keep evidence ready for launch.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update training</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Readiness</span>
          <strong>{readiness.ready ? "Ready" : "Open"}</strong>
          <span className={`badge ${readiness.ready ? "" : "warning"}`}>{settings.verificationStatus}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Required minutes</span>
          <strong>{readiness.requiredMinutes}</strong>
          <span className={`badge ${readiness.requiredMinutes > settings.maxFirstWeekMinutes ? "danger" : ""}`}>
            target {settings.maxFirstWeekMinutes}
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Assignments</span>
          <strong>{readiness.assignedCount}</strong>
          <span className="badge">{readiness.completedCount} done</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Overdue</span>
          <strong>{readiness.overdueCount}</strong>
          <span className={`badge ${readiness.overdueCount > 0 ? "danger" : ""}`}>required</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Training readiness</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <form action="/api/training" method="post">
              <input type="hidden" name="intent" value="assign_required" />
              <button className="button primary" type="submit">
                Assign required training
              </button>
            </form>
          </div>
          {readiness.missing.length > 0 ? (
            <ul className="task-list">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge warning">Open</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Training plan is short, assigned, reviewed, and not overdue.</p>
          )}
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Training controls</h2>
              <p className="muted">Use the target minutes to keep first-week rollout training under the KPI.</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/training" method="post" className="mini-form">
            <input type="hidden" name="intent" value="settings" />
            <label className="check-row">
              <input
                name="onboardingTrainingRequired"
                type="checkbox"
                defaultChecked={settings.onboardingTrainingRequired}
              />
              Require onboarding training
            </label>
            <label className="check-row">
              <input name="autoAssignNewHires" type="checkbox" defaultChecked={settings.autoAssignNewHires} />
              Auto-assign new hires
            </label>
            <div className="field-grid">
              <label>
                Completion target days
                <input name="targetCompletionDays" type="number" min="1" max="30" defaultValue={settings.targetCompletionDays} />
              </label>
              <label>
                First-week minute target
                <input name="maxFirstWeekMinutes" type="number" min="1" max="60" defaultValue={settings.maxFirstWeekMinutes} />
              </label>
              <label>
                Verification status
                <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label>
                Last reviewed
                <input value={settings.lastReviewedAt?.toISOString() ?? "Not reviewed"} readOnly />
              </label>
            </div>
            <button className="button primary" type="submit">
              Save training controls
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>Course wizard</h2>
              <p className="muted">Create short, task-focused training. Keep employee copy plain and practical.</p>
            </div>
            <span className="badge">No engineering</span>
          </div>
          <form action="/api/training" method="post" className="mini-form">
            <input type="hidden" name="intent" value="course" />
            <div className="field-grid">
              <label>
                Title
                <input name="title" defaultValue="HR One basics and data safety" required />
              </label>
              <label>
                Category
                <input name="category" defaultValue="Onboarding" required />
              </label>
              <label>
                Version
                <input name="version" defaultValue="2026.01" required />
              </label>
              <label>
                Estimated minutes
                <input name="estimatedMinutes" type="number" min="1" max="60" defaultValue="8" />
              </label>
              <label>
                Status
                <select name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label>
                Source reference
                <input name="sourceRef" defaultValue="demo://training/hr-one-basics" />
              </label>
            </div>
            <label>
              Description
              <textarea
                name="description"
                rows={4}
                defaultValue="A short guided walkthrough for clocking in, requesting leave, checking payslips, and protecting personal data."
                required
              />
            </label>
            <label className="check-row">
              <input name="requiredForOnboarding" type="checkbox" defaultChecked />
              Required for onboarding
            </label>
            <button className="button primary" type="submit">
              Save course
            </button>
          </form>
        </section>

        <section className="panel span-6">
          <div className="section-heading">
            <div>
              <h2>Courses</h2>
              <p className="muted">Active onboarding courses count toward the first-week training KPI.</p>
            </div>
            <span className="badge">{workspace.courses.length}</span>
          </div>
          <ul className="task-list">
            {workspace.courses.map((course) => (
              <li className="task" key={course.id}>
                <span>
                  <strong>{course.title}</strong>
                  <small>
                    {course.category} · {course.version} · {course.estimatedMinutes} min
                  </small>
                  <small>{course.description}</small>
                </span>
                <span className={`badge ${course.status === "inactive" ? "warning" : ""}`}>
                  {course.status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="section-heading">
            <div>
              <h2>Assignments</h2>
              <p className="muted">Employee completion evidence for required onboarding training.</p>
            </div>
            <span className="badge">{workspace.assignments.length}</span>
          </div>
          <ul className="task-list">
            {workspace.assignments.map((assignment) => (
              <li className="task" key={assignment.id}>
                <span>
                  <strong>
                    {assignment.employeeName} · {assignment.courseTitle}
                  </strong>
                  <small>
                    {assignment.courseVersion} · due {assignment.dueAt.toLocaleDateString("zh-TW")}
                  </small>
                </span>
                <span className={`badge ${assignment.status === "assigned" ? "warning" : ""}`}>
                  {assignment.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
