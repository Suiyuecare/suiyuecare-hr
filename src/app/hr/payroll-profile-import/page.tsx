import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getPayrollProfileImportWorkspace,
  type PayrollProfileImportPreview,
  type PayrollProfileImportRow,
  type PayrollProfileImportWorkspace,
} from "@/server/payroll/profile-imports";

type SearchParams = Promise<{ error?: string; imported?: string; preview?: string }>;

const csvHeader =
  "employeeNo,baseSalary,hourlyWage,allowanceCode,allowanceName,allowanceAmount,deductionCode,deductionName,deductionAmount,taxResidency,dependentCount,laborInsuranceMonthlyWage,healthInsuranceMonthlyWage,laborPensionMonthlyWage,nonResidentWithholdingRatePercent,bankCode,bankBranchCode,accountName,accountNumber,effectiveFrom";

export default async function PayrollProfileImportPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, imported, preview }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const workspace = await getPayrollProfileImportWorkspace(session);
  const focus = buildImportFocus(workspace, Boolean(imported), Boolean(preview));
  const stage = buildImportStage(workspace.preview, Boolean(imported));
  const employeesPreview = workspace.employees.slice(0, 8);

  return (
    <main className="page payroll-import-page">
      <section className="hr-monthly-hero payroll-import-hero" aria-label="薪資與付款批次匯入工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">批次匯入</span>
            <span className={`badge ${stage.badgeClass}`}>{stage.label}</span>
          </div>
          <h1>薪資與付款批次匯入工作台</h1>
          <p>
            一次預覽薪資設定、稅務/保險資料與發薪帳戶目的地。畫面不回顯 CSV 原文、不顯示完整銀行帳號或本薪金額；確認匯入後才會寫入薪資、付款、稅務設定檔與遮罩稽核紀錄。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr/onboarding-readiness">
              回導入整備
            </Link>
            <Link className="button" href="/hr/salary-profiles">
              薪資資料
            </Link>
            <Link className="button" href="/hr/payment-profiles">
              付款資料
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
        <section className="payroll-import-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>匯入尚未完成</strong>
            <p>{localizeImportError(error)}</p>
          </div>
        </section>
      ) : null}
      {imported ? (
        <section className="payroll-import-alerts" aria-live="polite">
          <div className="panel success-panel">
            <strong>批次匯入完成</strong>
            <p>薪資設定、付款目的地與稅務/保險資料已寫入，敏感值以遮罩或 hash 方式留下稽核證據。</p>
          </div>
        </section>
      ) : null}
      {preview && !imported ? (
        <section className="payroll-import-alerts" aria-live="polite">
          <div className="panel">
            <strong>預覽已產生</strong>
            <p className="muted">請先檢查錯誤列與欄位摘要；畫面不會回顯 CSV 原文、完整銀行帳號或本薪金額。</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board payroll-import-signal-board" aria-label="批次匯入訊號板">
        <article className="hr-monthly-signal-card done">
          <span>員工名冊</span>
          <strong>{workspace.employees.length}</strong>
          <small>只允許匯入已存在的在職員工編號，避免薪資資料掛到錯人。</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.preview ? (workspace.preview.invalidCount ? "danger" : "done") : "warning"}`}>
          <span>預覽狀態</span>
          <strong>{workspace.preview ? `${workspace.preview.validCount}/${workspace.preview.rows.length}` : "未預覽"}</strong>
          <small>{workspace.preview ? `${workspace.preview.invalidCount} 列需要修正。` : "貼上 CSV 後先預覽，不會直接寫入資料。"}</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>敏感資料</span>
          <strong>不回顯原文</strong>
          <small>預覽只顯示帳號末四碼與欄位狀態，不顯示完整帳號、本薪金額或 CSV 原文。</small>
        </article>
        <article className="hr-monthly-signal-card warning">
          <span>稽核</span>
          <strong>遮罩寫入</strong>
          <small>確認匯入會留下批次摘要、員工 ID、日期與 sensitiveValuesRedacted。</small>
        </article>
      </section>

      <section className="settings-command-grid payroll-import-command-grid" aria-label="批次匯入作業卡">
        <article className={`settings-command-card ${workspace.preview ? "ready" : "warning"}`}>
          <span className={`badge ${workspace.preview ? "done" : "warning"}`}>{workspace.preview ? "已預覽" : "待預覽"}</span>
          <h2>CSV 預覽</h2>
          <p>HR 先貼上薪資、稅務、保險與付款目的地資料；預覽階段只做驗證，不寫入正式資料。</p>
          <a className="button" href="#payroll-import-form">
            開始預覽
          </a>
        </article>
        <article className={`settings-command-card ${workspace.preview?.invalidCount ? "danger" : "ready"}`}>
          <span className={`badge ${workspace.preview?.invalidCount ? "danger" : "done"}`}>
            {workspace.preview?.invalidCount ? "需修正" : "無錯誤"}
          </span>
          <h2>錯誤列處理</h2>
          <p>員工編號、銀行代碼、帳號格式、生效日、非居住者扣繳率都會在確認前先阻擋。</p>
          <a className="button" href="#payroll-import-preview">
            查看預覽
          </a>
        </article>
        <article className={`settings-command-card ${workspace.preview && workspace.preview.invalidCount === 0 && workspace.preview.validCount > 0 ? "ready" : "warning"}`}>
          <span className={`badge ${workspace.preview && workspace.preview.invalidCount === 0 && workspace.preview.validCount > 0 ? "done" : "warning"}`}>
            {workspace.preview && workspace.preview.invalidCount === 0 && workspace.preview.validCount > 0 ? "可匯入" : "未就緒"}
          </span>
          <h2>確認匯入</h2>
          <p>只有所有列都有效時，才允許建立薪資設定檔、付款資料與稅務/保險合規資料。</p>
          <a className="button" href="#payroll-import-preview">
            確認前檢查
          </a>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">匯入後</span>
          <h2>月結前檢查</h2>
          <p>匯入完成後，回薪資資料、付款資料與月結首頁確認覆蓋率與安全閘門。</p>
          <Link className="button" href="/hr">
            回 HR 月結
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-12" id="payroll-import-form">
          <div className="section-heading">
            <div>
              <h2>三步匯入精靈</h2>
              <p className="muted">先確認欄位，再貼上 CSV 預覽；確認匯入前，資料不會寫入薪資、付款或稅務設定檔。</p>
            </div>
            <Link className="button" href="/settings/pilot-import-preflight">
              試用 CSV 預檢
            </Link>
          </div>

          <form action="/api/payroll/profile-import" method="post" className="wizard-form payroll-import-form">
            <input type="hidden" name="intent" value="preview" />
            <fieldset className="form-card payroll-import-fieldset">
              <legend>1. 必要欄位</legend>
              <p className="muted">請使用同一份 CSV 匯入薪資、稅務、保險與付款目的地。欄位順序可調整，但欄位名稱必須一致。</p>
              <code className="payroll-import-header">{csvHeader}</code>
            </fieldset>

            <fieldset className="form-card payroll-import-fieldset">
              <legend>2. 貼上 CSV</legend>
              <p className="muted">貼上後按預覽。預覽完成後，系統不會在畫面回顯原始 CSV；請把正式檔保存在客戶核准的安全位置。</p>
              <label>
                薪資與付款 CSV
                <textarea
                  name="rawCsv"
                  placeholder={`${csvHeader}\n請貼上客戶核准的正式資料列；畫面預覽不會回顯 CSV 原文。`}
                  rows={8}
                  required
                />
              </label>
            </fieldset>

            <fieldset className="form-card payroll-import-fieldset">
              <legend>3. 安全確認</legend>
              <div className="payroll-import-note">
                <strong>安全提醒</strong>
                <p>不要把 CSV 原文貼到客服票、聊天工具或一般文件。畫面只顯示欄位狀態與帳號末四碼；匯入稽核只保留摘要與遮罩證據。</p>
              </div>
            </fieldset>

            <button className="button primary" type="submit">
              預覽匯入資料
            </button>
          </form>
        </section>

        <section className="panel span-5" id="payroll-import-employees">
          <div className="section-heading">
            <div>
              <h2>可匹配員工編號</h2>
              <p className="muted">CSV 的 employeeNo 需要對應既有在職員工。</p>
            </div>
            <span className="badge">{workspace.employees.length} 位</span>
          </div>
          <ul className="task-list payroll-import-employee-list">
            {employeesPreview.map((employee) => (
              <li className="task payroll-import-employee-task" key={employee.id}>
                <span>
                  <strong>{employee.employeeNo}</strong>
                  <small>{employee.displayName}</small>
                </span>
                <span className="badge done">在職</span>
              </li>
            ))}
          </ul>
          {workspace.employees.length > employeesPreview.length ? (
            <p className="payroll-import-more">另有 {workspace.employees.length - employeesPreview.length} 位員工，可透過員工主檔確認完整名冊。</p>
          ) : null}
        </section>

        <section className="panel span-7" id="payroll-import-preview" aria-label="匯入預覽結果">
          <div className="section-heading">
            <div>
              <h2>預覽與確認</h2>
              <p className="muted">確認前只顯示列狀態、員工、稅籍、銀行代碼與末四碼；不顯示完整帳號或薪資金額。</p>
            </div>
            {workspace.preview ? (
              <span className={`badge ${workspace.preview.invalidCount ? "warning" : "done"}`}>
                {workspace.preview.validCount} 有效 · {workspace.preview.invalidCount} 待修正
              </span>
            ) : null}
          </div>

          {!workspace.preview ? (
            <EmptyState title="尚未產生預覽" body="請先貼上 CSV 並執行預覽，確認格式正確後再匯入。" />
          ) : (
            <>
              <div className="payroll-import-preview-meta">
                <span className="badge">預覽時間 {formatDateTime(workspace.preview.createdAt)}</span>
                <span className="badge done">CSV 原文未回顯</span>
              </div>
              <ul className="task-list payroll-import-preview-list">
                {workspace.preview.rows.map((row) => (
                  <li className="task payroll-import-preview-task" key={`${row.rowNumber}-${row.employeeNo}`}>
                    <span>
                      <strong>
                        第 {row.rowNumber} 列 · {row.employeeNo || "缺員工編號"} · {row.employeeName ?? "找不到員工"}
                      </strong>
                      <small>
                        {taxResidencyLabel(row.taxResidency)} · 銀行 {row.bankCode || "缺銀行代碼"} · 末四碼 {row.accountNumberLast4 ?? "格式錯誤"} · 生效{" "}
                        {row.effectiveFrom ? formatDate(row.effectiveFrom) : "格式錯誤"}
                      </small>
                      <small>{row.status === "valid" ? "薪資、稅籍、保險與付款欄位已通過格式檢查。" : "請修正下列欄位後重新預覽。"}</small>
                      {row.errors.map((message) => (
                        <small className="warning-text" key={message}>
                          {localizeRowError(message)}
                        </small>
                      ))}
                    </span>
                    <span className={`badge ${row.status === "invalid" ? "warning" : "done"}`}>
                      {row.status === "invalid" ? "待修正" : "有效"}
                    </span>
                  </li>
                ))}
              </ul>

              <form action="/api/payroll/profile-import" method="post" className="mini-form payroll-import-confirm-form">
                <input type="hidden" name="intent" value="import" />
                <input type="hidden" name="previewId" value={workspace.preview.id} />
                <button className="button primary" type="submit" disabled={workspace.preview.invalidCount > 0}>
                  確認匯入
                </button>
                {workspace.preview.invalidCount > 0 ? <span className="badge warning">仍有錯誤列，不能匯入</span> : null}
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function buildImportFocus(
  workspace: PayrollProfileImportWorkspace,
  imported: boolean,
  previewed: boolean,
) {
  if (imported) {
    return {
      tone: "",
      title: "回到月結前檢查",
      detail: "批次資料已寫入。下一步檢查薪資資料、付款資料與 HR 月結安全閘門是否都已通過。",
      note: "匯入摘要已寫入遮罩稽核紀錄。",
      href: "/hr",
      actionLabel: "回 HR 月結",
    };
  }
  if (!workspace.preview && !previewed) {
    return {
      tone: "warning",
      title: "先預覽 CSV",
      detail: "貼上薪資、稅務、保險與付款目的地 CSV，先看錯誤列，不會直接寫入正式資料。",
      note: "預覽畫面不回顯 CSV 原文或完整銀行帳號。",
      href: "#payroll-import-form",
      actionLabel: "貼上 CSV",
    };
  }
  if (workspace.preview?.invalidCount) {
    return {
      tone: "danger",
      title: "先修正錯誤列",
      detail: `${workspace.preview.invalidCount} 列資料未通過檢查。修正後重新預覽，才能確認匯入。`,
      note: "錯誤列不會部分匯入，避免薪資與付款資料不一致。",
      href: "#payroll-import-preview",
      actionLabel: "查看錯誤列",
    };
  }
  if (workspace.preview && workspace.preview.validCount > 0) {
    return {
      tone: "",
      title: "可以確認匯入",
      detail: `${workspace.preview.validCount} 列都通過格式檢查。確認後會建立薪資、付款、稅務/保險資料並寫入稽核。`,
      note: "請確認這是客戶核准的正式檔版本。",
      href: "#payroll-import-preview",
      actionLabel: "確認前檢查",
    };
  }
  return {
    tone: "warning",
    title: "沒有可匯入資料",
    detail: "目前 CSV 只有欄位或沒有有效列。請加入員工資料後重新預覽。",
    note: "確認匯入至少需要一列有效員工資料。",
    href: "#payroll-import-form",
    actionLabel: "重新貼上 CSV",
  };
}

function buildImportStage(preview: PayrollProfileImportPreview | null, imported: boolean) {
  if (imported) return { label: "匯入完成", badgeClass: "done" };
  if (!preview) return { label: "待預覽", badgeClass: "warning" };
  if (preview.invalidCount > 0) return { label: "需要修正", badgeClass: "warning" };
  if (preview.validCount > 0) return { label: "可確認匯入", badgeClass: "done" };
  return { label: "沒有有效列", badgeClass: "warning" };
}

function taxResidencyLabel(value: PayrollProfileImportRow["taxResidency"]) {
  return value === "non_resident" ? "非居住者扣繳" : "居住者扣繳";
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function localizeImportError(error: string) {
  return error
    .replace("Unable to process payroll profile import.", "無法處理薪資與付款批次匯入。")
    .replace("Payroll profile import preview expired. Preview the CSV again.", "匯入預覽已失效，請重新預覽 CSV。")
    .replace("Fix invalid rows before importing payroll profiles.", "請先修正錯誤列，再確認匯入。")
    .replace("No valid payroll profile rows to import.", "沒有可匯入的有效資料列。")
    .replace("CSV content is required.", "請貼上 CSV 內容。")
    .replace(/^Missing required CSV header: (.+)$/u, "缺少必要欄位：$1");
}

function localizeRowError(error: string) {
  return error
    .replace("Employee number is required.", "請填員工編號。")
    .replace("Duplicate employee number in CSV.", "CSV 中有重複員工編號。")
    .replace("Employee number was not found.", "找不到對應的在職員工。")
    .replace("Base salary must be zero or greater.", "本薪必須大於或等於 0。")
    .replace("Hourly wage must be blank or zero or greater.", "時薪需留空或大於等於 0。")
    .replace("Dependent count must be zero or greater.", "扶養人數必須大於或等於 0。")
    .replace("Bank code must be 3 to 7 digits.", "銀行代碼必須為 3 到 7 位數字。")
    .replace("Branch code must be 3 to 7 digits.", "分行代碼必須為 3 到 7 位數字。")
    .replace("Account name is required.", "請填戶名。")
    .replace("Account number must be 6 to 20 digits.", "銀行帳號必須為 6 到 20 位數字。")
    .replace("Effective date must be YYYY-MM-DD.", "生效日必須是 YYYY-MM-DD。")
    .replace("Non-resident withholding rate percent is required for non-residents.", "非居住者必須填扣繳率百分比。");
}
