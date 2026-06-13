import { getDemoSession } from "@/server/auth/demo-session";
import { getTrainingWorkspace } from "@/server/training/compliance";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function EmployeeTrainingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getTrainingWorkspace(session);
  const openAssignments = workspace.assignments.filter((assignment) => assignment.status !== "completed");

  return (
    <main className="page mobile-page">
      <section className="page-header">
        <h1>Training</h1>
        <p>Short tasks to help you finish HR One onboarding without a long class.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update training</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <section className="panel span-12 today-card">
          <div>
            <span className="muted">Open training</span>
            <h2>{openAssignments.length}</h2>
            <p className="muted">
              Target {workspace.settings.maxFirstWeekMinutes} minutes in the first week.
            </p>
          </div>
          <span className={`badge ${openAssignments.length > 0 ? "warning" : ""}`}>
            {openAssignments.length > 0 ? "Action needed" : "Done"}
          </span>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>My assignments</h2>
              <p className="muted">Review the course, then confirm when complete.</p>
            </div>
            <span className="badge">{workspace.assignments.length}</span>
          </div>
          <ul className="task-list">
            {workspace.assignments.length === 0 ? (
              <li className="task">
                <span>No training assigned.</span>
                <span className="badge">Clear</span>
              </li>
            ) : null}
            {workspace.assignments.map((assignment) => (
              <li className="task" key={assignment.id}>
                <span>
                  <strong>{assignment.courseTitle}</strong>
                  <small>
                    {assignment.courseVersion} · {assignment.estimatedMinutes} min · due{" "}
                    {assignment.dueAt.toLocaleDateString("zh-TW")}
                  </small>
                  {assignment.completedAt ? (
                    <small>Completed {assignment.completedAt.toLocaleDateString("zh-TW")}</small>
                  ) : null}
                </span>
                {assignment.status === "completed" ? (
                  <span className="badge">completed</span>
                ) : (
                  <form action="/api/training" method="post">
                    <input type="hidden" name="intent" value="complete" />
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <button className="button primary" type="submit">
                      Mark done
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
