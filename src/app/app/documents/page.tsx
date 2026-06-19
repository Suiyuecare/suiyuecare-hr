import { DashboardLink } from "@/components/DashboardLink";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getOwnEmployeeDocuments, type EmployeeDocumentRow } from "@/server/employees/documents";

export default async function EmployeeDocumentsPage() {
  const session = await getDemoSession();
  const documents = await getOwnEmployeeDocuments(session);
  const pendingCount = documents.filter((document) => document.malwareScanStatus === "pending").length;

  return (
    <>
      <main className="page mobile-page employee-documents-page">
        <section className="employee-documents-hero" aria-label="我的文件">
          <span className="badge">我的文件</span>
          <h1>HR 釋出的文件</h1>
          <p>這裡只顯示你自己的文件。若文件仍在掃描或已過期，請等 HR 完成複核後再查看。</p>
        </section>

        <section className="employee-terms-today ready" aria-label="文件狀態">
          <span>
            <small>目前可見文件</small>
            <strong>{documents.length} 份</strong>
            <p>{pendingCount ? `${pendingCount} 份仍在掃描中，暫不提供正式下載。` : "已釋出文件會顯示掃描、到期與下載稽核狀態。"}</p>
          </span>
          <span className={`badge ${pendingCount ? "warning" : "done"}`}>
            {pendingCount ? "待掃描" : "可查看"}
          </span>
        </section>

        <section className="employee-documents-section">
          <div className="section-heading">
            <div>
              <h2>文件清單</h2>
              <p className="muted">下載功能接上正式儲存後，系統會記錄下載稽核，不顯示內部物件路徑。</p>
            </div>
          </div>
          {documents.length === 0 ? (
            <EmptyState title="尚無文件" body="HR 釋出的在職證明、契約或其他文件會出現在這裡。" />
          ) : (
            <ul className="employee-documents-list">
              {documents.map((document) => (
                <li className={`employee-documents-card ${documentTone(document)}`} key={document.id}>
                  <div className="employee-documents-card-heading">
                    <span>
                      <strong>{document.title}</strong>
                      <small>
                        {categoryLabel(document.category)} · {document.fileName}
                      </small>
                    </span>
                    <span className={`badge ${document.malwareScanStatus === "pending" ? "warning" : "done"}`}>
                      {document.malwareScanStatus === "pending" ? "掃描中" : "可查看"}
                    </span>
                  </div>
                  <small>{document.expiresAt ? `到期日 ${formatDate(document.expiresAt)}` : "沒有設定到期日"}</small>
                  <small>掃描 {scanLabel(document.malwareScanStatus)} · 下載會寫入稽核紀錄</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <nav className="bottom-nav" aria-label="員工手機導覽">
        <DashboardLink href="/app" label="首頁" />
        <DashboardLink href="/app/documents" label="文件" />
        <DashboardLink href="/app/payslip" label="薪資單" />
        <DashboardLink href="/manager/inbox" label="簽核" />
      </nav>
    </>
  );
}

function documentTone(document: EmployeeDocumentRow) {
  return document.malwareScanStatus === "pending" ? "warning" : "ready";
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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
