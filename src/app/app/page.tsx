import { DashboardLink } from "@/components/DashboardLink";
import { CustomFormCard } from "@/components/CustomFormCard";
import { getActiveAttendancePolicy } from "@/server/attendance/policies";
import { getDemoSession } from "@/server/auth/session";
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
  const unreadNotificationCount = workspace.notifications.filter((notification) => notification.status === "unread").length;
  const clockInDisplay = workspace.attendance.clockInAt ? formatTime(workspace.attendance.clockInAt) : "--:--";
  const clockOutDisplay = workspace.attendance.clockOutAt ? formatTime(workspace.attendance.clockOutAt) : "--:--";
  const quickLeavePresets = buildQuickLeavePresets({
    today,
    scheduledStart: workspace.attendance.scheduledStart,
    scheduledEnd: workspace.attendance.scheduledEnd,
    remainingUnits: workspace.leaveBalance.remainingUnits,
  });
  const todayCompletion = [
    workspace.attendance.clockInAt,
    workspace.attendance.clockOutAt,
    workspace.notifications.some((notification) => notification.status === "unread") ? null : true,
  ].filter(Boolean).length;
  const completionPercent = Math.round((todayCompletion / 3) * 100);
  const nextBestAction = buildNextBestAction({
    clockedIn: Boolean(workspace.attendance.clockInAt),
    clockedOut: Boolean(workspace.attendance.clockOutAt),
    pendingRequests: pendingRequests.length,
    unreadNotifications: unreadNotificationCount,
  });
  const primaryPunchAction = buildPrimaryPunchAction({
    clockedIn: Boolean(workspace.attendance.clockInAt),
    clockedOut: Boolean(workspace.attendance.clockOutAt),
  });
  const todaySignals = [
    {
      label: "出勤",
      value: labelStatus(workspace.attendance.status),
      detail: `${clockInDisplay} / ${clockOutDisplay}`,
      href: "/app/attendance",
      tone: workspace.attendance.clockInAt ? "done" : "focus",
    },
    {
      label: "假勤",
      value: `${workspace.leaveBalance.remainingUnits} 天`,
      detail: `${workspace.leaveBalance.pendingUnits} 天待簽核`,
      href: "#quick-leave",
      tone: workspace.leaveBalance.remainingUnits > 0 ? "ready" : "warning",
    },
    {
      label: "簽核",
      value: `${pendingRequests.length} 筆`,
      detail: pendingRequests.length ? "等主管" : "不用處理",
      href: "#requests",
      tone: pendingRequests.length ? "focus" : "done",
    },
    {
      label: "通知",
      value: `${unreadNotificationCount} 則`,
      detail: unreadNotificationCount ? "有未讀通知" : "已讀完",
      href: "/app/announcements",
      tone: unreadNotificationCount ? "focus" : "done",
    },
  ];
  return (
    <>
      <main className="page mobile-page">
        <section className="employee-hero" aria-label="員工今日工作台">
          <div className="employee-hero-main">
            <div className="employee-hero-topline">
              <span className="muted">員工前台</span>
              <span className="badge">今日重點</span>
            </div>
            <h1>{session.employee?.displayName ?? "示範員工"}，今天要處理的事</h1>
            <p>
              {translateEmployeeDepartment(session.employee?.department?.name ?? "產品工程部")} ·{" "}
              {translateShiftName(workspace.attendance.shiftName)}{" "}
              {formatTime(workspace.attendance.scheduledStart)}-
              {formatTime(workspace.attendance.scheduledEnd)}
            </p>
            <div className="employee-hero-actions" aria-label="今日打卡">
              {primaryPunchAction ? (
                <form action={primaryPunchAction.action} method="post">
                  <input type="hidden" name="source" value="mobile" />
                  <button className="button primary" type="submit">
                    {primaryPunchAction.label}
                  </button>
                </form>
              ) : (
                <a className="button primary" href="/app/attendance">
                  查看今日出勤
                </a>
              )}
              <a className="button" href="#quick-leave">
                60 秒請假
              </a>
            </div>
          </div>
          <aside className="employee-hero-status" aria-label="今日下一步">
            <span className={`badge ${nextBestAction.tone}`}>{nextBestAction.badge}</span>
            <div>
              <small>下一步</small>
              <strong>{nextBestAction.title}</strong>
              <p>{nextBestAction.detail}</p>
            </div>
            <a className="button primary" href={nextBestAction.href}>
              {nextBestAction.cta}
            </a>
            <div className="employee-progress" aria-label={`今日完成 ${completionPercent}%`}>
              <span style={{ width: `${completionPercent}%` }} />
            </div>
          </aside>
        </section>

        <section className="employee-daily-command" aria-label="今日三步快辦">
          <div className="employee-daily-command-copy">
            <span className="muted">今日三步快辦</span>
            <strong>{nextBestAction.title}</strong>
            <small>{nextBestAction.detail}</small>
          </div>
          <article className={`employee-daily-command-card ${primaryPunchAction ? "focus" : "done"}`}>
            <span>01 現在</span>
            <strong>{primaryPunchAction?.label ?? "出勤完成"}</strong>
            <small>
              {primaryPunchAction
                ? `${clockInDisplay} / ${clockOutDisplay} · 手機`
                : `${clockInDisplay} / ${clockOutDisplay} · 可查看`}
            </small>
            {primaryPunchAction ? (
              <form action={primaryPunchAction.action} method="post">
                <input type="hidden" name="source" value="mobile" />
                <button className="button primary" type="submit">
                  立即處理
                </button>
              </form>
            ) : (
              <a className="button primary" href="/app/attendance">
                看出勤
              </a>
            )}
          </article>
          <a className="employee-daily-command-card" href="#quick-leave">
            <span>02 申請</span>
            <strong>60 秒請假</strong>
            <small>{workspace.leaveBalance.remainingUnits} 天可用 · 點一下送出</small>
          </a>
          <a className={`employee-daily-command-card ${pendingRequests.length ? "warning" : ""}`} href="#requests">
            <span>03 追蹤</span>
            <strong>{pendingRequests.length ? `${pendingRequests.length} 筆簽核中` : "沒有等待"}</strong>
            <small>{pendingRequests.length ? "看主管回覆" : "送出後看進度"}</small>
          </a>
        </section>

        <section className="employee-signal-board" aria-label="今日任務板">
          {todaySignals.map((signal) => (
            <a className={`employee-signal-card ${signal.tone}`} href={signal.href} key={signal.label}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
              <small>{signal.detail}</small>
            </a>
          ))}
        </section>

        <section className="grid">
          <div className="panel span-12 today-card">
            <div>
              <span className="muted">今日班別</span>
              <h2>{translateShiftName(workspace.attendance.shiftName)}</h2>
              <p className="muted">
                {formatTime(workspace.attendance.scheduledStart)}-
                {formatTime(workspace.attendance.scheduledEnd)}
              </p>
            </div>
            <div className="today-status">
              <span className="badge">{labelStatus(workspace.attendance.status)}</span>
              <strong>{clockInDisplay} / {clockOutDisplay}</strong>
            </div>
            <p className="muted punch-policy-note">
              {attendancePolicy.punchPolicyNote ?? describePunchPolicy(attendancePolicy)}
            </p>
          </div>

          <section className="panel span-12 quick-leave-panel" aria-labelledby="quick-leave">
            <div className="section-heading">
              <div>
                <h2 id="quick-leave">60 秒請假</h2>
                <p className="muted">上午、下午、全天，選一個送出。</p>
              </div>
              <span className="badge">{workspace.leaveBalance.remainingUnits} 可用</span>
            </div>
            <div className="quick-leave-grid">
              {quickLeavePresets.map((preset) => (
                <form
                  action="/api/workflows/leave"
                  method="post"
                  className={`quick-leave-card ${preset.primary ? "primary-card" : ""}`}
                  aria-label={`快速請假 ${preset.title}`}
                  key={preset.id}
                >
                  <input type="hidden" name="taskStartedAt" value={taskStartedAt} />
                  <input type="hidden" name="startDate" value={today} />
                  <input type="hidden" name="endDate" value={today} />
                  <input type="hidden" name="startTime" value={preset.startTime} />
                  <input type="hidden" name="endTime" value={preset.endTime} />
                  <input type="hidden" name="units" value={preset.units} />
                  <input type="hidden" name="reason" value={preset.reason} />
                  <span>{preset.label}</span>
                  <strong>{preset.title}</strong>
                  <small>{preset.detail}</small>
                  <button className={`button ${preset.primary ? "primary" : ""}`} type="submit" disabled={preset.disabled}>
                    {preset.disabled ? "餘額不足" : "送出"}
                  </button>
                </form>
              ))}
            </div>
          </section>

          <section className="panel span-12 employee-actions" aria-labelledby="quick-actions">
            <div className="section-heading">
              <div>
                <h2 id="quick-actions">快速處理</h2>
                <p className="muted">常用三件事放這裡。</p>
              </div>
              <span className="badge">三步完成</span>
            </div>
            <div className="form-stack">
              <details className="action-disclosure" open>
                <summary>
                  <span>
                    <strong>請假</strong>
                    <small>選日期，填原因。</small>
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
                      附件檔名
                      <input name="attachmentFileName" placeholder="選填" />
                    </label>
                    <input type="hidden" name="attachmentStorageKey" value="" />
                    <input type="hidden" name="attachmentMimeType" value="application/pdf" />
                    <input type="hidden" name="attachmentScanStatus" value="pending" />
                    <input type="hidden" name="attachmentFileSizeBytes" value="0" />
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
                    <small>填時間和原因。</small>
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
                    <small>漏打卡就補這裡。</small>
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

          <section className="panel span-12" aria-labelledby="custom-forms">
            <details className="action-disclosure custom-form-section">
              <summary>
                <span>
                  <strong id="custom-forms">表單</strong>
                  <small>常用人資申請。</small>
                </span>
                <span className="badge">{workspace.formTemplates.length} 個</span>
              </summary>
              {workspace.formTemplates.length === 0 ? (
                <p className="muted empty-note">目前沒有表單。</p>
              ) : (
                <div className="form-stack custom-form-stack">
                  {workspace.formTemplates.map((template) => (
                    <CustomFormCard key={template.id} template={template} today={today} />
                  ))}
                </div>
              )}
            </details>
          </section>

          <section className="panel span-12" aria-labelledby="employee-compliance">
            <div className="section-heading">
              <div>
                <h2 id="employee-compliance">我的人資任務</h2>
                <p className="muted">要看的文件都在這裡。</p>
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
        </section>
      </main>

      <nav className="bottom-nav" aria-label="員工手機導覽">
        <DashboardLink href="/app" label="首頁" />
        <DashboardLink href="/app/attendance" label="出勤" />
        <DashboardLink href="/app#quick-actions" label="申請" />
        <DashboardLink href="/app/announcements" label="公告" />
        <DashboardLink href="/app/payslip" label="薪資單" />
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

function toInputTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildQuickLeavePresets(input: {
  today: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  remainingUnits: number;
}) {
  const startTime = toInputTime(input.scheduledStart);
  const endTime = toInputTime(input.scheduledEnd);
  return [
    {
      id: "full-day",
      label: "今天",
      title: "整天特休",
      detail: `${startTime}-${endTime} · 1 天`,
      startTime,
      endTime,
      units: "1",
      reason: `快速請假：${input.today} 整天特休`,
      primary: true,
      disabled: input.remainingUnits < 1,
    },
    {
      id: "morning",
      label: "上午",
      title: "上午半天",
      detail: `${startTime}-13:00 · 0.5 天`,
      startTime,
      endTime: "13:00",
      units: "0.5",
      reason: `快速請假：${input.today} 上午半天`,
      primary: false,
      disabled: input.remainingUnits < 0.5,
    },
    {
      id: "afternoon",
      label: "下午",
      title: "下午半天",
      detail: `14:00-${endTime} · 0.5 天`,
      startTime: "14:00",
      endTime,
      units: "0.5",
      reason: `快速請假：${input.today} 下午半天`,
      primary: false,
      disabled: input.remainingUnits < 0.5,
    },
  ];
}

function buildNextBestAction(input: {
  clockedIn: boolean;
  clockedOut: boolean;
  pendingRequests: number;
  unreadNotifications: number;
}) {
  if (!input.clockedIn) {
    return {
      badge: "待打卡",
      title: "先完成上班打卡",
      detail: "先按上班打卡。",
      href: "/app/attendance",
      cta: "看出勤",
      tone: "warning",
    };
  }
  if (!input.clockedOut) {
    return {
      badge: "工作中",
      title: "下班前確認出勤",
      detail: "漏打卡就補卡。",
      href: "#quick-actions",
      cta: "補打卡",
      tone: "focus",
    };
  }
  if (input.pendingRequests > 0) {
    return {
      badge: "簽核中",
      title: "查看申請進度",
      detail: `${input.pendingRequests} 筆等主管。`,
      href: "#requests",
      cta: "看進度",
      tone: "focus",
    };
  }
  if (input.unreadNotifications > 0) {
    return {
      badge: "有通知",
      title: "讀完今天通知",
      detail: `${input.unreadNotifications} 則未讀。`,
      href: "/app/announcements",
      cta: "看通知",
      tone: "warning",
    };
  }
  return {
    badge: "已整理",
    title: "今天任務已收斂",
    detail: "可查看薪資單或公告。",
    href: "#employee-compliance",
    cta: "看任務",
    tone: "done",
  };
}

function buildPrimaryPunchAction(input: {
  clockedIn: boolean;
  clockedOut: boolean;
}) {
  if (!input.clockedIn) {
    return {
      label: "上班打卡",
      action: "/api/workflows/clock-in",
    };
  }
  if (!input.clockedOut) {
    return {
      label: "下班打卡",
      action: "/api/workflows/clock-out",
    };
  }
  return null;
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

function translateShiftName(name: string) {
  if (name.startsWith("Regular")) return "日班";
  const labels: Record<string, string> = {
    Regular: "日班",
    "Pilot day shift": "日班",
  };
  return labels[name] ?? name;
}

function translateEmployeeDepartment(name: string) {
  const labels: Record<string, string> = {
    "Product Engineering": "產品工程部",
    "People Operations": "人事營運部",
    Administration: "行政部",
    "Care Services": "照護服務部",
  };
  return labels[name] ?? name;
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
