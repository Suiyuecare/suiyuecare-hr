import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getEmployeeDocumentWorkspace } from "@/server/employees/documents";

type SearchParams = Promise<{ error?: string }>;

export default async function HrDocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getEmployeeDocumentWorkspace(session);
  const visibleCount = workspace.documents.filter((document) => document.visibleToEmployee).length;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Employee Documents</h1>
        <p>Register employee document metadata with payroll-grade access controls and audit logs.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to create document</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Documents</span>
          <strong>{workspace.documents.length}</strong>
          <span className="badge">Metadata vault</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Employee visible</span>
          <strong>{visibleCount}</strong>
          <span className="badge">Self-service</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Storage mode</span>
          <strong>{workspace.storageSettings.provider}</strong>
          <span className={`badge ${workspace.storageSettings.provider === "demo_object_storage" ? "warning" : ""}`}>
            {workspace.storageSettings.bucketName}
          </span>
        </div>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Add document</h2>
              <p className="muted">This reserves object metadata in the configured storage vault. File bytes are never stored in the database.</p>
            </div>
          </div>
          <form action="/api/employees/documents" method="post" className="wizard-form" aria-label="Create employee document">
            <label>
              Employee
              <select name="employeeId" required>
                {workspace.employees.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.employeeNo} · {employee.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select name="category" required>
                <option value="contract">Contract</option>
                <option value="certificate">Certificate</option>
                <option value="leave_attachment">Leave attachment</option>
                <option value="identity">Identity document</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Title
              <input name="title" placeholder="Employment contract" required />
            </label>
            <div className="field-grid">
              <label>
                File name
                <input name="fileName" placeholder="contract.pdf" required />
              </label>
              <label>
                MIME type
                <input name="mimeType" defaultValue="application/pdf" required />
              </label>
            </div>
            <div className="field-grid">
              <label>
                File size bytes
                <input name="fileSizeBytes" type="number" min="1" defaultValue="120000" required />
              </label>
              <label>
                Expires at
                <input name="expiresAt" type="date" />
              </label>
            </div>
            <label className="check-row">
              <input name="visibleToEmployee" type="checkbox" />
              Visible to employee
            </label>
            <button className="button primary" type="submit">
              Save document metadata
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <h2>Recent documents</h2>
          {workspace.documents.length === 0 ? (
            <EmptyState title="No employee documents" body="Register contracts, certificates, and HR attachments here." />
          ) : (
            <ul className="task-list">
              {workspace.documents.map((document) => (
                <li className="task request-task" key={document.id}>
                  <span>
                    <strong>{document.employeeName} · {document.title}</strong>
                    <small>{document.category} · {document.fileName} · {formatBytes(document.fileSizeBytes)}</small>
                    <small>
                      {document.visibleToEmployee ? "Visible to employee" : "HR only"} · {document.storageProvider} · {document.objectKey}
                    </small>
                    <small>
                      Scan {scanLabel(document.malwareScanStatus)} · encryption {document.encryptionMode} · retention {formatDate(document.retentionUntil)}
                    </small>
                  </span>
                  <span className="badge">{document.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "not set";
}

function scanLabel(value: string) {
  return value.replace("_", " ");
}
