import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getCompanyOverview } from "@/server/dashboard/queries";
import { getStatutoryInsuranceWorkspace, statutoryInsuranceTypes } from "@/server/insurance/statutory";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function StatutoryInsurancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const [overview, workspace] = await Promise.all([
    getCompanyOverview(),
    getStatutoryInsuranceWorkspace(session),
  ]);
  const { records, readiness } = workspace;

  if (!overview) {
    return (
      <main className="page">
        <EmptyState title="No seed data yet" body="Run the database migration and seed commands before reviewing insurance." />
      </main>
    );
  }

  const grouped = groupByEmployee(records);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Statutory Insurance</h1>
        <p>Track Taiwan labor, employment, occupational accident, NHI, and labor pension enrollment evidence.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update insurance</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Ready records</span>
          <strong>{readiness.readyCount}</strong>
          <span className="badge">{readiness.total} total</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Pending</span>
          <strong>{readiness.pendingCount}</strong>
          <span className={`badge ${readiness.pendingCount ? "warning" : ""}`}>HR action</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Overdue</span>
          <strong>{readiness.overdueCount}</strong>
          <span className={`badge ${readiness.overdueCount ? "danger" : ""}`}>due dates</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Production gate</span>
          <strong>{readiness.ready ? "Ready" : "Blocked"}</strong>
          <span className={`badge ${readiness.ready ? "" : "danger"}`}>insurance</span>
        </div>

        <section className={`panel span-12 risk-box ${readiness.ready ? "success-box" : "danger-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{readiness.ready ? "Insurance evidence ready" : "Insurance evidence gaps"}</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <a className="button" href="/hr/onboarding-readiness">
              Onboarding gate
            </a>
          </div>
          {readiness.missing.length ? (
            <ul className="task-list compact">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge danger">Required</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Employee insurance tasks</h2>
              <p className="muted">Keep raw portal receipts and private notes outside logs; this app stores hashes and status evidence.</p>
            </div>
            <span className="badge">Audited</span>
          </div>

          <ul className="task-list">
            {grouped.map((group) => (
              <li className="task payroll-compliance-task" key={group.employeeId}>
                <div className="employee-profile-heading">
                  <span>
                    <strong>
                      {group.employeeNo} · {group.employeeName}
                    </strong>
                    <small>
                      {group.readyCount}/{statutoryInsuranceTypes.length} ready · {group.overdueCount} overdue
                    </small>
                  </span>
                  <span className={`badge ${group.overdueCount ? "danger" : group.ready ? "" : "warning"}`}>
                    {group.ready ? "Ready" : group.overdueCount ? "Overdue" : "Pending"}
                  </span>
                </div>

                <ul className="task-list compact">
                  {group.records.map((record) => (
                    <li className="task" key={record.id}>
                      <span>
                        <strong>{insuranceLabel(record.insuranceType)}</strong>
                        <small>
                          Due {formatDate(record.dueDate)} · {record.daysUntilDue >= 0 ? `${record.daysUntilDue} day(s)` : `${Math.abs(record.daysUntilDue)} day(s) late`}
                          {record.evidenceHash ? ` · evidence ${record.evidenceHash.slice(0, 10)}` : ""}
                        </small>
                      </span>
                      <span className={`badge ${record.overdue ? "danger" : record.status === "pending" ? "warning" : ""}`}>
                        {record.overdue ? "overdue" : record.status}
                      </span>
                    </li>
                  ))}
                </ul>

                <form action="/api/insurance/statutory" method="post" className="mini-form compact-form">
                  <input type="hidden" name="employeeId" value={group.employeeId} />
                  <div className="field-grid">
                    <label>
                      Insurance item
                      <select name="insuranceType" defaultValue={group.nextRecord?.insuranceType ?? "labor_insurance"}>
                        {statutoryInsuranceTypes.map((type) => (
                          <option value={type} key={type}>
                            {insuranceLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Status
                      <select name="status" defaultValue="enrolled">
                        <option value="enrolled">Enrolled</option>
                        <option value="exempt">Exempt</option>
                        <option value="withdrawn">Withdrawn</option>
                        <option value="pending">Pending</option>
                      </select>
                    </label>
                    <label>
                      Effective date
                      <input name="effectiveDate" type="date" defaultValue={formatDateInput(new Date())} />
                    </label>
                    <label>
                      Evidence reference
                      <input name="evidenceRef" placeholder="portal receipt or case id" />
                    </label>
                    <label>
                      Exemption reason
                      <input name="exemptionReason" placeholder="Only if exempt" />
                    </label>
                    <label>
                      Private note hash source
                      <input name="notes" placeholder="Will be hashed, not shown in audit" />
                    </label>
                  </div>
                  <button className="button primary" type="submit">
                    Save insurance evidence
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function groupByEmployee(records: Awaited<ReturnType<typeof getStatutoryInsuranceWorkspace>>["records"]) {
  const groups = new Map<string, {
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    records: typeof records;
  }>();
  for (const record of records) {
    const group = groups.get(record.employeeId) ?? {
      employeeId: record.employeeId,
      employeeNo: record.employeeNo,
      employeeName: record.employeeName,
      records: [],
    };
    group.records.push(record);
    groups.set(record.employeeId, group);
  }
  return Array.from(groups.values()).map((group) => {
    const readyRecords = group.records.filter((record) => record.status !== "pending");
    const overdueRecords = group.records.filter((record) => record.overdue);
    return {
      ...group,
      records: group.records.sort((a, b) => a.insuranceType.localeCompare(b.insuranceType)),
      ready: readyRecords.length === statutoryInsuranceTypes.length && overdueRecords.length === 0,
      readyCount: readyRecords.length,
      overdueCount: overdueRecords.length,
      nextRecord: group.records.find((record) => record.status === "pending") ?? group.records[0],
    };
  });
}

function insuranceLabel(type: string) {
  if (type === "employment_insurance") return "Employment insurance";
  if (type === "occupational_accident_insurance") return "Occupational accident insurance";
  if (type === "national_health_insurance") return "National health insurance";
  if (type === "labor_pension") return "Labor pension";
  return "Labor insurance";
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
