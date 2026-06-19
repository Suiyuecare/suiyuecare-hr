import Link from "next/link";
import { getDemoSession } from "@/server/auth/session";
import {
  listAttendanceExceptions,
  summarizeAttendanceExceptionResolution,
} from "@/server/attendance/exceptions";
import type { HrExceptionView } from "@/server/workflows/types";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function AttendanceExceptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const exceptions = await listAttendanceExceptions(session);
  const summary = summarizeAttendanceExceptionResolution(exceptions);
  const focus = buildAttendanceExceptionFocus(summary);
  const pending = exceptions.filter((exception) => exception.status === "pending");
  const resolved = exceptions.filter((exception) => exception.status !== "pending");

  return (
    <main className="page attendance-exception-page">
      <section className="hr-monthly-hero attendance-exception-hero" aria-label="出勤異常處理工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">出勤管理</span>
            <span className={`badge ${summary.kpiReady ? "done" : summary.highRiskCount ? "danger" : "warning"}`}>
              {summary.kpiReady ? "月結可進行" : "月結前需處理"}
            </span>
          </div>
          <h1>出勤異常處理工作台</h1>
          <p>
            月底前先處理漏打卡、重複打卡與工時風險。安全建議仍由人資確認後才套用，高風險工時項目不自動關閉，確保薪資月結與台灣勞基法檢查都有證據。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#attendance-exception-queue">
              處理異常
            </Link>
            <Link className="button" href="/hr/worktime-compliance">
              工時分析
            </Link>
            <Link className="button" href="/hr">
              回 HR 月結
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          {summary.autoResolvableCount > 0 ? (
            <form action="/api/attendance/exceptions" method="post" className="attendance-exception-focus-form">
              <input type="hidden" name="intent" value="resolve_safe" />
              <button className="button primary" type="submit">
                套用安全建議
              </button>
            </form>
          ) : (
            <Link className="button primary" href={focus.href}>
              {focus.actionLabel}
            </Link>
          )}
        </aside>
      </section>

      {params.error ? (
        <section className="attendance-exception-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>出勤異常未更新</strong>
            <p>{localizeAttendanceError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board attendance-exception-signal-board" aria-label="出勤異常訊號板">
        <article className={`hr-monthly-signal-card ${summary.kpiReady ? "done" : "warning"}`}>
          <span>異常解決率</span>
          <strong>{summary.resolutionRate}%</strong>
          <small>目標高於 90%；月底前越早清空，薪資月結越不容易卡住。</small>
        </article>
        <article className={`hr-monthly-signal-card ${summary.pendingCount ? "danger" : "done"}`}>
          <span>待處理</span>
          <strong>{summary.pendingCount} 筆</strong>
          <small>{summary.pendingCount ? "漏打卡與工時風險需在鎖薪前確認。" : "目前沒有待處理出勤異常。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${summary.autoResolvableCount ? "warning" : "done"}`}>
          <span>安全建議</span>
          <strong>{summary.autoResolvableCount} 筆</strong>
          <small>仍需人資按下確認；系統不會默默替 HR 關閉異常。</small>
        </article>
        <article className={`hr-monthly-signal-card ${summary.highRiskCount ? "danger" : "done"}`}>
          <span>高風險工時</span>
          <strong>{summary.highRiskCount} 筆</strong>
          <small>涉及勞基法工時或休息日風險時，一律人工審查。</small>
        </article>
      </section>

      <section className="settings-command-grid attendance-exception-command-grid" aria-label="出勤異常作業卡">
        <article className={`settings-command-card ${summary.pendingCount ? "danger" : "ready"}`}>
          <span className={`badge ${summary.pendingCount ? "danger" : "done"}`}>
            {summary.pendingCount ? `${summary.pendingCount} 筆待處理` : "已清空"}
          </span>
          <h2>先清月結阻擋</h2>
          <p>漏打卡、重複打卡與工時風險會阻擋薪資鎖定，先從待處理清單逐筆確認。</p>
          <a className="button primary" href="#attendance-exception-queue">
            開始處理
          </a>
        </article>
        <article className={`settings-command-card ${summary.autoResolvableCount ? "warning" : "ready"}`}>
          <span className={`badge ${summary.autoResolvableCount ? "warning" : "done"}`}>
            {summary.autoResolvableCount ? "需人資確認" : "無安全建議"}
          </span>
          <h2>安全建議不自動套用</h2>
          <p>只有漏上班、漏下班、重複打卡等低風險項目可批次套用，仍會寫入稽核紀錄。</p>
          <form action="/api/attendance/exceptions" method="post">
            <input type="hidden" name="intent" value="resolve_safe" />
            <button className="button" type="submit" disabled={summary.autoResolvableCount === 0}>
              套用安全建議
            </button>
          </form>
        </article>
        <article className={`settings-command-card ${summary.highRiskCount ? "danger" : "ready"}`}>
          <span className={`badge ${summary.highRiskCount ? "danger" : "done"}`}>
            {summary.highRiskCount ? "需法遵檢查" : "工時安全"}
          </span>
          <h2>高風險交給人工</h2>
          <p>超時、休息間隔與法定工時風險不批次關閉，必須追溯班表、請假、加班與打卡來源。</p>
          <Link className="button" href="/hr/worktime-compliance">
            開啟工時分析
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">稽核留痕</span>
          <h2>處理證據要乾淨</h2>
          <p>備註只放處理原因或證據編號，不輸入身分證、健康資料、薪資或私人備註。</p>
          <Link className="button" href="/settings/audit">
            查看稽核
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-12" id="attendance-exception-queue">
          <div className="section-heading">
            <div>
              <h2>異常處理清單</h2>
              <p className="muted">{localizeSummaryDetail(summary.detail)}</p>
            </div>
            <span className={`badge ${pending.length ? "warning" : "done"}`}>
              {pending.length ? `${pending.length} 筆待處理` : "已清空"}
            </span>
          </div>
          {exceptions.length === 0 ? (
            <p className="muted">目前沒有出勤異常。月底前仍建議搭配工時分析掃描一次。</p>
          ) : (
            <ul className="task-list attendance-exception-list">
              {[...pending, ...resolved].map((exception) => (
                <li className={`task attendance-exception-task ${exceptionTone(exception)}`} key={exception.id}>
                  <span className="attendance-exception-copy">
                    <strong>
                      {exception.employeeName} · {localizeExceptionType(exception.exceptionType)}
                    </strong>
                    <small>
                      {localizeSeverity(exception.severity)} · {localizeStatus(exception.status)} ·{" "}
                      {exception.createdAt.toLocaleDateString("zh-TW")}
                    </small>
                    <small>{localizeSuggestedResolution(exception.suggestedResolution, exception.exceptionType)}</small>
                    {exception.resolvedAt ? (
                      <small>
                        已處理 {exception.resolvedAt.toLocaleDateString("zh-TW")} ·{" "}
                        {localizeResolutionCode(exception.resolutionCode)}
                      </small>
                    ) : null}
                  </span>
                  {exception.status === "pending" ? (
                    <form
                      action="/api/attendance/exceptions"
                      method="post"
                      className="inline-form attendance-exception-resolve-form"
                      aria-label={`處理 ${exception.employeeName} 出勤異常`}
                    >
                      <input type="hidden" name="intent" value="resolve" />
                      <input type="hidden" name="exceptionId" value={exception.id} />
                      <select
                        name="resolutionCode"
                        aria-label={`${exception.employeeName} 處理方式`}
                        defaultValue={
                          exception.autoResolvable
                            ? "employee_self_correction_requested"
                            : "hr_reviewed_for_payroll"
                        }
                      >
                        <option value="employee_self_correction_requested">請員工補卡</option>
                        <option value="hr_reviewed_for_payroll">人資已確認可月結</option>
                        <option value="worktime_legal_reviewed">工時法遵已檢查</option>
                      </select>
                      <input
                        name="evidenceRef"
                        aria-label={`${exception.employeeName} 證據編號`}
                        placeholder="證據編號"
                      />
                      <input
                        name="comment"
                        aria-label={`${exception.employeeName} 處理備註`}
                        placeholder="處理備註"
                      />
                      <button className="button" type="submit">
                        確認處理
                      </button>
                    </form>
                  ) : (
                    <span className="badge done">已處理</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>處理原則</h2>
              <p className="muted">這些護欄讓出勤異常處理速度變快，但仍符合台灣勞基法與稽核要求。</p>
            </div>
            <Link className="button" href="/settings/law-rules">
              法規規則
            </Link>
          </div>
          <div className="attendance-exception-guardrail-grid">
            <article>
              <span className="badge done">可批次</span>
              <strong>低風險補卡提醒</strong>
              <p>漏上班、漏下班、重複打卡可批次轉成員工補卡或 HR 已檢查，但仍要人資按下確認。</p>
            </article>
            <article>
              <span className="badge danger">不可自動</span>
              <strong>工時與休息日風險</strong>
              <p>涉及延長工時、休息時間或法定風險時，不得批次關閉，需追溯班表、假勤與加班資料。</p>
            </article>
            <article>
              <span className="badge warning">資料最小化</span>
              <strong>備註不放敏感資料</strong>
              <p>證據欄位只填編號或文件代碼，不放薪資、身分證、健康資料、銀行帳號或私人備註。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildAttendanceExceptionFocus(summary: ReturnType<typeof summarizeAttendanceExceptionResolution>) {
  if (summary.highRiskCount > 0) {
    return {
      title: "先看高風險工時",
      detail: `${summary.highRiskCount} 筆工時或法遵風險需要人工追溯，不可批次關閉。`,
      note: "請確認班表、加班、請假與打卡來源，再決定是否可月結。",
      href: "#attendance-exception-queue",
      actionLabel: "查看高風險",
      tone: "danger",
    };
  }

  if (summary.autoResolvableCount > 0) {
    return {
      title: "套用安全建議",
      detail: `${summary.autoResolvableCount} 筆低風險異常可由人資確認後批次處理。`,
      note: "系統不會自動關閉異常；按下確認後才會寫入稽核紀錄。",
      href: "#attendance-exception-queue",
      actionLabel: "套用安全建議",
      tone: "warning",
    };
  }

  if (summary.pendingCount > 0) {
    return {
      title: "逐筆確認異常",
      detail: `${summary.pendingCount} 筆待處理異常不屬於安全批次，請逐筆檢查。`,
      note: "處理前請確認來源，不要用備註欄保存敏感資料。",
      href: "#attendance-exception-queue",
      actionLabel: "逐筆處理",
      tone: "warning",
    };
  }

  return {
    title: "出勤異常已清空",
    detail: "目前沒有待處理異常，可回 HR 月結或執行工時分析複檢。",
    note: "月結前仍建議保留出勤、簽核與工時掃描證據。",
    href: "/hr",
    actionLabel: "回 HR 月結",
    tone: "ready",
  };
}

function exceptionTone(exception: HrExceptionView) {
  if (exception.status !== "pending") return "ready";
  if (exception.severity === "danger" || !exception.autoResolvable) return "danger";
  return "warning";
}

function localizeSummaryDetail(detail: string) {
  const match = detail.match(/(\d+)\/(\d+) exception\(s\) resolved; (\d+) safe suggestion\(s\); (\d+) high-risk item\(s\) need HR review\./);
  if (!match) return detail;
  const [, resolved, total, safeSuggestions, highRisk] = match;
  return `${resolved}/${total} 筆異常已處理；${safeSuggestions} 筆安全建議；${highRisk} 筆高風險需要人資檢查。`;
}

function localizeExceptionType(type: string) {
  const labels: Record<string, string> = {
    missing_clock_in: "缺上班打卡",
    missing_clock_out: "缺下班打卡",
    duplicate_punch: "重複打卡",
    worktime_daily_worktime: "每日工時風險",
    worktime_monthly_overtime: "月加班風險",
    worktime_rest_day: "休息日風險",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function localizeSeverity(severity: string) {
  if (severity === "danger") return "高風險";
  if (severity === "warning") return "需確認";
  return "一般";
}

function localizeStatus(status: string) {
  const labels: Record<string, string> = {
    pending: "待處理",
    approved: "已處理",
    rejected: "已駁回",
  };
  return labels[status] ?? status;
}

function localizeSuggestedResolution(suggestion: string | undefined, type: string) {
  if (!suggestion) return "請確認來源出勤、班表、請假與加班資料後再處理。";
  const labels: Record<string, string> = {
    "Request employee punch correction before payroll close.": "請員工在月結前送出補卡或由人資確認證據。",
    "Keep earliest valid punch and mark duplicate as reviewed.": "保留最早有效打卡，將重複打卡標記為已檢查。",
    "HR must review legal working-time risk before payroll lock.": "人資必須在薪資鎖定前檢查工時法遵風險。",
    "Review source attendance, leave, overtime, and shift records before payroll close.":
      "月結前請追溯出勤、請假、加班與班表來源。",
  };
  return labels[suggestion] ?? localizeExceptionType(type);
}

function localizeResolutionCode(code: string | null | undefined) {
  const labels: Record<string, string> = {
    employee_self_correction_requested: "已請員工補卡",
    hr_reviewed_for_payroll: "人資已確認可月結",
    worktime_legal_reviewed: "工時法遵已檢查",
  };
  return code ? labels[code] ?? code : "已處理";
}

function localizeAttendanceError(error: string) {
  return error
    .replace("Unable to update attendance exceptions.", "無法更新出勤異常。")
    .replace("Attendance exception not found.", "找不到這筆出勤異常。")
    .replace("Unknown attendance exception action.", "未知的出勤異常處理動作。")
    .replace("Role employee cannot employee:write", "目前角色沒有處理出勤異常的權限。")
    .replace("Role manager cannot employee:write", "主管預設不能處理 HR 出勤異常。");
}
