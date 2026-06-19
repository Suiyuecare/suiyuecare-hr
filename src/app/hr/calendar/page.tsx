import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getCompanyCalendarWorkspace,
  type CalendarDayType,
  type CalendarReviewStatus,
  type CompanyCalendarDayView,
  type CompanyCalendarReadiness,
} from "@/server/calendar/company-calendar";

type SearchParams = Promise<{
  error?: string;
}>;

type CalendarFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function HrCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page company-calendar-page">
        <section className="hr-monthly-hero company-calendar-hero" aria-label="公司行事曆工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">排班與法遵</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>公司行事曆工作台</h1>
            <p>這是 HR 後台設定頁，只開放可檢視公司設定的角色使用。員工請回前台查看自己的班表、請假與公告。</p>
            <div className="hr-monthly-hero-actions">
              <Link className="button primary" href="/app">
                回員工前台
              </Link>
              <Link className="button" href="/console">
                切換後台角色
              </Link>
            </div>
          </div>
          <aside className="hr-monthly-hero-focus danger" aria-label="今日先處理">
            <span className="badge">安全控管</span>
            <strong>行事曆設定已保護</strong>
            <p>國定假日、補班日與公司休假日會影響排班、請假衝突、加班與薪資月結，未授權角色不顯示設定資料。</p>
            <small>請由 HR、Owner 或行政管理角色進入。</small>
          </aside>
        </section>
      </main>
    );
  }

  const workspace = await getCompanyCalendarWorkspace(session);
  const { days, reviews, readiness } = workspace;
  const activeReview = readiness.review;
  const currentYearDays = days.filter((day) => taiwanCalendarYear(day.calendarDate) === readiness.calendarYear);
  const holidayCount = currentYearDays.filter((day) => day.dayType !== "makeup_workday" && !day.requiresWork).length;
  const makeupWorkdayCount = currentYearDays.filter((day) => day.requiresWork).length;
  const governmentSourceCount = currentYearDays.filter((day) => day.source === "government").length;
  const companyOverrideCount = currentYearDays.filter((day) => day.source === "company" || day.dayType === "company_holiday").length;
  const focus = buildCalendarFocus(readiness);

  return (
    <main className="page company-calendar-page">
      <section className="hr-monthly-hero company-calendar-hero" aria-label="公司行事曆工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">排班與法遵</span>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "可進月結" : "阻擋上線"}
            </span>
          </div>
          <h1>公司行事曆工作台</h1>
          <p>
            管理台灣國定假日、補班日、公司休假日與年度官方來源審核，讓排班、請假衝突、工時法遵與薪資月結都使用同一份可稽核日曆。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#calendar-review-wizard">
              年度審核
            </Link>
            <Link className="button" href="#calendar-day-wizard">
              新增日期
            </Link>
            <Link className="button" href="/hr/shift-templates">
              排班設定
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          <Link className="button primary" href={focus.href}>
            {focus.actionLabel}
          </Link>
        </aside>
      </section>

      {params.error ? (
        <section className="company-calendar-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>公司行事曆未更新</strong>
            <p>{localizeCalendarError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board company-calendar-signal-board" aria-label="行事曆訊號板">
        <article className={`hr-monthly-signal-card ${readiness.ready ? "done" : "danger"}`}>
          <span>{readiness.calendarYear} 年審核</span>
          <strong>{readiness.ready ? "通過" : `${readiness.missing.length} 項缺口`}</strong>
          <small>{readiness.ready ? "官方來源、日期筆數與審核狀態已可支援上線 Gate。" : readiness.missing.map(localizeMissing).join("、")}</small>
        </article>
        <article className={`hr-monthly-signal-card ${holidayCount ? "done" : "warning"}`}>
          <span>休假日</span>
          <strong>{holidayCount} 天</strong>
          <small>國定假日與公司休假日會影響請假扣抵、假日出勤與薪資判斷。</small>
        </article>
        <article className={`hr-monthly-signal-card ${makeupWorkdayCount ? "warning" : "done"}`}>
          <span>補班日</span>
          <strong>{makeupWorkdayCount} 天</strong>
          <small>補班日要進入排班與工時檢查，避免員工首頁顯示錯誤。</small>
        </article>
        <article className={`hr-monthly-signal-card ${governmentSourceCount ? "focus" : "warning"}`}>
          <span>來源證據</span>
          <strong>{governmentSourceCount} 筆官方</strong>
          <small>另有 {companyOverrideCount} 筆公司設定；正式上線前需保留審核來源與 audit log。</small>
        </article>
      </section>

      <section className="settings-command-grid company-calendar-command-grid" aria-label="行事曆作業卡">
        <article className={`settings-command-card ${readiness.ready ? "ready" : "warning"}`}>
          <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
            {readiness.ready ? "已審核" : "需審核"}
          </span>
          <h2>年度官方來源</h2>
          <p>每年需由 HR 或行政主管核對行政院人事行政總處等官方來源，並保留檢查日期與審核人。</p>
          <Link className="button primary" href="#calendar-review-wizard">
            更新審核
          </Link>
        </article>
        <article className={`settings-command-card ${holidayCount ? "ready" : "warning"}`}>
          <span className={`badge ${holidayCount ? "done" : "warning"}`}>
            {holidayCount ? "有日期" : "待匯入"}
          </span>
          <h2>假日與公司休假</h2>
          <p>國定假日、公司休假日與有薪/無薪設定會影響假勤餘額、假日出勤與薪資草稿。</p>
          <Link className="button" href="#calendar-day-wizard">
            新增日期
          </Link>
        </article>
        <article className={`settings-command-card ${makeupWorkdayCount ? "warning" : "ready"}`}>
          <span className={`badge ${makeupWorkdayCount ? "warning" : "done"}`}>
            {makeupWorkdayCount ? "需排班" : "無補班"}
          </span>
          <h2>補班日排班</h2>
          <p>補班日不是普通假日，需與班別、工時約定、員工首頁與月結檢查同步。</p>
          <Link className="button" href="/hr/shift-templates">
            排班設定
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">月結護欄</span>
          <h2>月結前要能追溯</h2>
          <p>薪資月結、出勤異常與工時法遵都會讀取行事曆；變更日期必須留下稽核證據。</p>
          <Link className="button" href="/hr/worktime-compliance">
            工時法遵
          </Link>
        </article>
      </section>

      <section className="grid">
        <form
          action="/api/calendar/days"
          method="post"
          className="panel span-7 wizard-form company-calendar-review-form"
          id="calendar-review-wizard"
          aria-label="年度行事曆審核精靈"
        >
          <input type="hidden" name="action" value="review" />
          <div className="section-heading">
            <div>
              <h2>年度行事曆審核精靈</h2>
              <p className="muted">用官方來源與實際日期筆數確認年度行事曆，這會影響 production readiness。</p>
            </div>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "可上線" : "阻擋上線"}
            </span>
          </div>

          {readiness.missing.length > 0 ? (
            <div className="company-calendar-missing-list" aria-label="行事曆缺口">
              {readiness.missing.map((item) => (
                <span className="badge warning" key={item}>
                  {localizeMissing(item)}
                </span>
              ))}
            </div>
          ) : null}

          <fieldset>
            <legend>1. 年度與狀態</legend>
            <div className="field-grid">
              <label>
                年度
                <input name="calendarYear" type="number" min="2020" max="2100" defaultValue={readiness.calendarYear} required />
              </label>
              <label>
                審核狀態
                <select name="reviewStatus" defaultValue={activeReview?.reviewStatus ?? "pending_review"}>
                  <option value="pending_review">待審核</option>
                  <option value="approved">已核准</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>2. 官方來源</legend>
            <div className="field-grid">
              <label>
                來源名稱
                <input name="sourceTitle" defaultValue={displaySourceTitle(activeReview?.sourceTitle)} required />
              </label>
              <label>
                來源網址
                <input name="sourceUrl" type="url" defaultValue={activeReview?.sourceUrl ?? "https://www.dgpa.gov.tw/"} required />
              </label>
              <label>
                來源檢查日
                <input name="sourceCheckedAt" type="date" defaultValue={formatInputDate(activeReview?.sourceCheckedAt)} required />
              </label>
            </div>
            <p className="muted">來源網址必須使用 HTTPS；正式上線前來源檢查日不可過期。</p>
          </fieldset>

          <fieldset>
            <legend>3. 審核人與日期筆數</legend>
            <div className="field-grid">
              <label>
                審核人
                <input name="reviewedBy" defaultValue={activeReview?.reviewedBy ?? session.user?.displayName ?? ""} required />
              </label>
              <label>
                審核日期
                <input name="reviewedAt" type="date" defaultValue={formatInputDate(activeReview?.reviewedAt)} required />
              </label>
              <label>
                國定假日數
                <input name="nationalHolidayCount" type="number" min="0" defaultValue={activeReview?.nationalHolidayCount ?? readiness.counts.nationalHolidays} required />
              </label>
              <label>
                補班日數
                <input name="makeupWorkdayCount" type="number" min="0" defaultValue={activeReview?.makeupWorkdayCount ?? readiness.counts.makeupWorkdays} required />
              </label>
              <label>
                公司休假日數
                <input name="companyHolidayCount" type="number" min="0" defaultValue={activeReview?.companyHolidayCount ?? readiness.counts.companyHolidays} required />
              </label>
            </div>
          </fieldset>

          <label>
            審核備註
            <textarea name="reviewNotes" defaultValue={displayReviewNotes(activeReview?.notes)} />
          </label>

          <button className="button primary" type="submit">
            儲存年度審核
          </button>
        </form>

        <section className="panel span-5" id="calendar-day-wizard">
          <div className="section-heading">
            <div>
              <h2>日期設定精靈</h2>
              <p className="muted">新增國定假日、補班日、公司休假日或工作日覆寫。</p>
            </div>
            <span className="badge">會寫入稽核</span>
          </div>

          <form action="/api/calendar/days" method="post" className="wizard-form company-calendar-day-form" aria-label="日期設定精靈">
            <fieldset>
              <legend>1. 日期與類型</legend>
              <label>
                日期
                <input name="calendarDate" type="date" defaultValue={defaultDate()} required />
              </label>
              <label>
                日期類型
                <select name="dayType" defaultValue="national_holiday">
                  <option value="national_holiday">國定假日</option>
                  <option value="company_holiday">公司休假日</option>
                  <option value="makeup_workday">補班日</option>
                  <option value="regular_workday">工作日覆寫</option>
                </select>
              </label>
              <label>
                名稱
                <input name="name" defaultValue="公司審核假日" required />
              </label>
            </fieldset>

            <fieldset>
              <legend>2. 來源與薪資影響</legend>
              <label>
                來源
                <select name="source" defaultValue="company">
                  <option value="company">公司審核</option>
                  <option value="government">官方來源</option>
                  <option value="import">匯入資料</option>
                </select>
              </label>
              <div className="toggle-row company-calendar-toggles">
                <label>
                  <input name="paid" type="checkbox" defaultChecked />
                  有薪
                </label>
                <label>
                  <input name="requiresWork" type="checkbox" />
                  需出勤
                </label>
              </div>
            </fieldset>

            <label>
              備註
              <textarea name="notes" defaultValue="月結前請確認此日期已與排班、請假與工時法遵同步。" />
            </label>

            <button className="button primary" type="submit">
              儲存日期
            </button>
          </form>
        </section>

        <section className="panel span-12" id="calendar-day-list">
          <div className="section-heading">
            <div>
              <h2>行事曆日期</h2>
              <p className="muted">日期會影響員工首頁班表、請假衝突、假日出勤、補班與薪資月結。</p>
            </div>
            <span className={`badge ${days.length ? "done" : "warning"}`}>
              {days.length ? `${days.length} 筆` : "尚未設定"}
            </span>
          </div>
          {days.length === 0 ? (
            <EmptyState title="尚無行事曆日期" body="請先新增國定假日或補班日，排班與月結才有共同依據。" />
          ) : (
            <ul className="task-list company-calendar-day-list">
              {days.map((day) => (
                <li className={`task company-calendar-task ${dayTone(day)}`} key={day.id}>
                  <span className="company-calendar-copy">
                    <strong>
                      {formatDate(day.calendarDate)} · {displayDayName(day.name)}
                    </strong>
                    <small>
                      {dayTypeLabel(day.dayType)} · {sourceLabel(day.source)}
                      {day.notes ? ` · ${displayCalendarNotes(day.notes)}` : ""}
                    </small>
                  </span>
                  <span className={`badge ${day.requiresWork ? "warning" : "done"}`}>
                    {day.requiresWork ? "需出勤" : "休假"} · {day.paid ? "有薪" : "無薪"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>年度審核紀錄</h2>
              <p className="muted">保存每年官方來源、檢查日、審核人與應有日期筆數。</p>
            </div>
            <span className={`badge ${reviews.length ? "done" : "warning"}`}>
              {reviews.length ? `${reviews.length} 筆` : "尚無紀錄"}
            </span>
          </div>
          {reviews.length === 0 ? (
            <EmptyState title="尚無年度審核" body="請先新增年度官方來源審核，production readiness 才能通過。" />
          ) : (
            <ul className="task-list company-calendar-review-list">
              {reviews.map((review) => (
                <li className={`task company-calendar-task ${review.reviewStatus === "approved" ? "ready" : "warning"}`} key={review.id}>
                  <span className="company-calendar-copy">
                    <strong>{review.calendarYear} · {displaySourceTitle(review.sourceTitle)}</strong>
                    <small>
                      {reviewStatusLabel(review.reviewStatus)} · 來源檢查 {formatInputDate(review.sourceCheckedAt)} · 審核人 {review.reviewedBy}
                    </small>
                    <small>
                      國定假日 {review.nationalHolidayCount} · 補班日 {review.makeupWorkdayCount} · 公司休假 {review.companyHolidayCount}
                    </small>
                  </span>
                  <span className={`badge ${review.reviewStatus === "approved" ? "done" : "warning"}`}>
                    {reviewStatusLabel(review.reviewStatus)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-5" id="calendar-governance">
          <div className="section-heading">
            <div>
              <h2>行事曆治理原則</h2>
              <p className="muted">公司行事曆是排班、假勤、工時與薪資的共同基準。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看稽核
            </Link>
          </div>
          <div className="company-calendar-guardrail-grid">
            <article>
              <span className="badge done">官方來源</span>
              <strong>年度審核不可省略</strong>
              <p>每年需核對官方來源、審核人與檢查日，避免假日與補班日過期。</p>
            </article>
            <article>
              <span className="badge warning">月結影響</span>
              <strong>補班日要進排班</strong>
              <p>補班日需同步班表、請假衝突、工時掃描與薪資月結。</p>
            </article>
            <article>
              <span className="badge danger">資料最小化</span>
              <strong>備註不放敏感內容</strong>
              <p>行事曆備註只放來源與審核脈絡，不輸入薪資、身分證、健康或私人 HR 備註。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildCalendarFocus(readiness: CompanyCalendarReadiness): CalendarFocus {
  if (!readiness.review) {
    return {
      title: "先建立年度來源審核",
      detail: `${readiness.calendarYear} 年尚未建立官方行事曆來源審核，排班與薪資月結不能進入正式上線。`,
      note: "先填入官方來源、檢查日、審核人與日期筆數。",
      tone: "danger",
      href: "#calendar-review-wizard",
      actionLabel: "建立審核",
    };
  }
  if (readiness.missing.includes("approved review status")) {
    return {
      title: "先核准年度行事曆",
      detail: "年度來源已建立，但仍是待審核狀態；正式上線前必須由 HR 或行政主管核准。",
      note: "核准前請確認官方來源、國定假日與補班日筆數一致。",
      tone: "warning",
      href: "#calendar-review-wizard",
      actionLabel: "更新審核",
    };
  }
  const missingRecords = readiness.missing.filter((item) => item.endsWith("records"));
  if (missingRecords.length > 0) {
    return {
      title: "補齊假日與補班日",
      detail: `年度審核已設定，但缺少 ${missingRecords.map(localizeMissing).join("、")}，會阻擋 production gate。`,
      note: "先新增缺少的日期，再回來核對年度審核筆數。",
      tone: "danger",
      href: "#calendar-day-wizard",
      actionLabel: "新增日期",
    };
  }
  if (readiness.missing.length > 0) {
    return {
      title: "補齊來源審核缺口",
      detail: readiness.missing.map(localizeMissing).join("、"),
      note: "行事曆來源必須可追溯，且來源網址需使用 HTTPS。",
      tone: "warning",
      href: "#calendar-review-wizard",
      actionLabel: "補齊審核",
    };
  }
  return {
    title: "行事曆可進入月結",
    detail: `${readiness.calendarYear} 年年度來源、國定假日、補班日與公司休假日已通過 readiness 檢查。`,
    note: "下一步請確認排班設定、工時法遵與薪資月結都讀取同一份行事曆。",
    tone: "ready",
    href: "/hr/shift-templates",
    actionLabel: "檢查排班",
  };
}

function localizeMissing(item: string) {
  const labels: Record<string, string> = {
    "approved annual calendar review": "年度來源審核",
    "approved review status": "審核核准狀態",
    "HTTPS official source URL": "HTTPS 官方來源",
    reviewer: "審核人",
    "fresh government source review": "來源檢查日未過期",
    "national holiday records": "國定假日日期",
    "makeup workday records": "補班日日期",
    "company holiday records": "公司休假日日期",
  };
  return labels[item] ?? item;
}

function localizeCalendarError(error: string) {
  if (error.includes("settings:write") || error.includes("permission")) {
    return "目前角色沒有更新公司行事曆的權限，請切換 HR、Owner 或行政管理角色。";
  }
  if (error.includes("Calendar day name")) return "請輸入日期名稱。";
  if (error.includes("Calendar date")) return "請輸入有效日期。";
  if (error.includes("Calendar year")) return "年度必須介於 2020 到 2100。";
  if (error.includes("source title")) return "請輸入來源名稱。";
  if (error.includes("source URL")) return "來源網址必須使用 HTTPS。";
  if (error.includes("source checked date")) return "請輸入來源檢查日。";
  if (error.includes("reviewer")) return "請輸入審核人。";
  if (error.includes("reviewed date")) return "請輸入審核日期。";
  return error;
}

function dayTone(day: CompanyCalendarDayView) {
  if (day.requiresWork || day.dayType === "makeup_workday") return "warning";
  if (day.source === "government" || day.dayType === "national_holiday") return "ready";
  return "muted";
}

function dayTypeLabel(dayType: CalendarDayType) {
  const labels: Record<CalendarDayType, string> = {
    national_holiday: "國定假日",
    company_holiday: "公司休假日",
    makeup_workday: "補班日",
    regular_workday: "工作日覆寫",
  };
  return labels[dayType];
}

function sourceLabel(source: CompanyCalendarDayView["source"]) {
  const labels: Record<CompanyCalendarDayView["source"], string> = {
    company: "公司審核",
    government: "官方來源",
    import: "匯入資料",
  };
  return labels[source];
}

function reviewStatusLabel(status: CalendarReviewStatus) {
  return status === "approved" ? "已核准" : "待審核";
}

function defaultDate() {
  const now = new Date();
  now.setDate(now.getDate() + 7);
  return now.toISOString().slice(0, 10);
}

function displaySourceTitle(title?: string | null) {
  if (!title) return "行政院人事行政總處年度辦公日曆";
  return title
    .replace("Demo Taiwan government calendar source", "示範台灣官方行事曆來源")
    .replace("DGPA annual work calendar", "行政院人事行政總處年度辦公日曆");
}

function displayReviewNotes(notes?: string | null) {
  if (!notes) return "已依官方年度行事曆核對，排班、請假與薪資月結前需再次確認。";
  return notes
    .replace("Demo review remains pending so production readiness stays honest.", "示範資料維持待審核，讓 production readiness 如實阻擋。")
    .replace("Reviewed against official annual calendar before schedule/payroll launch.", "已依官方年度行事曆核對，排班與薪資月結前需再次確認。");
}

function displayDayName(name: string) {
  return name
    .replace("New Year holiday", "元旦假日")
    .replace("Makeup workday", "補班日")
    .replace("Company reviewed holiday", "公司審核假日");
}

function displayCalendarNotes(notes: string) {
  return notes
    .replace("Demo configurable holiday. Verify official source before production import.", "示範可調整假日；正式匯入前需核對官方來源。")
    .replace("Demo makeup workday.", "示範補班日。")
    .replace("Review against company calendar before payroll close.", "月結前請確認公司行事曆。");
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatInputDate(date?: Date | null) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date ?? new Date());
}

function taiwanCalendarYear(date: Date) {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Taipei", year: "numeric" }).format(date));
}
