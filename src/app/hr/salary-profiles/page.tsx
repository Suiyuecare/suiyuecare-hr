import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  evaluateSalaryProfileMinimumWageCompliance,
  type MinimumWageComplianceReport,
} from "@/server/payroll/minimum-wage";
import {
  getSalaryProfileWorkspace,
  type SalaryProfileRow,
  type SalaryProfileWorkspace,
} from "@/server/payroll/salary-profiles";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function SalaryProfilesPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const [workspace, laborConfig] = await Promise.all([
    getSalaryProfileWorkspace(session),
    getTaiwanLaborStandardsConfig(session),
  ]);
  const currentProfiles = workspace.profiles.filter((profile) => !profile.effectiveTo);
  const minimumWage = evaluateSalaryProfileMinimumWageCompliance(currentProfiles, laborConfig);
  const coverage = buildSalaryCoverage(workspace, currentProfiles);
  const focus = buildSalaryProfileFocus(coverage, minimumWage);

  return (
    <main className="page salary-profile-page">
      <section className="hr-monthly-hero salary-profile-hero" aria-label="薪資資料安全工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">薪資資料</span>
            <span className={`badge ${minimumWage.ready && coverage.missingCount === 0 ? "done" : "warning"}`}>
              {minimumWage.ready && coverage.missingCount === 0 ? "可進入薪資試算" : "需要 HR 檢查"}
            </span>
          </div>
          <h1>薪資資料安全工作台</h1>
          <p>
            管理員工薪資設定檔、生效日、固定津貼與固定扣款。這是薪資敏感區，只開放薪資權限角色；所有新增資料會寫入稽核紀錄，並先檢查台灣最低工資規則。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr">
              回 HR 月結
            </Link>
            <Link className="button" href="/hr/payroll-profile-import">
              批次匯入
            </Link>
            <Link className="button" href="/settings/law-rules">
              法規規則
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          <a className="button primary" href={focus.href}>
            {focus.actionLabel}
          </a>
        </aside>
      </section>

      {params.error ? (
        <section className="salary-profile-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>薪資資料未儲存</strong>
            <p>{localizeSalaryProfileError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board salary-profile-signal-board" aria-label="薪資資料訊號板">
        <article className={`hr-monthly-signal-card ${coverage.missingCount === 0 ? "done" : "warning"}`}>
          <span>薪資覆蓋率</span>
          <strong>{coverage.currentCount}/{coverage.employeeCount}</strong>
          <small>{coverage.missingCount ? `${coverage.missingCount} 位員工缺目前生效薪資設定檔。` : "所有在職員工都有目前生效薪資設定檔。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${minimumWage.ready ? "done" : "danger"}`}>
          <span>最低工資</span>
          <strong>{minimumWage.ready ? "通過" : `${minimumWage.violations.length} 項`}</strong>
          <small>{localizeMinimumWageDetail(minimumWage.detail)}</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>生效日</span>
          <strong>版本化</strong>
          <small>新設定檔會關閉前一筆目前生效資料，不會靜默改既有薪資。</small>
        </article>
        <article className="hr-monthly-signal-card warning">
          <span>敏感資料</span>
          <strong>限 HR</strong>
          <small>薪資值只在薪資權限頁面顯示；稽核摘要不保存原始金額。</small>
        </article>
      </section>

      <section className="settings-command-grid salary-profile-command-grid" aria-label="薪資資料作業卡">
        <article className={`settings-command-card ${coverage.missingCount ? "warning" : "ready"}`}>
          <span className={`badge ${coverage.missingCount ? "warning" : "done"}`}>{coverage.missingCount ? "待補" : "完成"}</span>
          <h2>補齊薪資設定檔</h2>
          <p>月結薪資試算前，每位在職員工都需要一筆目前生效的薪資設定檔。</p>
          <a className="button" href="#salary-profile-form">
            新增設定檔
          </a>
        </article>
        <article className={`settings-command-card ${minimumWage.ready ? "ready" : "danger"}`}>
          <span className={`badge ${minimumWage.ready ? "done" : "danger"}`}>{minimumWage.ready ? "通過" : "阻擋"}</span>
          <h2>台灣最低工資</h2>
          <p>
            月薪最低 {formatMoney(laborConfig.minimumMonthlyWage)}，時薪最低 {formatMoney(laborConfig.minimumHourlyWage)}；規則由法規版本控制。
          </p>
          <Link className="button" href="/settings/law-rules">
            檢視法規規則
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">已啟用</span>
          <h2>薪資生效版本</h2>
          <p>每次新增薪資設定檔都帶生效日，避免修改已鎖定薪資或破壞歷史月結證據。</p>
          <a className="button" href="#salary-profile-history">
            查看歷史
          </a>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">敏感區</span>
          <h2>權限與稽核</h2>
          <p>只允許 HR/薪資角色進入。新增薪資設定檔會寫遮罩稽核，不輸出薪資明細到系統紀錄。</p>
          <Link className="button" href="/settings/audit">
            查看稽核
          </Link>
        </article>
      </section>

      <section className="grid">
        {!minimumWage.ready ? (
          <section className="panel span-12 danger-panel">
            <div className="section-heading">
              <div>
                <h2>最低工資阻擋</h2>
                <p className="muted">請先調整低於目前台灣最低工資規則的薪資設定檔，再進入月結試算。</p>
              </div>
              <Link className="button" href="/settings/law-rules">
                法規規則
              </Link>
            </div>
            <ul className="task-list compact">
              {minimumWage.violations.slice(0, 5).map((violation) => (
                <li className="task salary-profile-violation-task" key={`${violation.employeeId}-${violation.type}`}>
                  <span>
                    <strong>
                      {violation.employeeName ?? "員工"} {violation.employeeNo ? `· ${violation.employeeNo}` : ""}
                    </strong>
                    <small>{localizeMinimumWageViolation(violation.message)}</small>
                  </span>
                  <span className="badge danger">最低 {formatMoney(violation.requiredMinimum)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="panel span-12" id="salary-profile-form">
          <div className="section-heading">
            <div>
              <h2>薪資設定檔精靈</h2>
              <p className="muted">新增一筆帶生效日的薪資設定檔；既有已鎖定薪資不會被靜默修改。</p>
            </div>
            <Link className="button" href="/hr/payroll-profile-import">
              批次匯入
            </Link>
          </div>

          <form action="/api/payroll/salary-profiles" method="post" className="wizard-form salary-profile-form">
            <fieldset className="form-card salary-profile-fieldset">
              <legend>1. 選擇員工與生效日</legend>
              <p className="muted">生效日會決定薪資試算引用的版本；若新增未來日期，舊資料仍可保留歷史證據。</p>
              <div className="field-grid">
                <label>
                  員工
                  <select name="employeeId">
                    {workspace.employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employeeNo} · {employee.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  生效日
                  <input name="effectiveFrom" type="date" defaultValue={today()} required />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-card salary-profile-fieldset">
              <legend>2. 薪資與時薪</legend>
              <p className="muted">系統會依目前台灣法規版本檢查月薪與時薪最低工資。金額是敏感資料，只在薪資權限頁顯示。</p>
              <div className="field-grid">
                <label>
                  本薪
                  <input name="baseSalary" type="number" min="0" step="1" defaultValue="60000" required />
                </label>
                <label>
                  時薪（選填）
                  <input name="hourlyWage" type="number" min="0" step="1" placeholder="可留空" />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-card salary-profile-fieldset">
              <legend>3. 固定津貼與固定扣款</legend>
              <p className="muted">先支援各一筆固定津貼/扣款；下一階段會改成可新增多筆的薪資項目表。</p>
              <div className="field-grid">
                <label>
                  津貼代碼
                  <input name="allowanceCode" defaultValue="meal" />
                </label>
                <label>
                  津貼名稱
                  <input name="allowanceName" defaultValue="伙食津貼" />
                </label>
                <label>
                  津貼金額
                  <input name="allowanceAmount" type="number" min="0" step="1" defaultValue="2000" />
                </label>
                <label>
                  扣款代碼
                  <input name="deductionCode" defaultValue="welfare" />
                </label>
                <label>
                  扣款名稱
                  <input name="deductionName" defaultValue="福利金扣款" />
                </label>
                <label>
                  扣款金額
                  <input name="deductionAmount" type="number" min="0" step="1" defaultValue="1000" />
                </label>
              </div>
            </fieldset>

            <div className="salary-profile-note">
              <strong>安全提醒</strong>
              <p>不要把身分證字號、銀行帳號、健康資料或私人備註放進薪資項目名稱。薪資異動需有人資人工確認，AI 不得自動決定薪資。</p>
            </div>

            <button className="button primary" type="submit">
              儲存薪資設定檔
            </button>
          </form>
        </section>

        <section className="panel span-12" id="salary-profile-history">
          <div className="section-heading">
            <div>
              <h2>目前與歷史薪資設定檔</h2>
              <p className="muted">此清單包含敏感薪資值，僅薪資權限可見；請勿截圖分享給未授權角色。</p>
            </div>
            <span className="badge warning">敏感資料</span>
          </div>
          {workspace.profiles.length === 0 ? (
            <EmptyState title="尚未有薪資設定檔" body="請先建立薪資設定檔，才能進入薪資試算與月結。" />
          ) : (
            <ul className="task-list salary-profile-list">
              {workspace.profiles.map((profile) => (
                <li className="task salary-profile-task" key={profile.id}>
                  <span>
                    <strong>
                      {profile.employeeName} · {profile.employeeNo}
                    </strong>
                    <small>
                      生效 {formatDate(profile.effectiveFrom)}
                      {profile.effectiveTo ? ` - ${formatDate(profile.effectiveTo)}` : " - 目前生效"}
                    </small>
                    <small>{summarizeRecurringItems(profile)}</small>
                  </span>
                  <span className="salary-profile-amounts">
                    <span className="badge warning">{formatMoney(profile.baseSalary)}</span>
                    {profile.hourlyWage ? <span className="badge">{formatMoney(profile.hourlyWage)}/時</span> : null}
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

function buildSalaryCoverage(workspace: SalaryProfileWorkspace, currentProfiles: SalaryProfileRow[]) {
  const currentEmployeeIds = new Set(currentProfiles.map((profile) => profile.employeeId));
  return {
    employeeCount: workspace.employees.length,
    currentCount: currentProfiles.length,
    missingCount: workspace.employees.filter((employee) => !currentEmployeeIds.has(employee.id)).length,
  };
}

function buildSalaryProfileFocus(
  coverage: ReturnType<typeof buildSalaryCoverage>,
  minimumWage: MinimumWageComplianceReport,
) {
  if (coverage.missingCount > 0) {
    return {
      tone: "warning",
      title: "先補缺漏薪資設定檔",
      detail: `${coverage.missingCount} 位在職員工缺目前生效薪資設定檔，薪資試算前需要補齊。`,
      note: "缺漏薪資不會自動補值，避免靜默產生錯薪。",
      href: "#salary-profile-form",
      actionLabel: "新增設定檔",
    };
  }
  if (!minimumWage.ready) {
    return {
      tone: "danger",
      title: "先處理最低工資阻擋",
      detail: `${minimumWage.violations.length} 項薪資低於目前台灣法規設定，必須由 HR 調整後才能安全試算。`,
      note: "法規數字由版本化 law_rules 管理，不硬寫死在頁面。",
      href: "#salary-profile-form",
      actionLabel: "調整薪資",
    };
  }
  return {
    tone: "",
    title: "可進入薪資試算",
    detail: "所有在職員工都有目前生效薪資設定檔，且通過最低工資檢查。下一步可回 HR 月結進行薪資試算。",
    note: "薪資計算仍需 HR 確認與鎖定，不會自動發薪。",
    href: "/hr",
    actionLabel: "回 HR 月結",
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function localizeMinimumWageDetail(detail: string) {
  return detail
    .replace("salary profile(s) checked", "筆薪資設定檔已檢查")
    .replace("no configured Taiwan minimum wage violations", "沒有低於目前台灣最低工資規則")
    .replace("monthly and", "項月薪與")
    .replace("hourly minimum wage violation(s)", "項時薪最低工資阻擋")
    .replace(/^(\d+) 筆/, "$1 筆")
    .replace("; ", "；")
    .replace(/\.$/, "。");
}

function localizeMinimumWageViolation(message: string) {
  return message
    .replace("Monthly base salary is below the configured Taiwan minimum wage.", "本薪低於目前設定的台灣月薪最低工資。")
    .replace("Hourly wage is below the configured Taiwan minimum wage.", "時薪低於目前設定的台灣時薪最低工資。");
}

function localizeSalaryProfileError(error: string) {
  return error
    .replace("Unable to save salary profile.", "無法儲存薪資設定檔。")
    .replace("Employee is required.", "請選擇員工。")
    .replace("Effective date is required.", "請填寫生效日。")
    .replace("Employee not found for salary profile.", "找不到要套用薪資設定檔的員工。")
    .replace("Base salary must be zero or greater.", "本薪必須大於或等於 0。")
    .replace("Hourly wage must be zero or greater.", "時薪必須大於或等於 0。")
    .replace("Monthly base salary is below the configured Taiwan minimum wage.", "本薪低於目前設定的台灣月薪最低工資。")
    .replace("Hourly wage is below the configured Taiwan minimum wage.", "時薪低於目前設定的台灣時薪最低工資。");
}

function summarizeRecurringItems(profile: SalaryProfileRow) {
  const allowances = profile.recurringAllowances.length
    ? `固定津貼 ${profile.recurringAllowances.map((item) => `${localizeMoneyItemName(item.name)} ${formatMoney(item.amount)}`).join("、")}`
    : "無固定津貼";
  const deductions = profile.recurringDeductions.length
    ? `固定扣款 ${profile.recurringDeductions.map((item) => `${localizeMoneyItemName(item.name)} ${formatMoney(item.amount)}`).join("、")}`
    : "無固定扣款";
  return `${allowances} · ${deductions}`;
}

function localizeMoneyItemName(name: string) {
  return name
    .replace("Meal allowance", "伙食津貼")
    .replace("Welfare deduction", "福利金扣款")
    .replace("Recurring item", "固定項目");
}
