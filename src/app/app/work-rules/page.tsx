import { getDemoSession } from "@/server/auth/session";
import { getWorkRulesWorkspace } from "@/server/work-rules/service";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function EmployeeWorkRulesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getWorkRulesWorkspace(session);
  const acknowledgedRuleIds = new Set(workspace.acknowledgements.map((ack) => ack.workRuleId));
  const activeRules = workspace.rules.filter((rule) => rule.status === "active" && rule.acknowledgementRequired);
  const openRules = activeRules.filter((rule) => !acknowledgedRuleIds.has(rule.id));

  return (
    <main className="page mobile-page">
      <section className="page-header">
        <h1>Work Rules</h1>
        <p>Review current company rules and confirm acknowledgement.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update work rules</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <section className="panel span-12 today-card">
          <div>
            <span className="muted">Need acknowledgement</span>
            <h2>{openRules.length}</h2>
            <p className="muted">Your acknowledgement creates audit evidence for HR.</p>
          </div>
          <span className={`badge ${openRules.length > 0 ? "warning" : ""}`}>
            {openRules.length > 0 ? "Action needed" : "Done"}
          </span>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Current rules</h2>
              <p className="muted">Read the summary and source reference, then acknowledge.</p>
            </div>
            <span className="badge">{activeRules.length}</span>
          </div>
          <ul className="task-list">
            {activeRules.length === 0 ? (
              <li className="task">
                <span>No active work rules require acknowledgement.</span>
                <span className="badge">Clear</span>
              </li>
            ) : null}
            {activeRules.map((rule) => {
              const acknowledgement = workspace.acknowledgements.find((item) => item.workRuleId === rule.id);
              return (
                <li className="task" key={rule.id}>
                  <span>
                    <strong>{rule.title}</strong>
                    <small>
                      {rule.version} · effective {rule.effectiveFrom.toLocaleDateString("zh-TW")}
                    </small>
                    <small>{rule.summary}</small>
                    {rule.sourceRef ? <small>Source {rule.sourceRef}</small> : null}
                    {acknowledgement ? (
                      <small>Acknowledged {acknowledgement.acknowledgedAt.toLocaleDateString("zh-TW")}</small>
                    ) : null}
                  </span>
                  {acknowledgement ? (
                    <span className="badge">acknowledged</span>
                  ) : (
                    <form action="/api/work-rules" method="post">
                      <input type="hidden" name="intent" value="acknowledge" />
                      <input type="hidden" name="workRuleId" value={rule.id} />
                      <button className="button primary" type="submit">
                        Acknowledge
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </section>
    </main>
  );
}
