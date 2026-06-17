import { getDemoSession } from "@/server/auth/session";
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
        <h1>簽核 Inbox</h1>
        <p>請假、加班、補打卡、自訂表單與薪資調整申請，都集中在這裡處理。</p>
      </section>

      <section className="grid inbox-command-center">
        <div className="panel span-4 metric">
          <span className="muted">待簽核</span>
          <strong>{inbox.pending.length}</strong>
          <span className="badge warning">統一佇列</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">最近決議</span>
          <strong>{inbox.decided.length}</strong>
          <span className="badge">{session.employee?.displayName ?? "主管"}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">通知</span>
          <strong>{inbox.notifications.length}</strong>
          <span className="badge">系統內</span>
        </div>

        <section className="span-12 inbox-workspace" aria-label="簽核工作台">
          <aside className="panel inbox-queue">
            <div className="section-heading">
              <div>
                <h2>簽核佇列</h2>
                <p className="muted">集中處理，不用到各模組找申請。</p>
              </div>
              <span className="badge warning">{inbox.pending.length}</span>
            </div>
            {inbox.pending.length === 0 ? (
              <p className="muted">目前沒有待簽核申請。</p>
            ) : (
              <ul className="task-list inbox-queue-list">
                {inbox.pending.map((request, index) => (
                  <li className="task inbox-queue-item" key={request.id}>
                    <span>
                      <strong>{request.title}</strong>
                      <small>{request.employeeName} · {request.currentStepLabel ?? "審核"}</small>
                    </span>
                    <span className={`badge ${index === 0 ? "warning" : ""}`}>{labelForType(request.type)}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="panel inbox-review-panel">
            <div className="section-heading">
              <div>
                <h2>需要你審核</h2>
                <p className="muted">每張卡都包含風險摘要、AI 建議與時間線。</p>
              </div>
              <span className="badge">主管 Inbox</span>
            </div>
            {inbox.pending.length === 0 ? (
              <p className="muted">目前沒有待簽核申請。</p>
            ) : (
              <ul className="approval-list">
                {inbox.pending.map((request) => (
                  <ApprovalCard key={request.id} request={request} summary={summaries.get(request.id)} />
                ))}
              </ul>
            )}
          </section>
        </section>

        <section className="panel span-12 decided-strip">
          <div className="section-heading">
            <div>
              <h2>最近已處理</h2>
              <p className="muted">保留最近決議，方便主管回看。</p>
            </div>
            <span className="badge">{inbox.decided.length} 筆</span>
          </div>
          {inbox.decided.length === 0 ? (
            <p className="muted">目前沒有已處理申請。</p>
          ) : (
            <ul className="task-list decided-list">
              {inbox.decided.map((request) => (
                <li className="task" key={request.id}>
                  <span>
                    <strong>
                      {request.employeeName} · {request.title}
                    </strong>
                    <small>{request.detail}</small>
                  </span>
                  <span className={`badge ${request.status === "rejected" ? "danger" : ""}`}>
                    {labelStatus(request.status)}
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
    <li className="approval-card approval-review-card">
      <div className="approval-card-header">
        <div>
          <span className="badge">{labelForType(request.type)}</span>
          <h3>
            {request.employeeName} · {request.title}
          </h3>
          <p className="muted">{request.detail}</p>
          <p className="muted">目前關卡：{request.currentStepLabel ?? "審核"}</p>
        </div>
        <span className="badge warning">{labelStatus(request.status)}</span>
      </div>

      <div className="risk-box">
        <strong>風險摘要</strong>
        <p>{request.riskSummary}</p>
      </div>

      <div className="quick-approval-row" aria-label={`${request.title} 快速簽核`}>
        <div>
          <span className="muted">15 秒簽核</span>
          <strong>確認風險摘要後可直接處理</strong>
        </div>
        <form action="/api/workflows/approval" method="post">
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="requestType" value={request.type} />
          <input type="hidden" name="decision" value="approve" />
          <input type="hidden" name="comment" value={quickApprovalComment(request.type)} />
          <button className="button primary" type="submit">
            快速核准
          </button>
        </form>
        <form action="/api/workflows/approval" method="post">
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="requestType" value={request.type} />
          <input type="hidden" name="decision" value="reject" />
          <input type="hidden" name="comment" value="請補充資料後重新送出。" />
          <button className="button" type="submit">
            需補件
          </button>
        </form>
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
            簽核意見
            <input name="comment" defaultValue="核准" />
          </label>
          <button className="button primary" type="submit">
            核准
          </button>
        </form>
        <form action="/api/workflows/approval" method="post" className="decision-form">
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="requestType" value={request.type} />
          <input type="hidden" name="decision" value="reject" />
          <label>
            退回原因
            <input name="comment" defaultValue="請補充資料後重新送出。" />
          </label>
          <button className="button" type="submit">
            退回
          </button>
        </form>
      </div>
    </li>
  );
}

function labelForType(type: WorkflowRequest["type"]) {
  if (type === "leave") return "請假";
  if (type === "overtime") return "加班";
  if (type === "custom_form") return "表單";
  if (type === "payroll_adjustment") return "薪資";
  return "補打卡";
}

function labelStatus(status: string) {
  if (status === "pending") return "簽核中";
  if (status === "approved") return "已核准";
  if (status === "rejected") return "已退回";
  if (status === "cancelled") return "已取消";
  return status;
}

function quickApprovalComment(type: WorkflowRequest["type"]) {
  if (type === "leave") return "快速核准：已確認排班與餘額。";
  if (type === "overtime") return "快速核准：已確認加班原因與工時風險。";
  if (type === "punch_correction") return "快速核准：已確認補打卡原因。";
  if (type === "custom_form") return "快速核准：已確認申請內容。";
  return "快速核准：已確認敏感變更內容。";
}
