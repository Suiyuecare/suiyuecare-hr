import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getTrainingWorkspace,
  type CompanyTrainingSettings,
  type TrainingAssignmentView,
  type TrainingCourseView,
  type TrainingReadiness,
  type TrainingVerificationStatus,
} from "@/server/training/compliance";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function TrainingCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();

  if (!hasPermission(session.role, "training:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const workspace = await getTrainingWorkspace(session);
  const { settings, readiness } = workspace;
  const activeCourses = workspace.courses.filter((course) => course.status === "active").length;
  const requiredCourses = workspace.courses.filter((course) => course.status === "active" && course.requiredForOnboarding);
  const completedRate = readiness.assignedCount > 0
    ? Math.round((readiness.completedCount / readiness.assignedCount) * 100)
    : 0;
  const focus = buildTrainingFocus(settings, readiness);

  return (
    <main className="page training-center-page">
      <section className="hr-monthly-hero training-center-hero" aria-label="訓練上線工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="eyebrow">人資後台 · 新人導入</span>
            <span className={`badge ${readiness.ready ? "" : "warning"}`}>
              {readiness.ready ? "可上線" : "需處理"}
            </span>
          </div>
          <h1>訓練上線工作台</h1>
          <p>
            把新人第一週訓練壓在 10 分鐘內，讓員工從手機完成必修確認，HR 只處理缺口、指派和稽核證據。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#training-settings">
              三步設定
            </Link>
            <Link className="button" href="#training-course-wizard">
              建立課程
            </Link>
            <Link className="button" href="/app/training">
              員工畫面
            </Link>
            <Link className="button" href="/hr/kpis">
              查看 KPI
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="eyebrow">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.copy}</p>
          <small>{focus.meta}</small>
          <div className="hr-monthly-focus-footer">
            <Link className="button primary" href={focus.href}>
              {focus.action}
            </Link>
          </div>
        </aside>
      </section>

      {params.error ? (
        <section className="training-center-alerts" aria-live="polite">
          <div className="panel risk-box danger-box">
            <strong>訓練設定尚未更新</strong>
            <p>{localizeTrainingError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board training-center-signal-board" aria-label="訓練 KPI 訊號板">
        <article>
          <span>上線 Gate</span>
          <strong>{readiness.ready ? "可上線" : `${readiness.missing.length} 項缺口`}</strong>
          <small>HR 複核 {verificationStatusLabel(settings.verificationStatus)}</small>
        </article>
        <article>
          <span>第一週教學</span>
          <strong>{readiness.requiredMinutes} / {settings.maxFirstWeekMinutes} 分</strong>
          <small>{readiness.requiredMinutes > settings.maxFirstWeekMinutes ? "超過 KPI，請縮短或拆成非必修。" : "符合導入 KPI。"}</small>
        </article>
        <article>
          <span>指派完成率</span>
          <strong>{completedRate}%</strong>
          <small>{readiness.completedCount} / {readiness.assignedCount} 筆已完成</small>
        </article>
        <article>
          <span>逾期必修</span>
          <strong>{readiness.overdueCount}</strong>
          <small>{readiness.overdueCount > 0 ? "需追蹤員工完成。" : "目前沒有逾期。"}</small>
        </article>
      </section>

      <section className="settings-command-grid training-center-command-grid" aria-label="訓練作業卡">
        <article className={`settings-command-card ${readiness.requiredMinutes <= settings.maxFirstWeekMinutes ? "ready" : "warning"}`}>
          <span className="eyebrow">導入 KPI</span>
          <h2>10 分鐘內完成</h2>
          <p>只把必須知道的手機任務、資料安全和薪資單查看放進第一週必修訓練。</p>
          <Link className="button" href="#training-course-wizard">
            調整課程
          </Link>
        </article>
        <article className={`settings-command-card ${readiness.assignedCount > 0 ? "ready" : "warning"}`}>
          <span className="eyebrow">自動指派</span>
          <h2>新人不漏接</h2>
          <p>HR 可一鍵把啟用中的到職必修課程指派給所有在職員工，後續交給員工手機端完成。</p>
          <Link className="button" href="#training-readiness-gate">
            查看指派
          </Link>
        </article>
        <article className={`settings-command-card ${settings.verificationStatus === "verified" ? "ready" : "danger"}`}>
          <span className="eyebrow">HR 複核</span>
          <h2>內容先審再上線</h2>
          <p>訓練內容與來源要先完成 HR 或法遵複核，避免員工收到未確認的政策說明。</p>
          <Link className="button" href="#training-settings">
            更新複核
          </Link>
        </article>
        <article className={`settings-command-card ${readiness.overdueCount === 0 ? "ready" : "warning"}`}>
          <span className="eyebrow">完成證據</span>
          <h2>稽核只看摘要</h2>
          <p>員工完成確認會寫入 audit log；後台只呈現課程、版本、期限和完成狀態，不回顯私密內容。</p>
          <Link className="button" href="#training-assignments">
            查看紀錄
          </Link>
        </article>
      </section>

      <section className="grid">
        <section
          className={`panel span-12 training-center-gate ${readiness.ready ? "ready" : "danger"}`}
          id="training-readiness-gate"
          aria-label="訓練上線 Gate"
        >
          <div className="section-heading">
            <div>
              <h2>訓練上線 Gate</h2>
              <p className="muted">{trainingReadinessDetail(settings, readiness)}</p>
            </div>
            <form action="/api/training" method="post">
              <input type="hidden" name="intent" value="assign_required" />
              <button className="button primary" type="submit">
                指派必修訓練
              </button>
            </form>
          </div>

          {readiness.missing.length > 0 ? (
            <ul className="task-list">
              {readiness.missing.map((item) => (
                <li className="task training-center-task warning" key={item}>
                  <span>
                    <strong>{localizeTrainingMissing(item)}</strong>
                    <small>這項未完成前，不建議邀請真實員工進入試用。</small>
                  </span>
                  <span className="badge warning">待處理</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="task training-center-task done">
              <span>
                <strong>訓練方案已符合上線門檻</strong>
                <small>必修課程已複核、分鐘數符合 KPI、員工指派與完成狀態可被追蹤。</small>
              </span>
              <span className="badge">可上線</span>
            </div>
          )}
        </section>

        <section className="panel span-5" id="training-settings">
          <div className="section-heading">
            <div>
              <h2>三步訓練控制</h2>
              <p className="muted">設定必修、期限與 HR 複核狀態；所有變更都會寫入稽核紀錄。</p>
            </div>
            <span className="badge">audit log</span>
          </div>
          <form action="/api/training" method="post" className="mini-form training-center-form" aria-label="訓練控制設定">
            <input type="hidden" name="intent" value="settings" />
            <fieldset className="training-center-fieldset">
              <legend>1. 指派規則</legend>
              <label className="check-row">
                <input
                  name="onboardingTrainingRequired"
                  type="checkbox"
                  defaultChecked={settings.onboardingTrainingRequired}
                />
                到職訓練為必修
              </label>
              <label className="check-row">
                <input name="autoAssignNewHires" type="checkbox" defaultChecked={settings.autoAssignNewHires} />
                新進員工自動指派
              </label>
            </fieldset>

            <fieldset className="training-center-fieldset">
              <legend>2. 時間目標</legend>
              <div className="field-grid">
                <label>
                  完成期限（天）
                  <input
                    name="targetCompletionDays"
                    type="number"
                    min="1"
                    max="30"
                    defaultValue={settings.targetCompletionDays}
                  />
                </label>
                <label>
                  第一週教學分鐘上限
                  <input
                    name="maxFirstWeekMinutes"
                    type="number"
                    min="1"
                    max="60"
                    defaultValue={settings.maxFirstWeekMinutes}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="training-center-fieldset">
              <legend>3. 上線複核</legend>
              <label>
                HR 複核狀態
                <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                  <option value="unverified">待複核</option>
                  <option value="verified">已複核</option>
                  <option value="failed">複核未通過</option>
                </select>
              </label>
              <label>
                最近複核
                <input value={settings.lastReviewedAt ? formatDateTime(settings.lastReviewedAt) : "尚未複核"} readOnly />
              </label>
            </fieldset>

            <button className="button primary" type="submit">
              儲存訓練控制
            </button>
          </form>
        </section>

        <section className="panel span-7" id="training-course-wizard">
          <div className="section-heading">
            <div>
              <h2>課程建立精靈</h2>
              <p className="muted">用短課程承接員工最常做的任務，避免把政策手冊塞進第一週。</p>
            </div>
            <span className="badge">無需工程</span>
          </div>
          <form action="/api/training" method="post" className="mini-form training-center-form" aria-label="訓練課程精靈">
            <input type="hidden" name="intent" value="course" />
            <div className="field-grid">
              <label>
                課程名稱
                <input name="title" defaultValue="HR One 手機任務與資料安全" required />
              </label>
              <label>
                分類
                <input name="category" defaultValue="到職訓練" required />
              </label>
              <label>
                版本
                <input name="version" defaultValue="2026.01" required />
              </label>
              <label>
                預估分鐘
                <input name="estimatedMinutes" type="number" min="1" max="60" defaultValue="2" />
              </label>
              <label>
                狀態
                <select name="status" defaultValue="active">
                  <option value="active">啟用</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
              <label>
                來源參照
                <input name="sourceRef" defaultValue="evidence://training/hr-one-mobile" />
              </label>
            </div>
            <label>
              課程說明
              <textarea
                name="description"
                rows={4}
                defaultValue="手機打卡、60 秒請假、薪資單查看與個資保護的快速導覽。"
                required
              />
            </label>
            <label className="check-row">
              <input name="requiredForOnboarding" type="checkbox" defaultChecked />
              到職必修
            </label>
            <button className="button primary" type="submit">
              儲存訓練課程
            </button>
          </form>
        </section>

        <section className="panel span-6">
          <div className="section-heading">
            <div>
              <h2>課程清單</h2>
              <p className="muted">啟用且標記到職必修的課程會計入第一週訓練分鐘。</p>
            </div>
            <span className="badge">{workspace.courses.length} 門</span>
          </div>
          {workspace.courses.length > 0 ? (
            <ul className="task-list">
              {workspace.courses.map((course) => (
                <TrainingCourseCard course={course} key={course.id} />
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>尚未建立訓練課程</strong>
              <p>先建立一門 10 分鐘內的到職必修課，再指派給員工。</p>
            </div>
          )}
        </section>

        <section className="panel span-6" id="training-assignments">
          <div className="section-heading">
            <div>
              <h2>員工指派紀錄</h2>
              <p className="muted">顯示完成狀態與課程版本，不揭露私人筆記或敏感員工資料。</p>
            </div>
            <span className="badge">{workspace.assignments.length} 筆</span>
          </div>
          {workspace.assignments.length > 0 ? (
            <ul className="task-list training-center-list">
              {workspace.assignments.map((assignment) => (
                <TrainingAssignmentCard assignment={assignment} key={assignment.id} />
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>尚未指派訓練</strong>
              <p>按下「指派必修訓練」後，員工會在手機端看到待完成任務。</p>
            </div>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>訓練治理原則</h2>
              <p className="muted">這些護欄讓導入訓練可以被販售、被稽核，也能讓員工第一次使用就完成任務。</p>
            </div>
            <span className="badge">{activeCourses} 啟用 · {requiredCourses.length} 必修</span>
          </div>
          <div className="training-center-guardrail-grid">
            <article>
              <strong>第一週少於 10 分鐘</strong>
              <p>把長篇政策拆成後續閱讀，第一週只放員工必須完成的手機任務。</p>
            </article>
            <article>
              <strong>手機端一鍵完成</strong>
              <p>員工端只需閱讀、確認、回到首頁，不要求理解後台術語。</p>
            </article>
            <article>
              <strong>內容複核後發布</strong>
              <p>HR 或法遵確認版本與來源後再啟用，避免錯誤政策被大量指派。</p>
            </article>
            <article>
              <strong>稽核紀錄不含私密內容</strong>
              <p>audit log 記錄版本、狀態與雜湊證據，不存放私人筆記或敏感原文。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function TrainingCourseCard({ course }: { course: TrainingCourseView }) {
  return (
    <li className={`task training-center-task ${course.status === "active" ? "done" : "warning"}`}>
      <span>
        <strong>{course.title}</strong>
        <small>
          {course.category} · {course.version} · {course.estimatedMinutes} 分鐘
        </small>
        <small>
          {course.requiredForOnboarding ? "到職必修" : "非必修"} · 來源 {course.sourceRef ?? "未設定"} · 發布 {formatDate(course.publishedAt)}
        </small>
        <small>{course.description}</small>
      </span>
      <span className={`badge ${course.status === "inactive" ? "warning" : ""}`}>
        {courseStatusLabel(course.status)}
      </span>
    </li>
  );
}

function TrainingAssignmentCard({ assignment }: { assignment: TrainingAssignmentView }) {
  return (
    <li className={`task training-center-task ${assignmentTone(assignment)}`}>
      <span>
        <strong>
          {assignment.employeeName} · {assignment.courseTitle}
        </strong>
        <small>
          {assignment.courseVersion} · {assignment.estimatedMinutes} 分鐘 · 期限 {formatDate(assignment.dueAt)}
        </small>
        <small>{assignment.completedAt ? `完成 ${formatDateTime(assignment.completedAt)}` : "員工尚未完成手機確認"}</small>
      </span>
      <span className={`badge ${assignment.status === "assigned" ? "warning" : ""}`}>
        {assignmentStatusLabel(assignment.status)}
      </span>
    </li>
  );
}

function buildTrainingFocus(settings: CompanyTrainingSettings, readiness: TrainingReadiness) {
  if (readiness.ready) {
    return {
      tone: "ready",
      title: "訓練 Gate 可上線",
      copy: "第一週分鐘數、HR 複核、必修指派與完成狀態都已達標，可納入試用邀請證據包。",
      meta: `必修 ${readiness.requiredCourseCount} 門，完成 ${readiness.completedCount}/${readiness.assignedCount} 筆。`,
      action: "查看證據",
      href: "#training-assignments",
    };
  }

  if (readiness.requiredMinutes > settings.maxFirstWeekMinutes) {
    return {
      tone: "warning",
      title: "第一週教學超過上限",
      copy: "請把非必要內容改成選修或拆到第二週，避免導入第一週教學超過 10 分鐘 KPI。",
      meta: `目前 ${readiness.requiredMinutes} 分鐘，上限 ${settings.maxFirstWeekMinutes} 分鐘。`,
      action: "調整課程",
      href: "#training-course-wizard",
    };
  }

  if (settings.verificationStatus !== "verified") {
    return {
      tone: "danger",
      title: "HR 複核尚未完成",
      copy: "訓練內容發布前要確認來源、版本與員工文字，避免用錯政策或導入說明。",
      meta: `目前狀態：${verificationStatusLabel(settings.verificationStatus)}。`,
      action: "更新複核",
      href: "#training-settings",
    };
  }

  if (readiness.assignedCount === 0) {
    return {
      tone: "warning",
      title: "必修訓練尚未指派",
      copy: "請先指派必修課程，員工才會在手機端看到待完成任務。",
      meta: `必修課程 ${readiness.requiredCourseCount} 門。`,
      action: "查看 Gate",
      href: "#training-readiness-gate",
    };
  }

  return {
    tone: readiness.overdueCount > 0 ? "warning" : "danger",
    title: readiness.overdueCount > 0 ? "有逾期訓練待追蹤" : "仍有上線缺口",
    copy: readiness.overdueCount > 0
      ? "請追蹤逾期員工完成訓練，避免試用前的必修證據不完整。"
      : "請依 Gate 缺口完成設定、指派或課程調整。",
    meta: `缺口 ${readiness.missing.length} 項，逾期 ${readiness.overdueCount} 筆。`,
    action: "查看缺口",
    href: "#training-readiness-gate",
  };
}

function trainingReadinessDetail(settings: CompanyTrainingSettings, readiness: TrainingReadiness) {
  return [
    `必修 ${readiness.requiredCourseCount} 門`,
    `${readiness.requiredMinutes}/${settings.maxFirstWeekMinutes} 分鐘`,
    `指派 ${readiness.assignedCount} 筆`,
    `完成 ${readiness.completedCount} 筆`,
    `逾期 ${readiness.overdueCount} 筆`,
    `HR 複核 ${verificationStatusLabel(settings.verificationStatus)}`,
  ].join(" · ");
}

function verificationStatusLabel(status: TrainingVerificationStatus) {
  const labels: Record<TrainingVerificationStatus, string> = {
    failed: "複核未通過",
    unverified: "待複核",
    verified: "已複核",
  };
  return labels[status];
}

function courseStatusLabel(status: TrainingCourseView["status"]) {
  return status === "active" ? "啟用" : "停用";
}

function assignmentStatusLabel(status: TrainingAssignmentView["status"]) {
  return status === "completed" ? "已完成" : "待完成";
}

function assignmentTone(assignment: TrainingAssignmentView) {
  if (assignment.status === "completed") return "done";
  return assignment.dueAt.getTime() < Date.now() ? "danger" : "warning";
}

function localizeTrainingMissing(item: string) {
  const labels: Record<string, string> = {
    "active onboarding training course": "尚未建立啟用中的到職必修課程",
    "first-week training under KPI target": "第一週訓練分鐘數超過 KPI 上限",
    "overdue required training": "有逾期未完成的必修訓練",
    "required training assigned to active employees": "必修訓練尚未指派給所有在職員工",
    "training plan HR/legal review": "訓練方案尚未完成 HR 或法遵複核",
  };
  return labels[item] ?? item;
}

function localizeTrainingError(error: string) {
  return error
    .replace("Create at least one active onboarding course before assigning training.", "請先建立至少一門啟用中的到職必修課程，再指派給員工。")
    .replace("Role employee cannot training:manage", "目前角色沒有管理訓練的權限，請切換 HR 或 Owner。")
    .replace("Unable to update training.", "訓練資料更新失敗。")
    .replace("Unknown training action.", "未知的訓練操作。");
}

function formatDate(date?: Date | null) {
  if (!date) return "未發布";
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
