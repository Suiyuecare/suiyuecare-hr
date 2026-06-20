import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getEmployeeDocumentWorkspace,
  type EmployeeDocumentRow,
  type EmployeeDocumentWorkspace,
} from "@/server/employees/documents";
import type { FileStorageSettings } from "@/server/files/storage";

type SearchParams = Promise<{ error?: string }>;

type DocumentFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function HrDocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "employee:write")) {
    return (
      <main className="page employee-document-page">
        <section className="hr-monthly-hero employee-document-hero" aria-label="員工文件金庫">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">員工文件</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>員工文件金庫</h1>
            <p>員工契約、證明文件、請假附件與身分文件 metadata 只開放 HR/Owner 管理，一般員工只能看 HR 釋出的自己的文件。</p>
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
            <strong>文件資料已保護</strong>
            <p>未授權角色不顯示文件 metadata、儲存設定或員工自助釋出狀態。</p>
            <small>請切換人資管理員或 Owner 後再操作。</small>
          </aside>
        </section>
      </main>
    );
  }

  const workspace = await getEmployeeDocumentWorkspace(session);
  const visibleCount = workspace.documents.filter((document) => document.visibleToEmployee).length;
  const scanPendingCount = workspace.documents.filter((document) => document.malwareScanStatus === "pending").length;
  const expiringCount = workspace.documents.filter((document) => isExpiringSoon(document)).length;
  const focus = buildDocumentFocus(workspace);

  return (
    <main className="page employee-document-page">
      <section className="hr-monthly-hero employee-document-hero" aria-label="員工文件金庫">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">員工文件金庫</span>
            <span className={`badge ${storageReady(workspace.storageSettings) ? "done" : "warning"}`}>
              {storageReady(workspace.storageSettings) ? "正式儲存已驗證" : "儲存設定待驗證"}
            </span>
          </div>
          <h1>員工文件金庫</h1>
          <p>
            用 metadata 金庫管理契約、證書、請假附件、身分文件與 HR 文件；檔案 bytes 不進資料庫，員工只看到 HR 釋出的自己文件。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#employee-document-wizard">
              新增文件
            </Link>
            <Link className="button" href="/settings/file-storage">
              儲存設定
            </Link>
            <Link className="button" href="/settings/audit">
              查看稽核
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

      {error ? (
        <section className="employee-document-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>文件 metadata 未建立</strong>
            <p>{localizeDocumentError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board employee-document-signal-board" aria-label="文件安全訊號板">
        <article className={`hr-monthly-signal-card ${workspace.documents.length ? "focus" : "warning"}`}>
          <span>文件 metadata</span>
          <strong>{workspace.documents.length}</strong>
          <small>只登錄索引、狀態與保存證據；檔案 bytes 不進資料庫。</small>
        </article>
        <article className={`hr-monthly-signal-card ${visibleCount ? "done" : "warning"}`}>
          <span>員工自助可見</span>
          <strong>{visibleCount}</strong>
          <small>{visibleCount ? "員工可在手機前台查看 HR 釋出的文件。" : "尚未釋出文件給員工自助查看。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${scanPendingCount ? "warning" : "done"}`}>
          <span>掃描待完成</span>
          <strong>{scanPendingCount}</strong>
          <small>{scanPendingCount ? "檔案正式開放下載前需完成惡意程式掃描。" : "沒有待掃描文件。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${storageReady(workspace.storageSettings) ? "done" : "warning"}`}>
          <span>儲存 Gate</span>
          <strong>{storageStatusLabel(workspace.storageSettings)}</strong>
          <small>{storageSummary(workspace.storageSettings)}</small>
        </article>
      </section>

      <section className="settings-command-grid employee-document-command-grid" aria-label="文件金庫作業卡">
        <article className={`settings-command-card ${storageReady(workspace.storageSettings) ? "ready" : "warning"}`}>
          <span className={`badge ${storageReady(workspace.storageSettings) ? "done" : "warning"}`}>
            {storageReady(workspace.storageSettings) ? "通過" : "待驗證"}
          </span>
          <h2>正式儲存 Gate</h2>
          <p>正式環境需設定物件儲存、bucket、保存天數、允許 MIME、簽名 URL 時效與 KMS/加密證據。</p>
          <Link className="button primary" href="/settings/file-storage">
            儲存設定
          </Link>
        </article>
        <article className={`settings-command-card ${scanPendingCount ? "warning" : "ready"}`}>
          <span className={`badge ${scanPendingCount ? "warning" : "done"}`}>{scanPendingCount ? "待掃描" : "正常"}</span>
          <h2>掃描與隔離</h2>
          <p>請假附件、身分文件與證書上傳後需先掃描，blocked 文件不得釋出給員工下載。</p>
          <Link className="button" href="#employee-document-list">
            查看狀態
          </Link>
        </article>
        <article className={`settings-command-card ${visibleCount ? "ready" : "warning"}`}>
          <span className={`badge ${visibleCount ? "done" : "warning"}`}>{visibleCount ? "已釋出" : "待釋出"}</span>
          <h2>員工自助</h2>
          <p>員工端只看到自己的 HR 釋出文件，下載行為需可 audit，避免每次都找 HR 補寄。</p>
          <Link className="button" href="/app/documents">
            員工預覽
          </Link>
        </article>
        <article className={`settings-command-card ${expiringCount ? "warning" : "ready"}`}>
          <span className={`badge ${expiringCount ? "warning" : "done"}`}>{expiringCount ? "要複核" : "穩定"}</span>
          <h2>保存與到期</h2>
          <p>文件保存依公司資料保留政策與法定保存需求設定；到期前應由 HR 人工複核是否封存或續留。</p>
          <Link className="button" href="/settings/privacy">
            個資治理
          </Link>
        </article>
      </section>

      <section className="grid">
        <form
          action="/api/employees/documents"
          method="post"
          className="panel span-5 wizard-form employee-document-wizard"
          id="employee-document-wizard"
          aria-label="員工文件 metadata 建立"
        >
          <div className="section-heading">
            <div>
              <h2>文件 metadata 精靈</h2>
              <p className="muted">三步：選員工與分類、登錄檔案 metadata、決定是否釋出給員工。檔案 bytes 不會進資料庫。</p>
            </div>
            <span className="badge">會寫入稽核</span>
          </div>

          <div className="section-heading compact-heading">
            <div>
              <h3>1. 文件歸屬</h3>
            </div>
            <span className="badge">必要</span>
          </div>
          <label>
            文件所屬員工
            <select name="employeeId" required>
              {workspace.employees.map((employee) => (
                <option value={employee.id} key={employee.id}>
                  {employee.employeeNo} · {employee.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            文件分類
            <select name="category" required>
              <option value="contract">契約/工作條件</option>
              <option value="certificate">證明文件</option>
              <option value="leave_attachment">請假附件</option>
              <option value="identity">身分文件</option>
              <option value="other">其他 HR 文件</option>
            </select>
          </label>
          <label>
            文件標題
            <input name="title" placeholder="在職證明 2026-06" required />
          </label>

          <div className="section-heading compact-heading">
            <div>
              <h3>2. 檔案 metadata</h3>
            </div>
            <span className="badge">不存 bytes</span>
          </div>
          <div className="field-grid">
            <label>
              檔名
              <input name="fileName" placeholder="employment-certificate.pdf" required />
            </label>
            <label>
              MIME 類型
              <input name="mimeType" defaultValue="application/pdf" required />
            </label>
            <label>
              檔案大小 bytes
              <input name="fileSizeBytes" type="number" min="1" defaultValue="120000" required />
            </label>
            <label>
              到期日
              <input name="expiresAt" type="date" />
            </label>
          </div>

          <div className="section-heading compact-heading">
            <div>
              <h3>3. 員工可見性</h3>
            </div>
            <span className="badge warning">下載要 audit</span>
          </div>
          <label className="check-row">
            <input name="visibleToEmployee" type="checkbox" />
            釋出給員工自助查看
          </label>
          <button className="button primary" type="submit">
            儲存文件 metadata
          </button>
        </form>

        <section className="panel span-7" id="employee-document-list">
          <div className="section-heading">
            <div>
              <h2>文件金庫清單</h2>
              <p className="muted">只顯示可營運的 metadata、狀態與短 ref；不顯示完整物件路徑或檔案內容。</p>
            </div>
            <span className="badge">{workspace.documents.length} 筆</span>
          </div>
          {workspace.documents.length === 0 ? (
            <EmptyState title="尚無員工文件" body="請先登錄契約、證明文件或 HR 附件 metadata，檔案本體交由物件儲存管理。" />
          ) : (
            <ul className="task-list employee-document-list">
              {workspace.documents.map((document) => (
                <li className={`task employee-document-task ${documentTone(document)}`} key={document.id}>
                  <div className="employee-document-heading">
                    <span className="employee-document-copy">
                      <strong>
                        {document.employeeNo} · {document.employeeName} · {document.title}
                      </strong>
                      <small>
                        {categoryLabel(document.category)} · {document.fileName} · {formatBytes(document.fileSizeBytes)}
                      </small>
                    </span>
                    <span className={`badge ${document.visibleToEmployee ? "done" : "warning"}`}>
                      {document.visibleToEmployee ? "員工可見" : "HR 限定"}
                    </span>
                  </div>

                  <div className="employee-document-detail-grid">
                    <span>
                      <strong>掃描</strong>
                      <small>{scanLabel(document.malwareScanStatus)}</small>
                    </span>
                    <span>
                      <strong>加密</strong>
                      <small>{encryptionLabel(document.encryptionMode)}</small>
                    </span>
                    <span>
                      <strong>保存到</strong>
                      <small>{formatDate(document.retentionUntil)}</small>
                    </span>
                    <span>
                      <strong>到期日</strong>
                      <small>{formatDate(document.expiresAt)}</small>
                    </span>
                    <span>
                      <strong>儲存</strong>
                      <small>{providerLabel(document.storageProvider)} · ref {shortRef(document.id)}</small>
                    </span>
                    <span>
                      <strong>下載稽核</strong>
                      <small>{document.downloadAuditRequired ? "必要" : "未要求"} · {statusLabel(document.status)}</small>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="employee-document-guardrails">
          <div className="section-heading">
            <div>
              <h2>文件治理原則</h2>
              <p className="muted">文件庫要讓 HR 好用，也要讓資安、法遵與員工自助可以被驗證。</p>
            </div>
            <Link className="button" href="/settings/file-storage">
              儲存政策
            </Link>
          </div>
          <div className="employee-document-guardrail-grid">
            <article>
              <strong>檔案不進資料庫</strong>
              <p>資料庫只保留 metadata、object reservation、掃描狀態與 audit；檔案 bytes 由物件儲存與金鑰政策保護。</p>
            </article>
            <article>
              <strong>最小可見</strong>
              <p>員工只看到 HR 釋出的自己文件；主管預設不看部屬私文件，薪資與身分文件仍由權限控管。</p>
            </article>
            <article>
              <strong>下載可追溯</strong>
              <p>正式下載連結應使用短效簽名 URL，並記錄下載 actor、文件 ref、時間與結果，不記錄文件內容。</p>
            </article>
            <article>
              <strong>掃描與保存</strong>
              <p>blocked 文件不得釋出；到期、封存、刪除與續留要接個資治理與公司資料保留政策。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildDocumentFocus(workspace: EmployeeDocumentWorkspace): DocumentFocus {
  if (!storageReady(workspace.storageSettings)) {
    return {
      title: "先驗證正式儲存",
      detail: "文件會包含契約、身分文件與附件 metadata，正式上線前需確認物件儲存、掃描與保留政策。",
      note: "demo_object_storage 只適合展示，不可用於正式客戶文件。",
      tone: "danger",
      href: "/settings/file-storage",
      actionLabel: "設定儲存",
    };
  }

  if (workspace.documents.length === 0) {
    return {
      title: "建立第一筆文件 metadata",
      detail: "尚未登錄員工文件，員工自助文件與 HR 文件稽核都沒有證據。",
      note: "先用證明文件或契約 metadata 演練，不需上傳檔案 bytes。",
      tone: "warning",
      href: "#employee-document-wizard",
      actionLabel: "新增文件",
    };
  }

  const pendingScan = workspace.documents.find((document) => document.malwareScanStatus === "pending");
  if (pendingScan) {
    return {
      title: "複核掃描待完成",
      detail: `${pendingScan.employeeName} 的 ${pendingScan.title} 還在待掃描狀態，釋出前需完成檢查。`,
      note: "blocked 或未掃描文件不應提供員工下載。",
      tone: "warning",
      href: "#employee-document-list",
      actionLabel: "查看文件",
    };
  }

  return {
    title: "文件金庫可營運",
    detail: "文件 metadata、員工可見性、掃描、加密與保存狀態已集中在同一工作台。",
    note: "下一步可接正式檔案上傳、短效下載 URL 與下載 audit。",
    tone: "ready",
    href: "/app/documents",
    actionLabel: "員工預覽",
  };
}

function storageReady(settings: FileStorageSettings) {
  return settings.provider !== "demo_object_storage" && settings.verificationStatus === "verified";
}

function storageStatusLabel(settings: FileStorageSettings) {
  if (settings.verificationStatus === "verified") return "已驗證";
  if (settings.verificationStatus === "failed") return "失敗";
  return "待驗證";
}

function storageSummary(settings: FileStorageSettings) {
  return `${providerLabel(settings.provider)} · ${settings.maxFileSizeMb}MB · 保存 ${settings.retentionDays} 日 · URL ${settings.signedUrlTtlMinutes} 分鐘`;
}

function isExpiringSoon(document: EmployeeDocumentRow) {
  if (!document.expiresAt) return false;
  const days = (document.expiresAt.getTime() - Date.now()) / 86_400_000;
  return days >= 0 && days <= 30;
}

function documentTone(document: EmployeeDocumentRow) {
  if (document.malwareScanStatus === "blocked") return "danger";
  if (document.malwareScanStatus === "pending" || isExpiringSoon(document)) return "warning";
  return "ready";
}

function categoryLabel(category: string) {
  switch (category) {
    case "contract":
      return "契約/工作條件";
    case "certificate":
      return "證明文件";
    case "leave_attachment":
      return "請假附件";
    case "identity":
      return "身分文件";
    case "other":
      return "其他 HR 文件";
    default:
      return category;
  }
}

function providerLabel(provider: string) {
  switch (provider) {
    case "demo_object_storage":
      return "Demo 物件儲存";
    case "s3":
      return "Amazon S3";
    case "r2":
      return "Cloudflare R2";
    case "gcs":
      return "Google Cloud Storage";
    case "azure_blob":
      return "Azure Blob";
    case "custom":
      return "自訂儲存";
    default:
      return provider;
  }
}

function scanLabel(value: EmployeeDocumentRow["malwareScanStatus"]) {
  switch (value) {
    case "pending":
      return "待掃描";
    case "not_required":
      return "不需掃描";
    case "clean":
      return "已通過";
    case "blocked":
      return "已阻擋";
  }
}

function encryptionLabel(value: string) {
  if (value === "kms") return "KMS 金鑰";
  if (value === "provider_managed") return "供應商託管";
  return value;
}

function statusLabel(value: EmployeeDocumentRow["status"]) {
  return value === "archived" ? "已封存" : "啟用";
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "未設定";
}

function shortRef(id: string) {
  return id.slice(0, 8);
}

function localizeDocumentError(error: string) {
  if (error.includes("Employee is required")) return "請選擇員工。";
  if (error.includes("Employee not found")) return "找不到指定員工，請重新整理後再試。";
  if (error.includes("Category is required")) return "請選擇文件分類。";
  if (error.includes("Title is required")) return "請填寫文件標題。";
  if (error.includes("File name is required")) return "請填寫檔名。";
  if (error.includes("File size")) return "檔案大小必須大於 0，且不可超過公司儲存政策。";
  if (error.includes("File type is not allowed")) return "此 MIME 類型不在公司儲存政策允許清單內。";
  if (error.includes("Invalid expiry date")) return "到期日格式不正確。";
  if (error.includes("cannot")) return "目前角色沒有維護員工文件的權限。";
  return "文件 metadata 建立失敗，請確認欄位、儲存政策與權限後再試一次。";
}
