import { DashboardLink } from "@/components/DashboardLink";
import { CustomFormCard } from "@/components/CustomFormCard";
import { getActiveAttendancePolicy } from "@/server/attendance/policies";
import { getDemoSession } from "@/server/auth/demo-session";
import { getEmployeeWorkspace } from "@/server/workflows/service";
import type { WorkflowRequest } from "@/server/workflows/types";

export default async function EmployeeHomePage() {
  const session = await getDemoSession();
  const [workspace, attendancePolicy] = await Promise.all([
    getEmployeeWorkspace(session),
    getActiveAttendancePolicy(session),
  ]);
  const today = toInputDate(new Date());
  const taskStartedAt = Date.now();
  const pendingRequests = workspace.requests.filter((request) => request.status === "pending");

  return (
    <>
      <main className="page mobile-page">
        <section className="page-header">
          <h1>今日</h1>
          <p>
            {session.employee?.displayName ?? "示範員工"} ·{" "}
            {session.employee?.department?.name ?? "產品工程部"}
          </p>
        </section>

        <section className="grid">
          <div className="panel span-12 today-card">
            <div>
              <span className="muted">今日班別</span>
              <h2>{workspace.attendance.shiftName}</h2>
              <p className="muted">
                {formatTime(workspace.attendance.scheduledStart)}-
                {formatTime(workspace.attendance.scheduledEnd)}
              </p>
            </div>
            <div className="today-status">
              <span className="badge">{labelStatus(workspace.attendance.status)}</span>
              <strong>
                {workspace.attendance.clockInAt
                  ? formatTime(workspace.attendance.clockInAt)
                  : "--:--"}
                {" / "}
                {workspace.attendance.clockOutAt
                  ? formatTime(workspace.attendance.clockOutAt)
                  : "--:--"}
              </strong>
            </div>
            <p className="muted punch-policy-note">
              {attendancePolicy.punchPolicyNote ?? describePunchPolicy(attendancePolicy)}
            </p>
            <div className="action-row">
              <form action="/api/workflows/clock-in" method="post">
                <input type="hidden" name="source" value="mobile" />
                <button className="button primary" type="submit">
                  上班打卡
                </button>
              </form>
              <form action="/api/workflows/clock-out" method="post">
                <input type="hidden" name="source" value="mobile" />
                <button className="button" type="submit">
                  下班打卡
                </button>
              </form>
            </div>
          </div>

          <div className="panel span-6 metric">
            <span className="muted">特休剩餘</span>
            <strong>{workspace.leaveBalance.remainingUnits}</strong>
            <span className="badge">{workspace.leaveBalance.pendingUnits} 待簽核</span>
            {workspace.leaveBalance.carryoverUnits ? (
              <small className="muted">
                {Math.max(
                  0,
                  workspace.leaveBalance.carryoverUnits - (workspace.leaveBalance.carryoverUsedUnits ?? 0),
                )} 優先使用遞延特休
              </small>
            ) : null}
          </div>

          <div className="panel span-6 metric">
            <span className="muted">待處理申請</span>
            <strong>{pendingRequests.length}</strong>
            <span className="badge">主管簽核中</span>
          </div>

          <section className="panel span-12 employee-actions" aria-labelledby="quick-actions">
            <div className="section-heading">
              <div>
                <h2 id="quick-actions">快速處理</h2>
                <p className="muted">常用申請收在三個任務裡，展開、填寫、送出。</p>
              </div>
              <span className="badge">三步完成</span>
            </div>
            <div className="form-stack">
              <details className="action-disclosure" open>
                <summary>
                  <span>
                    <strong>請假</strong>
                    <small>選日期、填原因，送給主管簽核。</small>
                  </span>
                  <span className="badge">{workspace.leaveBalance.remainingUnits} 可用</span>
                </summary>
                <form
                  action="/api/workflows/leave"
                  method="post"
                  className="mini-form"
                  aria-label="送出請假申請"
                >
                  <input type="hidden" name="taskStartedAt" value={taskStartedAt} />
                  <div className="field-grid">
                    <label>
                      開始日期
                      <input name="startDate" type="date" defaultValue={today} required />
                    </label>
                    <label>
                      開始時間
                      <input name="startTime" type="time" defaultValue="09:00" required />
                    </label>
                    <label>
                      結束日期
                      <input name="endDate" type="date" defaultValue={today} required />
                    </label>
                    <label>
                      結束時間
                      <input name="endTime" type="time" defaultValue="18:00" required />
                    </label>
                    <label>
                      請假天數
                      <input name="units" type="number" min="0.5" step="0.5" defaultValue="1" required />
                    </label>
                    <label>
                      附件
                      <input name="attachmentFileName" placeholder="診斷證明.pdf" />
                    </label>
                    <label>
                      附件儲存代碼
                      <input name="attachmentStorageKey" placeholder="選填，未來由上傳功能帶入" />
                      <input type="hidden" name="attachmentMimeType" value="application/pdf" />
                      <input type="hidden" name="attachmentScanStatus" value="pending" />
                      <input type="hidden" name="attachmentFileSizeBytes" value="0" />
                    </label>
                  </div>
                  <label>
                    請假原因
                    <input name="reason" placeholder="家庭照顧、個人事務..." required />
                  </label>
                  <button className="button primary" type="submit">
                    送出請假
                  </button>
                </form>
              </details>

              <details className="action-disclosure">
                <summary>
                  <span>
                    <strong>加班</strong>
                    <small>填寫開始結束時間與原因。</small>
                  </span>
                  <span className="badge">主管簽核</span>
                </summary>
                <form
                  action="/api/workflows/overtime"
                  method="post"
                  className="mini-form"
                  aria-label="送出加班申請"
                >
                  <input type="hidden" name="taskStartedAt" value={taskStartedAt} />
                  <div className="field-grid">
                    <label>
                      開始日期
                      <input name="startDate" type="date" defaultValue={today} required />
                    </label>
                    <label>
                      開始時間
                      <input name="startTime" type="time" defaultValue="18:30" required />
                    </label>
                    <label>
                      結束日期
                      <input name="endDate" type="date" defaultValue={today} required />
                    </label>
                    <label>
                      結束時間
                      <input name="endTime" type="time" defaultValue="20:00" required />
                    </label>
                  </div>
                  <label>
                    加班原因
                    <input name="reason" placeholder="上線支援、客戶需求..." required />
                  </label>
                  <button className="button primary" type="submit">
                    送出加班
                  </button>
                </form>
              </details>

              <details className="action-disclosure">
                <summary>
                  <span>
                    <strong>補打卡</strong>
                    <small>補正漏刷或設備異常紀錄。</small>
                  </span>
                  <span className="badge">出勤修正</span>
                </summary>
                <form
                  action="/api/workflows/punch-correction"
                  method="post"
                  className="mini-form"
                  aria-label="送出補打卡申請"
                >
                  <input type="hidden" name="taskStartedAt" value={taskStartedAt} />
                  <div className="field-grid">
                    <label>
                      出勤日期
                      <input name="workDate" type="date" defaultValue={today} required />
                    </label>
                    <label>
                      上班時間
                      <input name="clockInTime" type="time" defaultValue="09:02" />
                    </label>
                    <label>
                      下班時間
                      <input name="clockOutTime" type="time" defaultValue="18:04" />
                    </label>
                  </div>
                  <label>
                    補打卡原因
                    <input name="reason" placeholder="忘記手機打卡、設備異常..." required />
                  </label>
                  <button className="button primary" type="submit">
                    送出補打卡
                  </button>
                </form>
              </details>
            </div>
          </section>

          <section className="panel span-12" aria-labelledby="custom-forms">
            <div className="section-heading">
              <div>
                <h2 id="custom-forms">表單</h2>
                <p className="muted">不用找功能選單，直接送出人資申請。</p>
              </div>
              <span className="badge">{workspace.formTemplates.length} 個啟用中</span>
            </div>
            {workspace.formTemplates.length === 0 ? (
              <p className="muted">目前沒有啟用中的自訂表單。</p>
            ) : (
              <div className="form-stack">
                {workspace.formTemplates.map((template) => (
                  <CustomFormCard key={template.id} template={template} today={today} />
                ))}
              </div>
            )}
          </section>

          <section className="panel span-12" aria-labelledby="employee-compliance">
            <div className="section-heading">
              <div>
                <h2 id="employee-compliance">我的人資任務</h2>
                <p className="muted">用手機完成需要確認的文件、訓練與到職任務。</p>
              </div>
              <span className="badge">手機優先</span>
            </div>
            <div className="inline-actions">
              <a className="button" href="/app/work-rules">
                工作規則
              </a>
              <a className="button" href="/app/employment-terms">
                勞動條件
              </a>
              <a className="button" href="/app/training">
                訓練
              </a>
              <a className="button" href="/app/privacy">
                個資
              </a>
              <a className="button" href="/app/documents">
                文件
              </a>
              <a className="button" href="/app/announcements">
                公告
              </a>
            </div>
          </section>

          <section className="panel span-12" id="requests">
            <h2>申請進度</h2>
            {workspace.requests.length === 0 ? (
              <p className="muted">目前沒有申請紀錄。</p>
            ) : (
              <ul className="task-list">
                {workspace.requests.map((request) => (
                  <RequestItem key={request.id} request={request} />
                ))}
              </ul>
            )}
          </section>

          <section className="panel span-12">
            <h2>通知</h2>
            {workspace.notifications.length === 0 ? (
              <p className="muted">目前沒有通知。</p>
            ) : (
              <ul className="task-list">
                {workspace.notifications.map((notification) => (
                  <li className="task" key={notification.id}>
                    <span>
                      <strong>{notification.title}</strong>
                      <small>{notification.body}</small>
                    </span>
                    <span className="badge">{notification.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </main>

      <nav className="bottom-nav" aria-label="員工手機導覽">
        <DashboardLink href="/app" label="首頁" />
        <DashboardLink href="/app/attendance" label="出勤" />
        <DashboardLink href="/app/documents" label="文件" />
        <DashboardLink href="/app/announcements" label="公告" />
        <DashboardLink href="/app/training" label="訓練" />
        <DashboardLink href="/app/incidents" label="通報" />
        <DashboardLink href="/app/privacy" label="個資" />
        <DashboardLink href="/app/payslip" label="薪資單" />
        <DashboardLink href="/manager/inbox" label="簽核" />
      </nav>
    </>
  );
}

function RequestItem({ request }: { request: WorkflowRequest }) {
  return (
    <li className="task request-task">
      <div>
        <strong>{request.title}</strong>
        <small>{request.detail}</small>
        {request.attachments?.length ? (
          <small>{formatAttachmentSummary(request.attachments)}</small>
        ) : null}
        {request.currentStepLabel ? <small>目前關卡：{request.currentStepLabel}</small> : null}
        <ol className="timeline">
          {request.timeline.map((item) => (
            <li key={item.id}>
              {item.action} · {item.actorName}
              {item.comment ? ` · ${item.comment}` : ""}
            </li>
          ))}
        </ol>
      </div>
      <span className={`badge ${request.status === "rejected" ? "danger" : ""}`}>
        {labelRequestStatus(request.status)}
      </span>
    </li>
  );
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatAttachmentSummary(attachments: WorkflowRequest["attachments"]) {
  const items = attachments ?? [];
  const pending = items.filter((item) => item.scanStatus === "pending").length;
  const blocked = items.filter((item) => item.scanStatus === "blocked").length;
  if (blocked > 0) {
    return `${items.length} 個附件紀錄，${blocked} 個已封鎖`;
  }
  if (pending > 0) {
    return `${items.length} 個附件紀錄，${pending} 個掃描中`;
  }
  return `${items.length} 個附件紀錄`;
}

function labelStatus(status: string) {
  if (status === "clocked_in") return "已上班打卡";
  if (status === "complete") return "已完成";
  if (status === "corrected") return "已補正";
  return "可打卡";
}

function labelRequestStatus(status: string) {
  if (status === "pending") return "簽核中";
  if (status === "approved") return "已核准";
  if (status === "rejected") return "已退回";
  if (status === "cancelled") return "已取消";
  return status;
}

function describePunchPolicy(policy: {
  allowRemotePunch: boolean;
  requireOfficeNetworkPunch: boolean;
  requireGpsProximityPunch: boolean;
  gpsRadiusMeters: number;
}) {
  const limits = [
    policy.allowRemotePunch ? "可遠端打卡" : "不可遠端打卡",
    policy.requireOfficeNetworkPunch ? "需連公司網路" : null,
    policy.requireGpsProximityPunch ? `需在公司 ${policy.gpsRadiusMeters} 公尺內` : null,
  ].filter(Boolean);
  return `打卡規則：${limits.join("、")}`;
}
