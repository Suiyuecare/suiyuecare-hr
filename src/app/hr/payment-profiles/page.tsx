import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getPaymentProfileWorkspace,
  type PaymentProfileWorkspace,
} from "@/server/payroll/payment-profiles";

type SearchParams = Promise<{ error?: string }>;

export default async function PaymentProfilesPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const workspace = await getPaymentProfileWorkspace(session);
  const coverage = workspace.activeCoverage;
  const focus = buildPaymentProfileFocus(workspace);
  const missingPreview = coverage.missingEmployees.slice(0, 8);

  return (
    <main className="page payment-profile-page">
      <section className="hr-monthly-hero payment-profile-hero" aria-label="發薪帳戶安全工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">付款資料</span>
            <span className={`badge ${coverage.missingEmployees.length ? "warning" : "done"}`}>
              {coverage.missingEmployees.length ? "銀行檔前需補齊" : "可進入付款安全檢查"}
            </span>
          </div>
          <h1>發薪帳戶安全工作台</h1>
          <p>
            管理員工發薪銀行、分行、戶名與帳號末四碼。真實帳號只用於建立雜湊與末四碼，不在頁面、稽核紀錄或系統訊息中輸出原文；銀行檔匯出前必須先補齊所有在職員工付款資料。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr/payroll-exports">
              回發薪封存
            </Link>
            <Link className="button" href="/hr/payroll-payment-security">
              付款安全設定
            </Link>
            <Link className="button" href="/hr/payroll-profile-import">
              批次匯入
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

      {error ? (
        <section className="payment-profile-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>付款資料未儲存</strong>
            <p>{localizePaymentProfileError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board payment-profile-signal-board" aria-label="發薪帳戶訊號板">
        <article className={`hr-monthly-signal-card ${coverage.missingEmployees.length ? "warning" : "done"}`}>
          <span>帳戶覆蓋率</span>
          <strong>
            {coverage.configuredEmployees}/{coverage.totalEmployees}
          </strong>
          <small>
            {coverage.missingEmployees.length
              ? `${coverage.missingEmployees.length} 位在職員工缺發薪帳戶。`
              : "所有在職員工都有目前有效的發薪帳戶。"}
          </small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>帳號安全</span>
          <strong>雜湊 + 末四碼</strong>
          <small>原始銀行帳號不顯示、不寫入稽核紀錄；清單只顯示末四碼。</small>
        </article>
        <article className={`hr-monthly-signal-card ${coverage.missingEmployees.length ? "danger" : "done"}`}>
          <span>銀行檔閘門</span>
          <strong>{coverage.missingEmployees.length ? "阻擋" : "通過"}</strong>
          <small>{coverage.missingEmployees.length ? "缺付款資料時不可產生正式銀行轉帳檔。" : "可銜接付款安全設定與封存流程。"}</small>
        </article>
        <article className="hr-monthly-signal-card warning">
          <span>敏感資料</span>
          <strong>限 HR</strong>
          <small>付款資料只開放薪資權限角色；新增與版本異動都會寫入遮罩稽核。</small>
        </article>
      </section>

      <section className="settings-command-grid payment-profile-command-grid" aria-label="付款資料作業卡">
        <article className={`settings-command-card ${coverage.missingEmployees.length ? "warning" : "ready"}`}>
          <span className={`badge ${coverage.missingEmployees.length ? "warning" : "done"}`}>{coverage.missingEmployees.length ? "待補" : "完成"}</span>
          <h2>補齊發薪帳戶</h2>
          <p>正式發薪匯出前，每位在職員工都需要一筆目前有效的銀行轉帳付款資料。</p>
          <a className="button" href="#payment-profile-form">
            新增付款資料
          </a>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">已遮罩</span>
          <h2>帳號不落地</h2>
          <p>輸入帳號後只留下 hash 與末四碼；HR 清單與稽核紀錄都不顯示完整銀行帳號。</p>
          <a className="button" href="#payment-profile-history">
            查看清單
          </a>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">版本化</span>
          <h2>生效日管理</h2>
          <p>新的付款資料會帶生效日，未來可追蹤帳戶變更歷史與銀行檔封存證據。</p>
          <a className="button" href="#payment-profile-history">
            查看歷史
          </a>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">需串接</span>
          <h2>付款安全閘門</h2>
          <p>補齊員工付款資料後，仍需完成金庫、KMS、銀行格式與驗證證據才能產生銀行檔。</p>
          <Link className="button" href="/hr/payroll-payment-security">
            開啟付款安全
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-12" id="payment-profile-form">
          <div className="section-heading">
            <div>
              <h2>發薪帳戶設定精靈</h2>
              <p className="muted">三步新增一筆付款資料；原始銀行帳號只在提交時用於產生 hash 與末四碼。</p>
            </div>
            <Link className="button" href="/hr/payroll-profile-import">
              批次匯入
            </Link>
          </div>

          <form action="/api/payroll/payment-profiles" method="post" className="wizard-form payment-profile-form">
            <fieldset className="form-card payment-profile-fieldset">
              <legend>1. 選擇員工與生效日</legend>
              <p className="muted">生效日會決定銀行檔匯出引用的付款版本；請勿覆蓋已用於封存的歷史資料。</p>
              <div className="field-grid">
                <label>
                  員工
                  <select name="employeeId" required>
                    {workspace.employees.map((employee) => (
                      <option value={employee.id} key={employee.id}>
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

            <fieldset className="form-card payment-profile-fieldset">
              <legend>2. 銀行與分行</legend>
              <p className="muted">台灣銀行代碼通常為 3 碼；分行代碼依銀行檔格式要求填寫。</p>
              <div className="field-grid">
                <label>
                  銀行代碼
                  <input name="bankCode" inputMode="numeric" pattern="[0-9]{3,7}" placeholder="004" required />
                </label>
                <label>
                  分行代碼（選填）
                  <input name="bankBranchCode" inputMode="numeric" pattern="[0-9]{3,7}" placeholder="0123" />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-card payment-profile-fieldset">
              <legend>3. 戶名與帳號</legend>
              <p className="muted">戶名只限薪資權限頁面檢視；帳號原文不會出現在清單、稽核紀錄或系統訊息。</p>
              <div className="field-grid">
                <label>
                  戶名
                  <input name="accountName" placeholder="員工本人銀行戶名" required />
                </label>
                <label>
                  銀行帳號
                  <input name="accountNumber" inputMode="numeric" pattern="[0-9]{6,20}" placeholder="僅輸入數字" required />
                </label>
              </div>
            </fieldset>

            <div className="payment-profile-note">
              <strong>安全提醒</strong>
              <p>不要把身分證字號、完整銀行帳號、薪資金額、健康資料或私人備註放進備註或戶名欄位。付款資料異動需由 HR 人工確認，AI 不得自動更改發薪目的地。</p>
            </div>

            <button className="button primary" type="submit">
              儲存付款資料
            </button>
          </form>
        </section>

        <section className="panel span-5" id="payment-profile-coverage">
          <div className="section-heading">
            <div>
              <h2>付款資料缺口</h2>
              <p className="muted">銀行檔匯出前，先補齊缺少發薪帳戶的在職員工。</p>
            </div>
            <span className={`badge ${coverage.missingEmployees.length ? "warning" : "done"}`}>
              {coverage.missingEmployees.length ? `${coverage.missingEmployees.length} 位待補` : "已補齊"}
            </span>
          </div>
          {coverage.missingEmployees.length === 0 ? (
            <EmptyState title="付款資料已補齊" body="所有在職員工都有目前有效的付款資料，可接續付款安全設定。" />
          ) : (
            <>
              <ul className="task-list compact">
                {missingPreview.map((employee) => (
                  <li className="task payment-profile-missing-task" key={employee.id}>
                    <span>
                      <strong>{employee.displayName}</strong>
                      <small>{employee.employeeNo} · 缺發薪帳戶</small>
                    </span>
                    <span className="badge warning">待補</span>
                  </li>
                ))}
              </ul>
              {coverage.missingEmployees.length > missingPreview.length ? (
                <p className="payment-profile-more">另有 {coverage.missingEmployees.length - missingPreview.length} 位員工待補，建議使用批次匯入。</p>
              ) : null}
            </>
          )}
        </section>

        <section className="panel span-7" id="payment-profile-history">
          <div className="section-heading">
            <div>
              <h2>目前與歷史付款資料</h2>
              <p className="muted">清單只顯示銀行代碼、分行、戶名、末四碼與生效日；完整帳號不會回顯。</p>
            </div>
            <span className="badge warning">敏感資料</span>
          </div>
          {workspace.profiles.length === 0 ? (
            <EmptyState title="尚未有付款資料" body="請先建立付款資料，才能通過銀行檔匯出前檢查。" />
          ) : (
            <ul className="task-list payment-profile-list">
              {workspace.profiles.map((profile) => (
                <li className="task payment-profile-task" key={profile.id}>
                  <span>
                    <strong>
                      {profile.employeeName} · {profile.employeeNo}
                    </strong>
                    <small>
                      銀行 {profile.bankCode}
                      {profile.bankBranchCode ? `-${profile.bankBranchCode}` : ""} · 末四碼 {profile.accountNumberLast4}
                    </small>
                    <small>戶名 {profile.accountName}</small>
                    <small>
                      生效 {formatDate(profile.effectiveFrom)}
                      {profile.effectiveTo ? ` - ${formatDate(profile.effectiveTo)}` : " - 目前生效"}
                    </small>
                  </span>
                  <span className={`badge ${profile.status === "inactive" ? "warning" : "done"}`}>
                    {profile.status === "inactive" ? "已停用" : "有效"}
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

function buildPaymentProfileFocus(workspace: PaymentProfileWorkspace) {
  const missingCount = workspace.activeCoverage.missingEmployees.length;
  if (missingCount > 0) {
    return {
      tone: "warning",
      title: "先補缺漏發薪帳戶",
      detail: `${missingCount} 位在職員工缺目前有效的付款資料，銀行檔匯出前必須補齊。`,
      note: "缺付款資料不會自動帶入，避免薪資轉錯帳戶。",
      href: "#payment-profile-form",
      actionLabel: "新增付款資料",
    };
  }
  return {
    tone: "",
    title: "可進入付款安全設定",
    detail: "所有在職員工都有目前有效的付款資料。下一步確認金庫、KMS、銀行格式與驗證證據。",
    note: "付款資料補齊不代表可直接發薪，仍需通過銀行檔安全閘門。",
    href: "/hr/payroll-payment-security",
    actionLabel: "付款安全設定",
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function localizePaymentProfileError(error: string) {
  return error
    .replace("Unable to save payment profile.", "無法儲存付款資料。")
    .replace("Employee is required.", "請選擇員工。")
    .replace("Employee not found for payment profile.", "找不到要套用付款資料的員工。")
    .replace("Bank code must be 3 to 7 digits.", "銀行代碼必須為 3 到 7 位數字。")
    .replace("Branch code must be 3 to 7 digits.", "分行代碼必須為 3 到 7 位數字。")
    .replace("Account name is required.", "請填寫戶名。")
    .replace("Account number must be 6 to 20 digits.", "銀行帳號必須為 6 到 20 位數字。")
    .replace("Invalid effective date.", "生效日格式不正確。");
}
