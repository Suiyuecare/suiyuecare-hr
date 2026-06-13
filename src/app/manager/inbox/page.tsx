import { getDemoSession } from "@/server/auth/demo-session";
import { summarizeApprovalRequest } from "@/server/ai/service";
import { hasPermission } from "@/server/auth/rbac";
import { getManagerInbox } from "@/server/workflows/service";
import type { AiApprovalSummary } from "@/server/ai/types";
import type { WorkflowRequest } from "@/server/workflows/types";

export default async function ManagerInboxPage() {
  const session = await getDemoSession();
  const inbox = await getManagerInbox(session);
  const summaries = hasPermission(session.role, "ai:approval_summary")
    ? new Map(
        await Promise.all(
          inbox.pending.map(async (request) => [
            request.id,
            await summarizeApprovalRequest(session, request),
          ] as const),
        ),
      )
    : new Map<string, AiApprovalSummary>();

  return (
    <main className="page">
      <section className="page-header">
        <h1>Approval Inbox</h1>
        <p>Leave, overtime, punch correction, custom form, and payroll adjustment requests are reviewed in one place.</p>
      </section>

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Pending approvals</span>
          <strong>{inbox.pending.length}</strong>
          <span className="badge warning">Unified queue</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Recent decisions</span>
          <strong>{inbox.decided.length}</strong>
          <span className="badge">{session.employee?.displayName ?? "Manager"}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Notifications</span>
          <strong>{inbox.notifications.length}</strong>
          <span className="badge">In-app</span>
        </div>

        <section className="panel span-12">
          <h2>Needs your review</h2>
          {inbox.pending.length === 0 ? (
            <p className="muted">No pending approvals.</p>
          ) : (
            <ul className="approval-list">
              {inbox.pending.map((request) => (
                <ApprovalCard key={request.id} request={request} summary={summaries.get(request.id)} />
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12">
          <h2>Recently decided</h2>
          {inbox.decided.length === 0 ? (
            <p className="muted">No decided requests yet.</p>
          ) : (
            <ul className="task-list">
              {inbox.decided.map((request) => (
                <li className="task" key={request.id}>
                  <span>
                    <strong>
                      {request.employeeName} · {request.title}
                    </strong>
                    <small>{request.detail}</small>
                  </span>
                  <span className={`badge ${request.status === "rejected" ? "danger" : ""}`}>
                    {request.status}
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

function ApprovalCard({
  request,
  summary,
}: {
  request: WorkflowRequest;
  summary?: AiApprovalSummary;
}) {
  return (
    <li className="approval-card">
      <div className="approval-card-header">
        <div>
          <span className="badge">{labelForType(request.type)}</span>
          <h3>
            {request.employeeName} · {request.title}
          </h3>
          <p className="muted">{request.detail}</p>
          <p className="muted">Current step: {request.currentStepLabel ?? "Review"}</p>
        </div>
        <span className="badge warning">{request.status}</span>
      </div>

      <div className="risk-box">
        <strong>Risk summary</strong>
        <p>{request.riskSummary}</p>
      </div>

      {summary ? (
        <div className="ai-summary-box">
          <strong>{summary.label}</strong>
          <p>{summary.summary}</p>
          <ul>
            {summary.verify.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol className="timeline">
        {request.timeline.map((item) => (
          <li key={item.id}>
            {item.action} · {item.actorName}
            {item.comment ? ` · ${item.comment}` : ""}
          </li>
        ))}
      </ol>

      <div className="decision-grid">
        <form action="/api/workflows/approval" method="post" className="decision-form">
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="requestType" value={request.type} />
          <input type="hidden" name="decision" value="approve" />
          <label>
            Comment
            <input name="comment" defaultValue="Approved" />
          </label>
          <button className="button primary" type="submit">
            Approve
          </button>
        </form>
        <form action="/api/workflows/approval" method="post" className="decision-form">
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="requestType" value={request.type} />
          <input type="hidden" name="decision" value="reject" />
          <label>
            Comment
            <input name="comment" defaultValue="Please revise and resubmit." />
          </label>
          <button className="button" type="submit">
            Reject
          </button>
        </form>
      </div>
    </li>
  );
}

function labelForType(type: WorkflowRequest["type"]) {
  if (type === "leave") return "Leave";
  if (type === "overtime") return "Overtime";
  if (type === "custom_form") return "Form";
  if (type === "payroll_adjustment") return "Payroll";
  return "Punch correction";
}
