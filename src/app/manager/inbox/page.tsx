import { getDemoSession } from "@/server/auth/session";
import { summarizeApprovalRequest } from "@/server/ai/service";
import { hasPermission } from "@/server/auth/rbac";
import { getManagerInbox } from "@/server/workflows/service";
import type { AiApprovalSummary } from "@/server/ai/types";
import type { WorkflowRequest } from "@/server/workflows/types";

export default async function ManagerInboxPage() {
  const session = await getDemoSession();
  const inbox = await getManagerInbox(session);
  const priorityRequest = getPriorityRequest(inbox.pending);
  const approvalMix = buildApprovalMix(inbox.pending);
  const riskItems = inbox.pending.filter((request) => isRiskyRequest(request));
  const payrollSensitiveCount = inbox.pending.filter((request) => request.type === "payroll_adjustment").length;
  const quickPathReadyCount = inbox.pending.filter((request) => canUseQuickPath(request)).length;
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
    <main className="page manager-inbox-page">
      <section className="manager-inbox-hero" aria-label="主管簽核指揮台">
        <div>
          <span className="muted">主管簽核工作台</span>
          <h1>簽核 Inbox</h1>
          <p>請假、加班、補打卡、自訂表單與薪資調整申請集中處理；先看風險，再用 15 秒快速簽核。</p>
        </div>
        <div className="manager-inbox-focus">
          <span className={`badge ${priorityRequest ? priorityBadgeClass(priorityRequest) : "done"}`}>
            {priorityRequest ? labelForType(priorityRequest.type) : "已清空"}
          </span>
          <strong>{priorityRequest ? displayRequestTitle(priorityRequest) : "目前沒有待簽核"}</strong>
          <small>
            {priorityRequest
              ? `${priorityRequest.employeeName} · ${displayStepLabel(priorityRequest.currentStepLabel)}`
              : "主管 Inbox 沒有待處理事項。"}
          </small>
          <a className="button primary" href={priorityRequest ? `#approval-${priorityRequest.id}` : "#decided"}>
            {priorityRequest ? "處理第一筆" : "查看已處理"}
          </a>
        </div>
      </section>

      <section className="manager-inbox-command-strip" aria-label="主管簽核摘要">
        <div className="manager-inbox-command-copy">
          <span className="muted">今日簽核節奏</span>
          <strong>{priorityRequest ? "先處理最敏感或最早送出的申請" : "待簽核已清空"}</strong>
          <small>
            {priorityRequest
              ? "快速核准只適合已確認風險摘要的標準申請；薪資與高風險項目仍需完整意見。"
              : "可以回看最近決議與通知。"}
          </small>
        </div>
        <a className="manager-inbox-command-card focus" href="#pending-approvals">
          <span>待簽核</span>
          <strong>{inbox.pending.length}</strong>
          <small>{quickPathReadyCount} 筆可走 15 秒快速路徑</small>
        </a>
        <a className="manager-inbox-command-card" href="#risk-summary">
          <span>風險</span>
          <strong>{riskItems.length}</strong>
          <small>{payrollSensitiveCount} 筆薪資敏感</small>
        </a>
        <a className="manager-inbox-command-card" href="#decided">
          <span>已處理</span>
          <strong>{inbox.decided.length}</strong>
          <small>{session.employee?.displayName ?? "主管"} 最近決議</small>
        </a>
      </section>

      <section className="manager-inbox-mix" aria-label="簽核類型分布">
        {approvalMix.map((item) => (
          <a className={`manager-inbox-mix-card ${item.count > 0 ? "active" : ""}`} href="#pending-approvals" key={item.type}>
            <span>{item.label}</span>
            <strong>{item.count}</strong>
            <small>{item.detail}</small>
          </a>
        ))}
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

        <section className="panel span-12 manager-risk-summary" id="risk-summary" aria-label="風險摘要">
          <div className="section-heading">
            <div>
              <h2>風險先看</h2>
              <p className="muted">主管先確認工時、餘額、附件與薪資敏感項目，再決定快速核准或退回補件。</p>
            </div>
            <span className={`badge ${riskItems.length ? "warning" : "done"}`}>{riskItems.length} 筆需留意</span>
          </div>
          {inbox.pending.length === 0 ? (
            <p className="muted">目前沒有待簽核風險。</p>
          ) : (
            <div className="manager-risk-grid">
              {inbox.pending.slice(0, 4).map((request) => (
                <a className={`manager-risk-card ${isRiskyRequest(request) ? "warning" : "ready"}`} href={`#approval-${request.id}`} key={request.id}>
                  <span>{labelForType(request.type)}</span>
                  <strong>{request.employeeName}</strong>
                  <small>{request.riskSummary}</small>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="span-12 inbox-workspace" id="pending-approvals" aria-label="簽核工作台">
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
                      <strong>{displayRequestTitle(request)}</strong>
                  <small>{request.employeeName} · {displayStepLabel(request.currentStepLabel)}</small>
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

        <section className="panel span-12 decided-strip" id="decided">
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
                      {request.employeeName} · {displayRequestTitle(request)}
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
    <li className="approval-card approval-review-card" id={`approval-${request.id}`}>
      <div className="approval-card-header">
        <div>
          <span className="badge">{labelForType(request.type)}</span>
          <h3>
            {request.employeeName} · {displayRequestTitle(request)}
          </h3>
          <p className="muted">{request.detail}</p>
          <p className="muted">目前關卡：{displayStepLabel(request.currentStepLabel)}</p>
        </div>
        <span className="badge warning">{labelStatus(request.status)}</span>
      </div>

      <div className="risk-box">
        <strong>風險摘要</strong>
        <p>{request.riskSummary}</p>
      </div>

      <div className="quick-approval-row" aria-label={`${displayRequestTitle(request)} 快速簽核`}>
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

function displayRequestTitle(request: WorkflowRequest) {
  const normalized = request.title.trim().toLowerCase();
  if (normalized === "annual leave") return "特休申請";
  if (normalized === "overtime request") return "加班申請";
  if (normalized === "punch correction") return "補打卡申請";
  if (normalized === "payroll adjustment") return "薪資調整申請";
  return request.title;
}

function displayStepLabel(label?: string) {
  if (!label) return "審核";
  const normalized = label.trim().toLowerCase();
  if (normalized === "manager review") return "主管審核";
  if (normalized === "hr review") return "人資審核";
  if (normalized === "owner approval") return "負責人核准";
  if (normalized === "department manager review") return "部門主管審核";
  return label;
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

function getPriorityRequest(requests: WorkflowRequest[]) {
  return [...requests].sort((a, b) => {
    const riskDelta = Number(isRiskyRequest(b)) - Number(isRiskyRequest(a));
    if (riskDelta !== 0) return riskDelta;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

function buildApprovalMix(requests: WorkflowRequest[]) {
  const counts = new Map<WorkflowRequest["type"], number>();
  for (const request of requests) {
    counts.set(request.type, (counts.get(request.type) ?? 0) + 1);
  }
  return [
    { type: "leave" as const, label: "請假", detail: "餘額與排班" },
    { type: "overtime" as const, label: "加班", detail: "工時風險" },
    { type: "punch_correction" as const, label: "補打卡", detail: "出勤修正" },
    { type: "custom_form" as const, label: "表單", detail: "自訂流程" },
    { type: "payroll_adjustment" as const, label: "薪資", detail: "敏感變更" },
  ].map((item) => ({
    ...item,
    count: counts.get(item.type) ?? 0,
  }));
}

function isRiskyRequest(request: WorkflowRequest) {
  if (request.type === "payroll_adjustment") return true;
  if (request.type === "overtime") return true;
  return /warning|sensitive|manual|requires manager review|exceed|conflict|blocked|薪資|工時|附件|補打卡|衝突|封鎖/i.test(request.riskSummary);
}

function canUseQuickPath(request: WorkflowRequest) {
  return request.type !== "payroll_adjustment" && !isRiskyRequest(request);
}

function priorityBadgeClass(request: WorkflowRequest) {
  if (request.type === "payroll_adjustment") return "danger";
  if (isRiskyRequest(request)) return "warning";
  return "focus";
}
