import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getOffboardingWorkspace, offboardingTaskTypes } from "@/server/employees/offboarding";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function OffboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getOffboardingWorkspace(session);
  const { readiness, tasks } = workspace;
  const grouped = groupTasks(tasks);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Offboarding</h1>
        <p>Close termination tasks for final wage, unused leave, insurance withdrawal, access, records, and certificates.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update offboarding</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Ready tasks</span>
          <strong>{readiness.readyCount}</strong>
          <span className="badge">{readiness.total} total</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Pending</span>
          <strong>{readiness.pendingCount}</strong>
          <span className={`badge ${readiness.pendingCount ? "warning" : ""}`}>HR action</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Overdue</span>
          <strong>{readiness.overdueCount}</strong>
          <span className={`badge ${readiness.overdueCount ? "danger" : ""}`}>due dates</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Offboarding</span>
          <strong>{readiness.ready ? "Ready" : "Open"}</strong>
          <span className={`badge ${readiness.ready ? "" : "warning"}`}>termination</span>
        </div>

        <section className={`panel span-12 risk-box ${readiness.overdueCount ? "danger-box" : ""}`}>
          <div className="section-heading">
            <div>
              <h2>{readiness.ready ? "No open offboarding blockers" : "Offboarding blockers"}</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <a className="button" href="/hr/employee-lifecycle">
              Record termination
            </a>
          </div>
          {readiness.missing.length ? (
            <ul className="task-list compact">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge danger">Required</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Termination task list</h2>
              <p className="muted">Evidence references and private notes are hashed before audit storage.</p>
            </div>
            <span className="badge">Audited</span>
          </div>

          {grouped.length === 0 ? (
            <EmptyState title="No termination offboarding" body="Record a termination event to create the offboarding checklist." />
          ) : (
            <ul className="task-list">
              {grouped.map((group) => (
                <li className="task payroll-compliance-task" key={group.lifecycleEventId}>
                  <div className="employee-profile-heading">
                    <span>
                      <strong>
                        {group.employeeNo} · {group.employeeName}
                      </strong>
                      <small>
                        Termination {formatDate(group.effectiveDate)} · {group.readyCount}/{offboardingTaskTypes.length} ready
                      </small>
                    </span>
                    <span className={`badge ${group.overdueCount ? "danger" : group.ready ? "" : "warning"}`}>
                      {group.ready ? "Ready" : group.overdueCount ? "Overdue" : "Pending"}
                    </span>
                  </div>

                  <ul className="task-list compact">
                    {group.tasks.map((task) => (
                      <li className="task" key={task.id}>
                        <span>
                          <strong>{taskLabel(task.taskType)}</strong>
                          <small>
                            Due {formatDate(task.dueDate)}
                            {task.evidenceHash ? ` · evidence ${task.evidenceHash.slice(0, 10)}` : ""}
                          </small>
                        </span>
                        <span className={`badge ${task.overdue ? "danger" : task.status === "pending" ? "warning" : ""}`}>
                          {task.overdue ? "overdue" : task.status}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <form action="/api/employees/offboarding" method="post" className="mini-form compact-form">
                    <input type="hidden" name="employeeId" value={group.employeeId} />
                    <input type="hidden" name="lifecycleEventId" value={group.lifecycleEventId} />
                    <div className="field-grid">
                      <label>
                        Task
                        <select name="taskType" defaultValue={group.nextTask?.taskType ?? "final_wage_review"}>
                          {offboardingTaskTypes.map((taskType) => (
                            <option value={taskType} key={taskType}>
                              {taskLabel(taskType)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Status
                        <select name="status" defaultValue="completed">
                          <option value="completed">Completed</option>
                          <option value="waived">Waived</option>
                          <option value="pending">Pending</option>
                        </select>
                      </label>
                      <label>
                        Completed at
                        <input name="completedAt" type="date" defaultValue={formatDateInput(new Date())} />
                      </label>
                      <label>
                        Evidence reference
                        <input name="evidenceRef" placeholder="ticket, payroll run, certificate id" />
                      </label>
                      <label>
                        Private note hash source
                        <input name="notes" placeholder="Will be hashed, not shown in audit" />
                      </label>
                    </div>
                    <button className="button primary" type="submit">
                      Save offboarding task
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function groupTasks(tasks: Awaited<ReturnType<typeof getOffboardingWorkspace>>["tasks"]) {
  const groups = new Map<string, {
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    lifecycleEventId: string;
    effectiveDate: Date;
    tasks: typeof tasks;
  }>();
  for (const task of tasks) {
    const group = groups.get(task.lifecycleEventId) ?? {
      employeeId: task.employeeId,
      employeeNo: task.employeeNo,
      employeeName: task.employeeName,
      lifecycleEventId: task.lifecycleEventId,
      effectiveDate: task.effectiveDate,
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(task.lifecycleEventId, group);
  }
  return Array.from(groups.values()).map((group) => {
    const readyTasks = group.tasks.filter((task) => task.status !== "pending");
    const overdueTasks = group.tasks.filter((task) => task.overdue);
    return {
      ...group,
      tasks: group.tasks.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.taskType.localeCompare(b.taskType)),
      ready: readyTasks.length === offboardingTaskTypes.length && overdueTasks.length === 0,
      readyCount: readyTasks.length,
      overdueCount: overdueTasks.length,
      nextTask: group.tasks.find((task) => task.status === "pending") ?? group.tasks[0],
    };
  });
}

function taskLabel(taskType: string) {
  if (taskType === "unused_leave_settlement") return "Unused leave settlement";
  if (taskType === "statutory_insurance_withdrawal") return "Statutory insurance withdrawal";
  if (taskType === "access_revocation") return "Access revocation";
  if (taskType === "record_retention") return "Record retention";
  if (taskType === "employment_certificate") return "Employment certificate";
  return "Final wage review";
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
