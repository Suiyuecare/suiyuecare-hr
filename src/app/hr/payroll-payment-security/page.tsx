import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoSession } from "@/server/auth/session";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import {
  getPayrollPaymentSecurityReadiness,
  getPayrollPaymentSecuritySettings,
  type BankTransferColumnKey,
  type PayrollPaymentSecuritySettings,
} from "@/server/payroll/payment-security";

type SearchParams = Promise<{ error?: string }>;
type PaymentSecurityReadiness = Awaited<ReturnType<typeof getPayrollPaymentSecurityReadiness>>;

const bankColumnOptions: Array<{
  key: BankTransferColumnKey;
  label: string;
  description: string;
  required: boolean;
}> = [
  { key: "employee_no", label: "員工編號", description: "供銀行檔與封存清單對帳。", required: false },
  { key: "employee_name", label: "員工姓名", description: "非必要；若客戶銀行格式要求才放入。", required: false },
  { key: "bank_code", label: "銀行代碼", description: "台灣金融機構代碼。", required: false },
  { key: "branch_code", label: "分行代碼", description: "客戶銀行格式需要時使用。", required: false },
  { key: "account_token_ref", label: "帳號 token 參照", description: "必要；不得放真實銀行帳號。", required: true },
  { key: "amount", label: "金額", description: "必要；只在受控薪資計算中產生。", required: true },
  { key: "currency", label: "幣別", description: "通常為 TWD。", required: false },
  { key: "memo", label: "備註", description: "若使用，避免放入個資或薪資明細。", required: false },
];

export default async function PayrollPaymentSecurityPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const [settings, readiness] = await Promise.all([
    getPayrollPaymentSecuritySettings(session),
    getPayrollPaymentSecurityReadiness(session),
  ]);
  const focus = buildPaymentSecurityFocus(settings, readiness);
  const setupSteps = buildSetupSteps(settings, readiness);
  const selectedColumns = new Set(settings.bankFileColumnOrder);

  return (
    <main className="page payroll-payment-security-page">
      <section className="hr-monthly-hero payroll-payment-security-hero" aria-label="付款安全設定工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">薪資付款安全</span>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "可產生銀行檔" : "銀行檔未就緒"}
            </span>
          </div>
          <h1>付款安全設定工作台</h1>
          <p>
            先完成付款 token 金庫、KMS 金鑰、客戶銀行格式與驗證證據，HR One 才允許產生銀行轉帳封存包；本頁只保存參照與設定，不保存真實銀行帳號、密鑰或員工薪資明細。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr/payroll-exports">
              回發薪封存
            </Link>
            <Link className="button" href="/hr/payment-profiles">
              付款資料
            </Link>
            <Link className="button" href="/settings/audit">
              稽核紀錄
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
        <section className="payroll-payment-security-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>付款安全設定未儲存</strong>
            <p>{localizePaymentSecurityError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board payroll-payment-security-signal-board" aria-label="付款安全訊號板">
        <article className={`hr-monthly-signal-card ${settings.tokenVaultProvider !== "not_configured" && settings.tokenVaultRef ? "done" : "warning"}`}>
          <span>付款金庫</span>
          <strong>{providerLabel(settings.tokenVaultProvider)}</strong>
          <small>{settings.tokenVaultRef ? "已保存金庫參照；不保存 token 或帳號原文。" : "尚未設定金庫參照。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${settings.kmsKeyRef ? "done" : "warning"}`}>
          <span>KMS 金鑰</span>
          <strong>{settings.kmsKeyRef ? "已設定" : "尚未設定"}</strong>
          <small>{settings.kmsKeyRef ? "只保存金鑰參照，實際金鑰留在客戶核准環境。" : "銀行檔封存前需有加密金鑰參照。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${settings.bankFormatVerified && settings.verificationStatus === "verified" ? "done" : "warning"}`}>
          <span>銀行格式</span>
          <strong>{settings.bankFileFormat === "tw_bank_csv_placeholder" ? "待確認" : settings.bankFileFormat}</strong>
          <small>{settings.bankFormatVerified ? "客戶銀行格式已標記驗證。" : "需完成沙盒或客戶測試後才能上線。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${hasRequiredBankColumns(settings.bankFileColumnOrder) ? "done" : "danger"}`}>
          <span>欄位安全</span>
          <strong>{settings.bankFileColumnOrder.length} 欄</strong>
          <small>{hasRequiredBankColumns(settings.bankFileColumnOrder) ? "已包含金額與帳號 token 參照。" : "缺少金額或帳號 token 參照欄位。"}</small>
        </article>
      </section>

      <section className="settings-command-grid payroll-payment-security-step-grid" aria-label="付款安全設定步驟">
        {setupSteps.map((step) => (
          <article className={`settings-command-card payroll-payment-security-step-card ${step.tone}`} key={step.title}>
            <span className={`badge ${step.badgeClass}`}>{step.status}</span>
            <h2>{step.title}</h2>
            <p>{step.detail}</p>
            <a className="button" href={step.href}>
              {step.actionLabel}
            </a>
          </article>
        ))}
      </section>

      <section className="grid">
        <section className="panel span-12" id="payment-security-form">
          <div className="section-heading">
            <div>
              <h2>三步設定精靈</h2>
              <p className="muted">複雜設定集中在同一張表單，但依照金庫、銀行格式、驗證證據分段；儲存時會寫入稽核紀錄。</p>
            </div>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "已通過付款安全閘門" : "尚有設定未完成"}
            </span>
          </div>

          <form action="/api/payroll/payment-security" method="post" className="wizard-form payroll-payment-security-form">
            <fieldset className="form-card payroll-payment-security-fieldset">
              <legend>1. 付款 token 金庫</legend>
              <p className="muted">只填保存位置與參照，實際帳號 token、密鑰與銀行帳號必須留在客戶核准的金庫。</p>
              <div className="field-grid">
                <label>
                  金庫服務
                  <select name="tokenVaultProvider" defaultValue={settings.tokenVaultProvider}>
                    <option value="not_configured">尚未設定</option>
                    <option value="aws_secrets_manager">AWS Secrets Manager</option>
                    <option value="gcp_secret_manager">Google Secret Manager</option>
                    <option value="azure_key_vault">Azure Key Vault</option>
                    <option value="hashicorp_vault">HashiCorp Vault</option>
                    <option value="custom_vault">自訂金庫</option>
                  </select>
                </label>
                <label>
                  金庫參照
                  <input name="tokenVaultRef" placeholder="vault://customer/payroll-payment" defaultValue={settings.tokenVaultRef ?? ""} />
                </label>
                <label>
                  KMS 金鑰參照
                  <input name="kmsKeyRef" placeholder="alias/customer-payroll-payment" defaultValue={settings.kmsKeyRef ?? ""} />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-card payroll-payment-security-fieldset">
              <legend>2. 客戶銀行格式</legend>
              <p className="muted">銀行檔格式需由客戶或銀行沙盒驗證；正式欄位順序會被發薪封存中心引用。</p>
              <div className="field-grid">
                <label>
                  銀行檔格式代碼
                  <input name="bankFileFormat" placeholder="customer_bank_csv" defaultValue={settings.bankFileFormat} />
                </label>
                <label>
                  格式版本
                  <input name="bankFormatVersion" placeholder="v1" defaultValue={settings.bankFormatVersion} />
                </label>
                <label>
                  驗證狀態
                  <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                    <option value="unverified">尚未驗證</option>
                    <option value="verified">已驗證</option>
                    <option value="failed">驗證失敗</option>
                  </select>
                </label>
              </div>

              <label>
                欄位順序（進階）
                <input
                  name="bankFileColumnOrder"
                  defaultValue={settings.bankFileColumnOrder.join(",")}
                  aria-describedby="bank-column-order-help"
                />
              </label>
              <div className="payroll-payment-column-board" aria-label="銀行檔欄位">
                {bankColumnOptions.map((column) => (
                  <div className={`payroll-payment-column ${selectedColumns.has(column.key) ? "selected" : ""}`} key={column.key}>
                    <span className={`badge ${column.required ? "warning" : ""}`}>{column.required ? "必要" : "依格式"}</span>
                    <strong>{column.label}</strong>
                    <small>{column.description}</small>
                  </div>
                ))}
              </div>
              <p className="muted" id="bank-column-order-help">
                目前欄位順序：{settings.bankFileColumnOrder.map(columnLabel).join(" → ")}。可用欄位代碼為 employee_no, employee_name, bank_code, branch_code, account_token_ref, amount, currency, memo。
              </p>
            </fieldset>

            <fieldset className="form-card payroll-payment-security-fieldset">
              <legend>3. 驗證證據</legend>
              <p className="muted">請記錄客戶銀行沙盒測試、核准人、日期或上線切換備註；不要貼上薪資明細、銀行帳號、身分證或私密備註。</p>
              <label className="check-row">
                <input name="bankFormatVerified" type="checkbox" defaultChecked={settings.bankFormatVerified} />
                客戶銀行格式已完成測試
              </label>
              <label>
                驗證備註
                <textarea
                  name="verificationNote"
                  placeholder="例：2026-07-01 完成客戶銀行沙盒測試，核准人與證據編號請填安全參照。"
                  defaultValue={settings.verificationNote ?? ""}
                />
              </label>
              <div className="payroll-payment-security-note">
                <strong>安全提醒</strong>
                <p>本頁只該出現參照、格式、欄位與驗證狀態。不要輸入員工薪資、銀行帳號、身分證字號、健康資料或未遮罩的私人資料。</p>
              </div>
            </fieldset>

            <button className="button primary" type="submit">
              儲存付款安全設定
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>銀行檔上線檢查</h2>
              <p className="muted">{localizeReadinessDetail(readiness.detail)}</p>
            </div>
            <Link className="button" href="/hr/payroll-exports">
              開啟發薪封存
            </Link>
          </div>
          <ul className="task-list payroll-payment-security-checklist">
            {paymentSecurityChecks(settings).map((item) => (
              <li className="task" key={item.title}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className={`badge ${item.done ? "done" : "warning"}`}>{item.done ? "完成" : "待補"}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function buildPaymentSecurityFocus(
  settings: PayrollPaymentSecuritySettings,
  readiness: PaymentSecurityReadiness,
) {
  if (readiness.ready) {
    return {
      tone: "",
      title: "可以產生銀行檔封存",
      detail: "付款金庫、KMS、銀行格式、必要欄位與驗證證據都已就緒。下一步回發薪封存中心產生銀行轉帳封存包。",
      note: "產生與下載封存清單都會留下稽核紀錄。",
      href: "/hr/payroll-exports",
      actionLabel: "回發薪封存",
    };
  }
  if (settings.tokenVaultProvider === "not_configured" || !settings.tokenVaultRef) {
    return {
      tone: "warning",
      title: "先補付款金庫",
      detail: "沒有付款金庫服務與金庫參照時，系統不能安全產生銀行檔。",
      note: "只填參照，不填實際銀行帳號或 token。",
      href: "#payment-security-form",
      actionLabel: "補金庫設定",
    };
  }
  if (!settings.kmsKeyRef) {
    return {
      tone: "warning",
      title: "補 KMS 金鑰參照",
      detail: "銀行檔封存前需有客戶核准的加密金鑰參照，避免付款資料離開受控環境。",
      note: "本頁不保存實際金鑰。",
      href: "#payment-security-form",
      actionLabel: "補金鑰參照",
    };
  }
  if (settings.bankFileFormat === "tw_bank_csv_placeholder" || !settings.bankFormatVerified) {
    return {
      tone: "warning",
      title: "完成銀行格式驗證",
      detail: "銀行檔格式仍是預設值或尚未測試；請完成客戶銀行沙盒/格式驗證並記錄證據。",
      note: "未驗證格式不能進入正式銀行檔產生流程。",
      href: "#payment-security-form",
      actionLabel: "補格式驗證",
    };
  }
  return {
    tone: "danger",
    title: "補驗證證據",
    detail: "驗證狀態需為已驗證，且要有時間與證據紀錄，才能通過付款安全閘門。",
    note: "證據只放參照與摘要，不放敏感原文。",
    href: "#payment-security-form",
    actionLabel: "補驗證證據",
  };
}

function buildSetupSteps(settings: PayrollPaymentSecuritySettings, readiness: PaymentSecurityReadiness) {
  const vaultDone = settings.tokenVaultProvider !== "not_configured" && Boolean(settings.tokenVaultRef && settings.kmsKeyRef);
  const formatDone = settings.bankFileFormat !== "tw_bank_csv_placeholder" && hasRequiredBankColumns(settings.bankFileColumnOrder);
  const evidenceDone = settings.bankFormatVerified && settings.verificationStatus === "verified" && Boolean(settings.lastVerifiedAt);
  return [
    {
      title: "金庫與金鑰",
      detail: "指定付款 token 金庫與 KMS 金鑰參照；HR One 只保存參照，不保存密鑰或帳號。",
      status: vaultDone ? "完成" : "待補",
      tone: vaultDone ? "ready" : "warning",
      badgeClass: vaultDone ? "done" : "warning",
      href: "#payment-security-form",
      actionLabel: vaultDone ? "檢視設定" : "補金庫",
    },
    {
      title: "銀行格式",
      detail: "確認客戶銀行檔格式、版本與必要欄位，避免正式發薪時欄位錯位。",
      status: formatDone ? "完成" : "待補",
      tone: formatDone ? "ready" : "warning",
      badgeClass: formatDone ? "done" : "warning",
      href: "#payment-security-form",
      actionLabel: formatDone ? "檢視欄位" : "補格式",
    },
    {
      title: "驗證證據",
      detail: "記錄銀行沙盒測試或客戶驗收證據；只有完成後才能產生銀行轉帳封存包。",
      status: evidenceDone ? "完成" : "待補",
      tone: readiness.ready ? "ready" : "warning",
      badgeClass: evidenceDone ? "done" : "warning",
      href: "#payment-security-form",
      actionLabel: evidenceDone ? "檢視證據" : "補證據",
    },
  ] satisfies Array<{
    title: string;
    detail: string;
    status: string;
    tone: "ready" | "warning";
    badgeClass: "done" | "warning";
    href: string;
    actionLabel: string;
  }>;
}

function paymentSecurityChecks(settings: PayrollPaymentSecuritySettings) {
  return [
    {
      title: "付款金庫服務",
      detail: providerLabel(settings.tokenVaultProvider),
      done: settings.tokenVaultProvider !== "not_configured",
    },
    {
      title: "金庫參照",
      detail: settings.tokenVaultRef ? "已保存參照，不顯示原始 token。" : "尚未填入金庫參照。",
      done: Boolean(settings.tokenVaultRef),
    },
    {
      title: "KMS 金鑰參照",
      detail: settings.kmsKeyRef ? "已保存金鑰參照。" : "尚未填入 KMS 金鑰參照。",
      done: Boolean(settings.kmsKeyRef),
    },
    {
      title: "正式銀行格式",
      detail: settings.bankFileFormat === "tw_bank_csv_placeholder" ? "仍是預設格式。" : `${settings.bankFileFormat} · ${settings.bankFormatVersion}`,
      done: settings.bankFileFormat !== "tw_bank_csv_placeholder",
    },
    {
      title: "必要欄位",
      detail: hasRequiredBankColumns(settings.bankFileColumnOrder) ? "已包含帳號 token 參照與金額。" : "缺少帳號 token 參照或金額。",
      done: hasRequiredBankColumns(settings.bankFileColumnOrder),
    },
    {
      title: "驗證證據",
      detail: settings.verificationStatus === "verified" && settings.lastVerifiedAt ? `已於 ${formatDate(settings.lastVerifiedAt)} 驗證。` : "尚未完成驗證證據。",
      done: settings.verificationStatus === "verified" && Boolean(settings.lastVerifiedAt),
    },
  ];
}

function hasRequiredBankColumns(columns: BankTransferColumnKey[]) {
  return columns.includes("account_token_ref") && columns.includes("amount");
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    not_configured: "尚未設定",
    aws_secrets_manager: "AWS Secrets Manager",
    gcp_secret_manager: "Google Secret Manager",
    azure_key_vault: "Azure Key Vault",
    hashicorp_vault: "HashiCorp Vault",
    custom_vault: "自訂金庫",
  };
  return labels[provider] ?? provider;
}

function columnLabel(column: BankTransferColumnKey) {
  return bankColumnOptions.find((option) => option.key === column)?.label ?? column;
}

function localizeReadinessDetail(detail: string) {
  return detail
    .replace("Missing", "缺少")
    .replace("token vault provider", "付款金庫服務")
    .replace("token vault reference", "金庫參照")
    .replace("KMS key reference", "KMS 金鑰參照")
    .replace("production bank file format", "正式銀行檔格式")
    .replace("bank file amount and account token columns", "銀行檔金額與帳號 token 欄位")
    .replace("bank format verification", "銀行格式驗證")
    .replace("verification evidence", "驗證證據")
    .replace("vault configured", "金庫已設定")
    .replace("verified", "已驗證")
    .replace(/\.$/, "。");
}

function localizePaymentSecurityError(error: string) {
  return localizeReadinessDetail(error)
    .replace("Unable to update payment security settings", "無法更新付款安全設定")
    .replace("Role employee cannot payroll:manage", "目前角色沒有薪資管理權限");
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
