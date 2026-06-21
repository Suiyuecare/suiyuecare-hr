import { DashboardLink } from "@/components/DashboardLink";
import { getDemoSession } from "@/server/auth/session";
import { getTrainingWorkspace, type TrainingAssignmentView } from "@/server/training/compliance";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function EmployeeTrainingPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getTrainingWorkspace(session);
  const openAssignments = workspace.assignments.filter((assignment) => assignment.status !== "completed");
  const completedAssignments = workspace.assignments.filter((assignment) => assignment.status === "completed");
  const nextAssignment = openAssignments[0] ?? workspace.assignments[0] ?? null;
  const assignedMinutes = workspace.assignments.reduce((total, assignment) => total + assignment.estimatedMinutes, 0);
  const completedMinutes = completedAssignments.reduce((total, assignment) => total + assignment.estimatedMinutes, 0);
  const completionPercent = workspace.assignments.length
    ? Math.round((completedAssignments.length / workspace.assignments.length) * 100)
    : 100;
  const overdueCount = openAssignments.filter((assignment) => assignment.dueAt.getTime() < Date.now()).length;

  return (
    <>
      <main className="page mobile-page employee-training-page">
        <section className="employee-hero employee-training-hero" aria-label="我的訓練任務">
          <div className="employee-hero-main">
            <div className="employee-hero-topline">
              <span className="muted">員工前台</span>
              <span className={`badge ${openAssignments.length ? "warning" : "done"}`}>
                {openAssignments.length ? `${openAssignments.length} 待完成` : "已完成"}
              </span>
            </div>
            <h1>我的訓練</h1>
            <p>用手機完成到職必修訓練；閱讀摘要、確認版本、按下完成，不需要進後台或找人資。</p>
            <div className="employee-hero-actions">
              <a className="button primary" href="#training-today">
                查看待辦
              </a>
              <a className="button" href="/app">
                回首頁
              </a>
            </div>
          </div>
          <aside className="employee-hero-status">
            <span className={`badge ${overdueCount ? "danger" : openAssignments.length ? "warning" : "done"}`}>
              {overdueCount ? "有逾期" : openAssignments.length ? "待處理" : "完成"}
            </span>
            <div>
              <small>今天要處理</small>
              <strong>{nextTrainingTitle(openAssignments, overdueCount)}</strong>
              <p>{nextTrainingCopy(nextAssignment, workspace.settings.maxFirstWeekMinutes)}</p>
            </div>
            <a className="button primary" href="#training-list">
              {openAssignments.length ? "開始確認" : "查看紀錄"}
            </a>
            <div className="employee-progress" aria-label={`訓練完成 ${completionPercent}%`}>
              <span style={{ width: `${completionPercent}%` }} />
            </div>
          </aside>
        </section>

        {error ? (
          <section className="employee-training-alerts" aria-live="polite">
            <div className="panel danger-panel">
              <strong>訓練尚未完成</strong>
              <p>{localizeTrainingError(error)}</p>
            </div>
          </section>
        ) : null}

        <section className="grid" id="training-today">
          <section className={`panel span-12 today-card employee-training-today ${openAssignments.length ? "warning" : "ready"}`}>
            <div>
              <span className="muted">待完成訓練</span>
              <h2>{openAssignments.length}</h2>
              <p className="muted">
                已完成 {completedAssignments.length}/{workspace.assignments.length} 門，第一週目標 {workspace.settings.maxFirstWeekMinutes} 分鐘內。
              </p>
            </div>
            <span className={`badge ${openAssignments.length ? "warning" : "done"}`}>
              {openAssignments.length ? "待處理" : "全部完成"}
            </span>
          </section>

          <section className="span-12 employee-training-signal-board" aria-label="訓練進度板">
            <article className={completionPercent === 100 ? "done" : "focus"}>
              <span>完成率</span>
              <strong>{completionPercent}%</strong>
              <small>{completedAssignments.length} / {workspace.assignments.length} 門</small>
            </article>
            <article className={assignedMinutes <= workspace.settings.maxFirstWeekMinutes ? "done" : "warning"}>
              <span>第一週分鐘</span>
              <strong>{assignedMinutes} 分</strong>
              <small>完成 {completedMinutes} 分 · 目標 {workspace.settings.maxFirstWeekMinutes} 分鐘內</small>
            </article>
            <article className={overdueCount ? "warning" : "done"}>
              <span>逾期</span>
              <strong>{overdueCount}</strong>
              <small>{overdueCount ? "請優先完成" : "沒有逾期"}</small>
            </article>
          </section>

          <section className="employee-training-flow span-12" aria-label="三步完成訓練">
            <article className={openAssignments.length ? "focus" : "done"}>
              <span>01</span>
              <strong>看課程摘要</strong>
              <small>確認課程名稱、版本與期限。</small>
            </article>
            <article className={openAssignments.length ? "focus" : "done"}>
              <span>02</span>
              <strong>完成閱讀</strong>
              <small>依公司提供的內容或來源完成學習。</small>
            </article>
            <article className={openAssignments.length ? "ready" : "done"}>
              <span>03</span>
              <strong>按下完成</strong>
              <small>系統會留下版本與確認證據。</small>
            </article>
          </section>

          <section className="panel span-12" id="training-list">
            <div className="section-heading">
              <div>
                <span className="muted">到職必修</span>
                <h2>需要你完成的訓練</h2>
                <p className="muted">本頁只顯示課程任務與版本；不會要求你填寫私人筆記或回傳敏感資料。</p>
              </div>
              <span className="badge">{workspace.assignments.length} 門</span>
            </div>

            <div className="employee-training-list">
              {workspace.assignments.length === 0 ? (
                <div className="empty-card">
                  <strong>目前沒有訓練任務</strong>
                  <p className="muted">HR 指派新的到職訓練後，會出現在這裡。</p>
                </div>
              ) : null}

              {workspace.assignments.map((assignment) => (
                <article className={`employee-training-card ${assignmentTone(assignment)}`} key={assignment.id}>
                  <div className="employee-training-card-head">
                    <div>
                      <span className="muted">到職訓練</span>
                      <h3>{assignment.courseTitle}</h3>
                    </div>
                    <span className={`badge ${assignment.status === "completed" ? "done" : "warning"}`}>
                      {assignment.status === "completed" ? "已完成" : "待完成"}
                    </span>
                  </div>

                  <dl className="access-fact-grid">
                    <div>
                      <dt>版本</dt>
                      <dd>{assignment.courseVersion}</dd>
                    </div>
                    <div>
                      <dt>預估時間</dt>
                      <dd>{assignment.estimatedMinutes} 分鐘</dd>
                    </div>
                    <div>
                      <dt>期限</dt>
                      <dd>{formatDate(assignment.dueAt)}</dd>
                    </div>
                    <div>
                      <dt>狀態</dt>
                      <dd>{assignment.completedAt ? `完成 ${formatDate(assignment.completedAt)}` : "尚未完成"}</dd>
                    </div>
                  </dl>

                  {assignment.completedAt ? (
                    <p className="employee-training-proof">
                      已於 {formatDateTime(assignment.completedAt)} 完成 · 版本 {assignment.courseVersion}
                    </p>
                  ) : (
                    <form action="/api/training" method="post" aria-label={`完成 ${assignment.courseTitle}`}>
                      <input type="hidden" name="intent" value="complete" />
                      <input type="hidden" name="assignmentId" value={assignment.id} />
                      <button className="button primary" type="submit">
                        我已完成訓練
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="panel span-12 employee-training-guardrails">
            <div className="section-heading">
              <div>
                <h2>資料安全提醒</h2>
                <p className="muted">完成訓練只會記錄狀態、版本與時間，不會要求你輸入薪資、身分證或健康資料。</p>
              </div>
              <span className="badge">隱私保護</span>
            </div>
            <div className="employee-training-guardrail-grid">
              <article>
                <strong>不用填私密資料</strong>
                <p>訓練確認不需要薪資、銀行帳號、身分證字號或健康資訊。</p>
              </article>
              <article>
                <strong>三步內完成</strong>
                <p>看摘要、完成閱讀、按下確認，手機端不進深層選單。</p>
              </article>
              <article>
                <strong>留下稽核證據</strong>
                <p>系統會記錄課程版本與完成時間，方便 HR 做導入證明。</p>
              </article>
            </div>
          </section>
        </section>
      </main>

      <nav className="bottom-nav" aria-label="員工手機導覽">
        <DashboardLink href="/app" label="首頁" />
        <DashboardLink href="/app/training" label="訓練" />
        <DashboardLink href="/app/documents" label="文件" />
        <DashboardLink href="/app/payslip" label="薪資單" />
        <DashboardLink href="/manager/inbox" label="Inbox" />
      </nav>
    </>
  );
}

function nextTrainingTitle(openAssignments: TrainingAssignmentView[], overdueCount: number) {
  if (overdueCount > 0) return "先完成逾期訓練";
  if (openAssignments.length > 0) return "完成到職訓練";
  return "目前沒有待辦";
}

function nextTrainingCopy(assignment: TrainingAssignmentView | null, minuteTarget: number) {
  if (!assignment) return "你目前沒有被指派訓練任務，之後 HR 發布會自動出現在這裡。";
  if (assignment.status === "completed") return `你已完成目前訓練；第一週訓練目標維持在 ${minuteTarget} 分鐘內。`;
  return `${assignment.courseTitle} · ${assignment.estimatedMinutes} 分鐘 · 期限 ${formatDate(assignment.dueAt)}。`;
}

function assignmentTone(assignment: TrainingAssignmentView) {
  if (assignment.status === "completed") return "done";
  return assignment.dueAt.getTime() < Date.now() ? "danger" : "warning";
}

function localizeTrainingError(error: string) {
  if (error.includes("training:self") || error.includes("permission")) return "目前角色無法完成訓練，請切回員工身分。";
  if (error.includes("not found")) return "找不到這筆訓練任務，請重新整理後再試。";
  if (error.includes("Employee context is required")) return "找不到員工身分，請重新登入或切換示範角色。";
  return error
    .replace("Training assignment not found.", "找不到這筆訓練任務。")
    .replace("Unable to update training.", "訓練資料更新失敗。");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Taipei",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(date);
}
