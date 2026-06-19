import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getShiftTemplateSettings,
  type ShiftTemplateView,
} from "@/server/scheduling/shift-templates";

type SearchParams = Promise<{
  error?: string;
}>;

type ShiftFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

const weekdays = [
  ["1", "週一"],
  ["2", "週二"],
  ["3", "週三"],
  ["4", "週四"],
  ["5", "週五"],
  ["6", "週六"],
  ["0", "週日"],
] as const;

export default async function ShiftTemplatesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page shift-template-page">
        <section className="hr-monthly-hero shift-template-hero" aria-label="排班設定工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">排班管理</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>排班設定工作台</h1>
            <p>這是後台設定頁，只開放具備設定檢視權限的 HR、Owner 或行政管理角色使用。一般員工請回前台查看自己的班表與出勤狀態。</p>
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
            <strong>排班資料已保護</strong>
            <p>班表會影響出勤、請假衝突、加班與薪資月結，未授權角色不顯示任何排班設定。</p>
            <small>請使用 HR、Owner 或行政主任示範角色進入。</small>
          </aside>
        </section>
      </main>
    );
  }

  const templates = await getShiftTemplateSettings(session);
  const activeTemplates = templates.filter((template) => template.status === "active");
  const inactiveCount = templates.length - activeTemplates.length;
  const crossMidnightCount = templates.filter((template) => template.crossesMidnight).length;
  const generatedScheduleCount = templates.reduce((sum, template) => sum + template.scheduleCount, 0);
  const focus = buildShiftFocus({
    activeTemplateCount: activeTemplates.length,
    crossMidnightCount,
    generatedScheduleCount,
  });

  return (
    <main className="page shift-template-page">
      <section className="hr-monthly-hero shift-template-hero" aria-label="排班設定工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">排班管理</span>
            <span className={`badge ${activeTemplates.length ? "done" : "warning"}`}>
              {activeTemplates.length ? "可產生排班" : "需建立班別"}
            </span>
          </div>
          <h1>排班設定工作台</h1>
          <p>
            先定義常用班別，再產生日排班，讓員工首頁、請假衝突、加班警示、工時法遵與薪資月結都使用同一份班表證據。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#shift-template-wizard">
              建立班別
            </Link>
            <Link className="button" href="#schedule-generation">
              產生日排班
            </Link>
            <Link className="button" href="/hr/worktime-compliance">
              工時法遵
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
        <section className="shift-template-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>排班設定未更新</strong>
            <p>{localizeShiftError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board shift-template-signal-board" aria-label="排班設定訊號板">
        <article className={`hr-monthly-signal-card ${activeTemplates.length ? "done" : "warning"}`}>
          <span>啟用班別</span>
          <strong>{activeTemplates.length} 個</strong>
          <small>員工首頁與日排班只能使用啟用班別。</small>
        </article>
        <article className={`hr-monthly-signal-card ${crossMidnightCount ? "warning" : "done"}`}>
          <span>跨日班</span>
          <strong>{crossMidnightCount} 個</strong>
          <small>夜班與跨日班需要特別檢查休息時間、加班與例休風險。</small>
        </article>
        <article className={`hr-monthly-signal-card ${generatedScheduleCount ? "focus" : "warning"}`}>
          <span>已生成排班</span>
          <strong>{generatedScheduleCount} 筆</strong>
          <small>排班生成、重發與覆蓋都會留下稽核紀錄。</small>
        </article>
        <article className={`hr-monthly-signal-card ${inactiveCount ? "warning" : "done"}`}>
          <span>停用班別</span>
          <strong>{inactiveCount} 個</strong>
          <small>停用班別保留歷史，不再進入新的日排班。</small>
        </article>
      </section>

      <section className="settings-command-grid shift-template-command-grid" aria-label="排班設定作業卡">
        <article className={`settings-command-card ${activeTemplates.length ? "ready" : "warning"}`}>
          <span className={`badge ${activeTemplates.length ? "done" : "warning"}`}>
            {activeTemplates.length ? "班別可用" : "需先建立"}
          </span>
          <h2>班別管理</h2>
          <p>設定代碼、名稱、上下班時間、休息分鐘與適用星期，避免每次排班重新輸入。</p>
          <Link className="button primary" href="#shift-template-wizard">
            建立班別
          </Link>
        </article>
        <article className={`settings-command-card ${activeTemplates.length ? "ready" : "warning"}`}>
          <span className={`badge ${activeTemplates.length ? "done" : "warning"}`}>
            {activeTemplates.length ? "可生成" : "等待班別"}
          </span>
          <h2>一日排班</h2>
          <p>用啟用班別為所有在職員工產生日排班，覆蓋既有排班時保留 audit log。</p>
          <Link className="button" href="#schedule-generation">
            產生日排班
          </Link>
        </article>
        <article className={`settings-command-card ${crossMidnightCount ? "warning" : "ready"}`}>
          <span className={`badge ${crossMidnightCount ? "warning" : "done"}`}>
            {crossMidnightCount ? "需複核" : "沒有跨日"}
          </span>
          <h2>跨日班複核</h2>
          <p>跨日班會影響日工時、休息間隔與加班歸屬，排班後要回工時法遵檢查。</p>
          <Link className="button" href="/hr/worktime-compliance">
            工時法遵
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">月結護欄</span>
          <h2>排班要能被追溯</h2>
          <p>請假衝突、補卡、加班與薪資月結都依班表判斷，排班重發必須留下可查證據。</p>
          <Link className="button" href="/settings/audit">
            查看稽核
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-7" id="shift-template-wizard">
          <div className="section-heading">
            <div>
              <h2>班別設定精靈</h2>
              <p className="muted">班別是排班、請假衝突、出勤異常與工時法遵的共同基準。</p>
            </div>
            <span className="badge">會寫入稽核</span>
          </div>

          <form action="/api/scheduling/shift-templates" method="post" className="wizard-form" aria-label="班別設定精靈">
            <div className="section-heading compact-heading">
              <div>
                <h3>1. 班別基本資料</h3>
              </div>
              <span className="badge">必要</span>
            </div>
            <div className="field-grid">
              <label>
                班別代碼
                <input name="code" defaultValue="regular" required />
              </label>
              <label>
                班別名稱
                <input name="name" defaultValue="日班 09:00-18:00" required />
              </label>
              <label>
                狀態
                <select name="status" defaultValue="active">
                  <option value="active">啟用</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
              <label>
                休息分鐘
                <input name="breakMinutes" type="number" min="0" step="1" defaultValue="60" />
              </label>
              <label>
                上班時間
                <input name="startTime" type="time" defaultValue="09:00" required />
              </label>
              <label>
                下班時間
                <input name="endTime" type="time" defaultValue="18:00" required />
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>2. 適用星期</h3>
              </div>
              <span className="badge">排班規則</span>
            </div>
            <div className="toggle-row shift-template-weekdays">
              {weekdays.map(([value, label]) => (
                <label key={value}>
                  <input name="eligibleWeekdays" type="checkbox" value={value} defaultChecked={value !== "0" && value !== "6"} />
                  {label}
                </label>
              ))}
            </div>

            <label>
              排班備註
              <textarea name="notes" defaultValue="產生日排班前，請確認公司行事曆、出勤政策與工時法遵風險。" />
            </label>

            <button className="button primary" type="submit">
              儲存班別
            </button>
          </form>
        </section>

        <section className="panel span-5" id="schedule-generation">
          <div className="section-heading">
            <div>
              <h2>產生日排班</h2>
              <p className="muted">用啟用班別替在職員工產生指定日期的班表。</p>
            </div>
            <span className="badge warning">可覆蓋</span>
          </div>
          {activeTemplates.length === 0 ? (
            <EmptyState title="尚無啟用班別" body="請先建立一個啟用班別，再產生日排班。" />
          ) : (
            <form action="/api/scheduling/generate" method="post" className="mini-form shift-template-generate-form" aria-label="產生日排班">
              <label>
                班別
                <select name="shiftTemplateId">
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.code} · {displayTemplateName(template)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                排班日期
                <input name="workDate" type="date" defaultValue={today()} required />
              </label>
              <label className="check-row">
                <input name="overwriteExisting" type="checkbox" defaultChecked />
                覆蓋該日既有排班
              </label>
              <button className="button primary" type="submit">
                產生日排班
              </button>
            </form>
          )}
          <div className="shift-template-safety-card">
            <strong>產生前先確認</strong>
            <p>國定假日、例假、休息日與跨日班可能影響加班與薪資，排班後請回到工時法遵與出勤異常頁確認。</p>
          </div>
        </section>

        <section className="panel span-12" id="shift-template-list">
          <div className="section-heading">
            <div>
              <h2>班別清單</h2>
              <p className="muted">保留啟用與停用班別，讓歷史排班仍可追溯。</p>
            </div>
            <span className={`badge ${templates.length ? "done" : "warning"}`}>
              {templates.length ? `${templates.length} 個班別` : "尚未設定"}
            </span>
          </div>
          {templates.length === 0 ? (
            <EmptyState title="尚無班別" body="請先建立第一個班別，才可以開始替員工排班。" />
          ) : (
            <ul className="task-list shift-template-list">
              {templates.map((template) => (
                <li className={`task shift-template-task ${templateTone(template)}`} key={template.id}>
                  <span className="shift-template-copy">
                    <strong>
                      {displayTemplateName(template)} · {template.code}
                    </strong>
                    <small>
                      {template.startTime}-{template.endTime} · {formatHours(template.scheduledMinutes)} ·{" "}
                      {formatWeekdays(template.eligibleWeekdays)}
                    </small>
                    <small>
                      {template.crossesMidnight ? "跨日班，需複核休息時間與加班歸屬。" : "一般日班，仍需搭配公司行事曆確認。"}
                    </small>
                    {template.notes ? <small>{displayTemplateNotes(template.notes)}</small> : null}
                  </span>
                  <span className={`badge ${template.status === "inactive" || template.crossesMidnight ? "warning" : "done"}`}>
                    {statusLabel(template.status)} · {template.scheduleCount} 筆
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>排班處理原則</h2>
              <p className="muted">排班設定要支援月底前自動解決出勤異常，也要避免誤傷薪資與法遵證據。</p>
            </div>
            <Link className="button" href="/hr/attendance-exceptions">
              出勤異常
            </Link>
          </div>
          <div className="shift-template-guardrail-grid">
            <article>
              <span className="badge">同一來源</span>
              <strong>班表要服務所有流程</strong>
              <p>員工首頁、請假衝突、加班警示、補卡與月結都使用同一份排班資料。</p>
            </article>
            <article>
              <span className="badge warning">跨日複核</span>
              <strong>夜班不可只看日期</strong>
              <p>跨日班會影響日工時、休息時間與薪資歸屬，排班後要回工時法遵掃描。</p>
            </article>
            <article>
              <span className="badge danger">不放敏感資料</span>
              <strong>備註只放排班證據</strong>
              <p>排班備註請放班別原因或證據編號，不輸入薪資、身分證、健康或私人 HR 備註。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildShiftFocus(input: {
  activeTemplateCount: number;
  crossMidnightCount: number;
  generatedScheduleCount: number;
}): ShiftFocus {
  if (input.activeTemplateCount === 0) {
    return {
      title: "先建立啟用班別",
      detail: "目前沒有可用班別，員工首頁、請假衝突與日排班都缺少共同基準。",
      note: "先建立日班或常用班別，再產生日排班。",
      tone: "warning",
      href: "#shift-template-wizard",
      actionLabel: "建立班別",
    };
  }
  if (input.crossMidnightCount > 0) {
    return {
      title: "先複核跨日班",
      detail: `${input.crossMidnightCount} 個跨日班會影響休息時間、加班歸屬與月結風險。`,
      note: "產生排班後請接著跑工時法遵掃描。",
      tone: "warning",
      href: "/hr/worktime-compliance",
      actionLabel: "工時法遵",
    };
  }
  if (input.generatedScheduleCount === 0) {
    return {
      title: "產生第一天排班",
      detail: "班別已可用，但尚未產生日排班，員工首頁與請假衝突檢查還缺少班表。",
      note: "先產生試用日排班，再檢查出勤與請假流程。",
      tone: "warning",
      href: "#schedule-generation",
      actionLabel: "產生日排班",
    };
  }
  return {
    title: "排班設定可月結",
    detail: "啟用班別與排班紀錄已可用，可以接續檢查出勤異常與工時法遵。",
    note: "月底前仍需確認國定假日、例休與加班資料。",
    tone: "ready",
    href: "/hr/attendance-exceptions",
    actionLabel: "出勤異常",
  };
}

function templateTone(template: ShiftTemplateView) {
  if (template.crossesMidnight) return "warning";
  if (template.status === "inactive") return "muted";
  return "ready";
}

function displayTemplateName(template: ShiftTemplateView) {
  if (template.code === "regular" && template.name === "Regular 09:00-18:00") {
    return "日班 09:00-18:00";
  }
  return template.name;
}

function displayTemplateNotes(notes: string) {
  return notes
    .replace("Default office shift.", "標準辦公日班。")
    .replace("Review against company calendar and attendance policy before generation.", "產生排班前，請確認公司行事曆與出勤政策。");
}

function localizeShiftError(error: string) {
  if (error.includes("permission") || error.includes("Forbidden")) {
    return "目前角色沒有更新排班設定的權限，請切換 HR、Owner 或行政管理角色。";
  }
  if (error.includes("Work date is required")) return "請選擇排班日期。";
  if (error.includes("Shift template is required")) return "請選擇啟用班別。";
  if (error.includes("Unable to generate schedules")) return "目前無法產生日排班，請稍後再試或檢查資料庫連線。";
  if (error.includes("Unable to save shift template")) return "目前無法儲存班別，請稍後再試或檢查資料庫連線。";
  return error;
}

function statusLabel(status: ShiftTemplateView["status"]) {
  return status === "active" ? "啟用" : "停用";
}

function today() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatHours(minutes: number) {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(hours) ? `${hours} 小時` : `${hours.toFixed(1)} 小時`;
}

function formatWeekdays(values: number[]) {
  const labels = new Map(weekdays.map(([value, label]) => [Number(value), label]));
  return values.map((value) => labels.get(value) ?? `週${value}`).join("、");
}
