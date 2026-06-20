import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getFileStorageSettings,
  isProductionStorageVerified,
  type FileStorageProvider,
  type FileStorageSettings,
} from "@/server/files/storage";

type SearchParams = Promise<{ error?: string; success?: string }>;

const providerOptions: Array<{ value: FileStorageProvider; label: string; detail: string }> = [
  {
    value: "demo_object_storage",
    label: "示範物件儲存",
    detail: "只適合本機展示，不可存放正式客戶文件。",
  },
  {
    value: "s3",
    label: "Amazon S3 相容",
    detail: "適合企業客戶與既有雲端治理流程。",
  },
  {
    value: "r2",
    label: "Cloudflare R2",
    detail: "適合重視邊緣網路與可控成本的客戶。",
  },
  {
    value: "gcs",
    label: "Google Cloud Storage",
    detail: "適合 Google Cloud 或 Workspace 客戶。",
  },
  {
    value: "azure_blob",
    label: "Azure Blob",
    detail: "適合 Microsoft 365、Entra ID 與 Azure 客戶。",
  },
  {
    value: "custom",
    label: "自訂供應商",
    detail: "需由工程與資安確認簽名 URL、掃描與保留策略。",
  },
];

export default async function FileStorageSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, success }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    redirect(dashboardPathForRole(session.role));
  }

  const settings = await getFileStorageSettings(session);
  const focus = buildFileStorageFocus(settings);
  const setupCards = buildFileStorageCards(settings);
  const checklist = buildFileStorageChecklist(settings);
  const canWrite = hasPermission(session.role, "settings:write");

  return (
    <main className="page file-storage-page">
      <section className="settings-control-hero file-storage-hero" aria-label="文件儲存工作台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="muted">Owner、人資與行政主管使用</span>
            <span className={`badge ${focus.tone === "ready" ? "" : focus.tone === "danger" ? "danger" : "warning"}`}>
              {focus.badge}
            </span>
          </div>
          <h1>文件儲存工作台</h1>
          <p>
            把員工文件、表單附件、法遵證據與未來薪資附件的物件儲存政策集中管理；HR One 只保存儲存參照與驗證狀態，不保存檔案內容、供應商金鑰或私密備註原文。
          </p>
          <div className="settings-control-hero-actions">
            <a className="button primary" href="#file-storage-form">
              調整儲存政策
            </a>
            <Link className="button" href="/hr/documents">
              文件金庫
            </Link>
            <Link className="button" href="/settings/readiness">
              上線閘門
            </Link>
          </div>
        </div>

        <aside className={`settings-control-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="muted">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <a className="button primary" href={focus.href}>
            {focus.label}
          </a>
        </aside>
      </section>

      {success ? (
        <section className="file-storage-alerts" aria-live="polite">
          <div className="panel success-panel">
            <strong>{successMessage(success)}</strong>
            <p>已寫入文件儲存設定稽核紀錄；頁面只顯示政策摘要，不顯示檔案內容、供應商金鑰、薪資、身分證或銀行帳號。</p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="file-storage-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>文件儲存設定未儲存</strong>
            <p>{localizeFileStorageError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="settings-signal-board file-storage-signal-board" aria-label="文件儲存訊號板">
        <article className={`settings-signal-card ${settings.provider === "demo_object_storage" ? "danger" : "done"}`}>
          <span>儲存供應商</span>
          <strong>{providerLabel(settings.provider)}</strong>
          <small>{settings.provider === "demo_object_storage" ? "正式客戶不得使用示範儲存。" : "已改用非示範物件儲存。"}</small>
        </article>
        <article className={`settings-signal-card ${settings.kmsKeyRef ? "done" : "danger"}`}>
          <span>KMS 參照</span>
          <strong>{settings.kmsKeyRef ? "已設定" : "缺少 KMS"}</strong>
          <small>{settings.kmsKeyRef ? maskReference(settings.kmsKeyRef) : "正式文件需有加密金鑰參照，密鑰本體不得進入 HR One。"}</small>
        </article>
        <article className={`settings-signal-card ${settings.malwareScanningRequired ? "done" : "danger"}`}>
          <span>惡意程式掃描</span>
          <strong>{settings.malwareScanningRequired ? "必須" : "未強制"}</strong>
          <small>員工文件與附件上架前必須保留掃描狀態與證據。</small>
        </article>
        <article className={`settings-signal-card ${isProductionStorageVerified(settings) ? "done" : "warning"}`}>
          <span>上線閘門</span>
          <strong>{isProductionStorageVerified(settings) ? "正式儲存已驗證" : "尚未通過"}</strong>
          <small>{settings.lastVerifiedAt ? `最近驗證 ${formatDate(settings.lastVerifiedAt)}` : "需要外部驗證測試與驗證紀錄。"}</small>
        </article>
      </section>

      <section className="settings-command-grid file-storage-command-grid" aria-label="文件儲存作業區">
        {setupCards.map((card) => (
          <article className={`settings-command-card file-storage-command-card ${card.tone}`} key={card.title}>
            <div>
              <span className="muted">{card.stage}</span>
              <h2>{card.title}</h2>
            </div>
            <span className={`badge ${card.badgeClass}`}>{card.status}</span>
            <p>{card.detail}</p>
            <a className="button primary" href={card.href}>
              {card.actionLabel}
            </a>
            <div className="settings-command-links">
              {card.links.map((link) => (
                <Link href={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid">
        <section className="panel span-12" id="file-storage-form">
          <div className="section-heading">
            <div>
              <h2>三步文件儲存設定精靈</h2>
              <p className="muted">先選正式物件儲存，再設定加密、掃描、保留期限，最後寫入驗證測試證據；金鑰與密碼仍放在供應商或部署保管庫。</p>
            </div>
            <span className="badge">Audited</span>
          </div>

          <form action="/api/settings/file-storage" method="post" className="wizard-form file-storage-form" aria-label="三步文件儲存設定精靈">
            <fieldset className="form-card file-storage-fieldset" disabled={!canWrite}>
              <legend>1. 供應商與儲存位置</legend>
              <p className="muted">正式客戶必須使用非示範物件儲存；HR One 只保存 bucket、region 與前綴，不保存存取金鑰或密鑰。</p>
              <label>
                供應商
                <select name="provider" defaultValue={settings.provider}>
                  {providerOptions.map((provider) => (
                    <option value={provider.value} key={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="file-storage-provider-grid" aria-label="儲存類型提示卡">
                {providerOptions.map((provider) => (
                  <article className={provider.value === settings.provider ? "active" : ""} key={provider.value}>
                    <strong>{provider.label}</strong>
                    <small>{provider.detail}</small>
                  </article>
                ))}
              </div>
              <div className="field-grid">
                <label>
                  Bucket 名稱
                  <input name="bucketName" defaultValue={settings.bucketName} required />
                </label>
                <label>
                  區域
                  <input name="region" defaultValue={settings.region ?? ""} placeholder="ap-northeast-1" />
                </label>
                <label>
                  基礎路徑前綴
                  <input name="basePrefix" defaultValue={settings.basePrefix} required />
                </label>
                <label>
                  KMS 金鑰參照
                  <input name="kmsKeyRef" defaultValue={settings.kmsKeyRef ?? ""} placeholder="alias/hr-one-documents" />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-card file-storage-fieldset" disabled={!canWrite}>
              <legend>2. 檔案政策</legend>
              <p className="muted">員工文件、工作條件、規章證據與附件都會套用這些限制；大小、類型與保留期限會在上傳前檢查。</p>
              <div className="field-grid">
                <label>
                  簽名 URL 有效分鐘數
                  <input
                    name="signedUrlTtlMinutes"
                    type="number"
                    min="1"
                    max="120"
                    defaultValue={settings.signedUrlTtlMinutes}
                  />
                </label>
                <label>
                  檔案大小上限 MB
                  <input name="maxFileSizeMb" type="number" min="1" max="100" defaultValue={settings.maxFileSizeMb} />
                </label>
                <label>
                  保留天數
                  <input name="retentionDays" type="number" min="30" max="3650" defaultValue={settings.retentionDays} />
                </label>
                <label>
                  驗證狀態
                  <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                    <option value="unverified">未驗證</option>
                    <option value="verified">已驗證</option>
                    <option value="failed">驗證失敗</option>
                  </select>
                </label>
              </div>
              <label className="check-row">
                <input
                  name="malwareScanningRequired"
                  type="checkbox"
                  defaultChecked={settings.malwareScanningRequired}
                />
                上架或下載前必須完成惡意程式掃描
              </label>
              <label>
                允許的 MIME 類型
                <textarea name="allowedMimeTypes" rows={3} defaultValue={settings.allowedMimeTypes.join(", ")} />
              </label>
            </fieldset>

            <fieldset className="form-card file-storage-fieldset" disabled={!canWrite}>
              <legend>3. 上線閘門與證據</legend>
              <p className="muted">驗證備註請只放 ticket、測試結果或證據摘要；不要貼存取金鑰、密鑰、員工姓名、薪資、身分證、銀行帳號或私密人事內容。</p>
              <ul className="task-list file-storage-checklist">
                {checklist.map((item) => (
                  <li className="task" key={item.title}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className={`badge ${item.ready ? "" : "warning"}`}>{item.ready ? "完成" : "待補"}</span>
                  </li>
                ))}
              </ul>
              <div className="file-storage-policy-note">
                <strong>敏感資料防護</strong>
                <p>HR One 只保留儲存參照、bucket、object key、掃描狀態、保存期限與 hash 證據；檔案內容與供應商金鑰留在正式物件儲存與保管庫。</p>
              </div>
              <label>
                驗證備註
                <textarea
                  name="verificationNote"
                  rows={3}
                  placeholder="例：STR-2026-0001 驗證測試通過，已確認簽名 URL、KMS、掃描與保留期限。"
                />
              </label>
              <button className="button primary" type="submit">
                儲存文件儲存設定
              </button>
            </fieldset>
          </form>
          {!canWrite ? (
            <p className="muted">目前角色只能檢視設定，不能修改文件儲存政策。</p>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function buildFileStorageFocus(settings: FileStorageSettings) {
  if (settings.provider === "demo_object_storage") {
    return {
      badge: "示範儲存",
      tone: "danger" as const,
      title: "改用正式物件儲存",
      detail: "正式客戶文件、附件與法遵證據不能留在示範儲存。先選 S3、R2、GCS、Azure Blob 或客戶指定供應商。",
      href: "#file-storage-form",
      label: "設定供應商",
    };
  }

  if (!settings.kmsKeyRef) {
    return {
      badge: "缺少 KMS",
      tone: "danger" as const,
      title: "補加密金鑰參照",
      detail: "供應商金鑰不進 HR One，但正式儲存必須保存 KMS 或 vault 參照，供上線閘門與稽核追蹤。",
      href: "#file-storage-form",
      label: "補 KMS",
    };
  }

  if (!settings.malwareScanningRequired) {
    return {
      badge: "掃描未強制",
      tone: "danger" as const,
      title: "強制檔案掃描",
      detail: "員工文件與附件上架前應有掃描狀態；否則 HR 文件金庫不能作為正式證據來源。",
      href: "#file-storage-form",
      label: "開啟掃描",
    };
  }

  if (settings.verificationStatus !== "verified" || !settings.lastVerifiedAt) {
    return {
      badge: "待驗證測試",
      tone: "warning" as const,
      title: "補外部驗證證據",
      detail: "儲存策略已接近完成，但還需要簽名 URL、KMS、掃描與保留期限的驗證測試證據。",
      href: "#file-storage-form",
      label: "補驗證",
    };
  }

  return {
    badge: "已就緒",
    tone: "ready" as const,
    title: "正式文件儲存已就緒",
    detail: "維持非示範供應商、KMS、掃描、短效簽名 URL 與保留期限證據，並定期重跑上線閘門。",
    href: "/settings/readiness",
    label: "看上線閘門",
  };
}

function buildFileStorageCards(settings: FileStorageSettings) {
  return [
    {
      stage: "步驟 1",
      title: "供應商",
      status: settings.provider === "demo_object_storage" ? "示範" : providerLabel(settings.provider),
      badgeClass: settings.provider === "demo_object_storage" ? "danger" : "",
      tone: settings.provider === "demo_object_storage" ? "danger" : "ready",
      detail: "正式客戶文件要放在客戶核准的物件儲存；HR One 不存檔案內容，也不存供應商密鑰。",
      href: "#file-storage-form",
      actionLabel: "選供應商",
      links: [
        { href: "/hr/documents", label: "文件金庫" },
        { href: "/settings/readiness", label: "上線閘門" },
      ],
    },
    {
      stage: "步驟 2",
      title: "KMS 與掃描",
      status: settings.kmsKeyRef && settings.malwareScanningRequired ? "已控管" : "待補",
      badgeClass: settings.kmsKeyRef && settings.malwareScanningRequired ? "" : "danger",
      tone: settings.kmsKeyRef && settings.malwareScanningRequired ? "ready" : "danger",
      detail: "KMS 參照、惡意程式掃描與短效簽名 URL 是文件正式上線的基本防線。",
      href: "#file-storage-form",
      actionLabel: "補安全欄位",
      links: [
        { href: "/settings/security", label: "登入政策" },
        { href: "/settings/privacy", label: "個資治理" },
      ],
    },
    {
      stage: "步驟 3",
      title: "保留期限",
      status: `${settings.retentionDays} 天`,
      badgeClass: settings.retentionDays >= 1825 ? "" : "warning",
      tone: settings.retentionDays >= 1825 ? "ready" : "warning",
      detail: "員工文件、工資清冊、勞檢證據與交接紀錄需要可追溯保存；過短保留期會影響勞檢準備。",
      href: "#file-storage-form",
      actionLabel: "檢查期限",
      links: [
        { href: "/hr/documents", label: "文件保留" },
        { href: "/settings/audit", label: "稽核紀錄" },
      ],
    },
    {
      stage: "上線閘門",
      title: "驗證測試",
      status: settings.verificationStatus === "verified" ? "已驗證" : "未通過",
      badgeClass: settings.verificationStatus === "verified" ? "" : "warning",
      tone: settings.verificationStatus === "verified" ? "ready" : "warning",
      detail: "上線前要證明簽名 URL、讀寫、掃描、KMS 與保留期限都能運作，且證據不含敏感原文。",
      href: "#file-storage-form",
      actionLabel: "寫入證據",
      links: [
        { href: "/settings/readiness", label: "上線閘門" },
        { href: "/settings/production-database", label: "正式環境" },
      ],
    },
  ];
}

function buildFileStorageChecklist(settings: FileStorageSettings) {
  return [
    {
      title: "非示範供應商",
      detail: settings.provider === "demo_object_storage" ? "目前仍是示範儲存，不可販售上線。" : `目前使用 ${providerLabel(settings.provider)}。`,
      ready: settings.provider !== "demo_object_storage",
    },
    {
      title: "KMS 或 vault 參照",
      detail: settings.kmsKeyRef ? "已保存金鑰參照，未保存密鑰。" : "缺少 KMS/vault 參照。",
      ready: Boolean(settings.kmsKeyRef),
    },
    {
      title: "惡意程式掃描",
      detail: settings.malwareScanningRequired ? "掃描為必須，文件可保留掃描狀態。" : "掃描尚未強制。",
      ready: settings.malwareScanningRequired,
    },
    {
      title: "正式驗證證據",
      detail: settings.verificationStatus === "verified" && settings.lastVerifiedAt ? `最近驗證 ${formatDate(settings.lastVerifiedAt)}。` : "尚未寫入通過的驗證測試證據。",
      ready: settings.verificationStatus === "verified" && Boolean(settings.lastVerifiedAt),
    },
  ];
}

function providerLabel(provider: FileStorageProvider) {
  return providerOptions.find((option) => option.value === provider)?.label ?? provider;
}

function maskReference(value: string) {
  if (value.length <= 12) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(value);
}

function successMessage(success: string) {
  if (success === "saved") return "文件儲存設定已儲存";
  return "文件儲存設定已更新";
}

function localizeFileStorageError(error: string) {
  if (/settings:write/i.test(error)) return "目前角色沒有修改文件儲存設定的權限。";
  if (/provider/i.test(error)) return "請選擇有效的物件儲存供應商。";
  if (/database/i.test(error)) return "正式資料庫讀寫失敗，系統不會退回示範儲存。";
  return "請確認供應商、bucket、KMS 參照、掃描政策、MIME 類型與驗證狀態後再試一次。";
}
