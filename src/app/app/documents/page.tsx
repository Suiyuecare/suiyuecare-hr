import { DashboardLink } from "@/components/DashboardLink";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getOwnEmployeeDocuments } from "@/server/employees/documents";

export default async function EmployeeDocumentsPage() {
  const session = await getDemoSession();
  const documents = await getOwnEmployeeDocuments(session);

  return (
    <>
      <main className="page mobile-page">
        <section className="page-header">
          <h1>Documents</h1>
          <p>Documents released by HR for your own records.</p>
        </section>

        <section className="panel span-12">
          {documents.length === 0 ? (
            <EmptyState title="No documents" body="HR-released documents will appear here." />
          ) : (
            <ul className="task-list">
              {documents.map((document) => (
                <li className="task request-task" key={document.id}>
                  <span>
                    <strong>{document.title}</strong>
                    <small>{document.category} · {document.fileName}</small>
                    <small>{document.expiresAt ? `Expires ${formatDate(document.expiresAt)}` : "No expiry date"}</small>
                    <small>Scan {document.malwareScanStatus.replace("_", " ")} · download audited</small>
                  </span>
                  <span className={`badge ${document.malwareScanStatus === "pending" ? "warning" : ""}`}>
                    {document.malwareScanStatus === "pending" ? "Pending scan" : "Available"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <nav className="bottom-nav" aria-label="Employee mobile navigation">
        <DashboardLink href="/app" label="Home" />
        <DashboardLink href="/app/documents" label="Docs" />
        <DashboardLink href="/app/payslip" label="Payslip" />
        <DashboardLink href="/manager/inbox" label="Inbox" />
      </nav>
    </>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
