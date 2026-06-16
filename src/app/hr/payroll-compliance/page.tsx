import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getCompanyOverview } from "@/server/dashboard/queries";
import {
  getPayrollInsuranceGradeReadiness,
  listPayrollComplianceProfiles,
} from "@/server/payroll/compliance";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function PayrollCompliancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const [overview, rows] = await Promise.all([
    getCompanyOverview(),
    listPayrollComplianceProfiles(session),
  ]);
  const insuranceReadiness = await getPayrollInsuranceGradeReadiness(session, rows);

  if (!overview) {
    return (
      <main className="page">
        <EmptyState
          title="No seed data yet"
          body="Run the database migration and seed commands from README before editing payroll compliance profiles."
        />
      </main>
    );
  }

  const reviewCount = rows.filter((row) => row.profile.taxResidency === "non_resident" ||
    row.profile.healthInsuranceMonthlyWage ||
    row.profile.laborInsuranceMonthlyWage ||
    row.profile.laborPensionMonthlyWage).length;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Payroll Compliance</h1>
        <p>HR maintains employee-level tax residency, dependents, and insurance wage overrides before monthly close.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update payroll compliance</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Active employees</span>
          <strong>{rows.length}</strong>
          <span className="badge">{overview.company.name}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Profiles needing review</span>
          <strong>{reviewCount}</strong>
          <span className="badge warning">Before lock</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Audit coverage</span>
          <strong>100%</strong>
          <span className="badge">Sensitive updates</span>
        </div>
        <div className="panel span-12 risk-box">
          <div className="section-heading">
            <div>
              <h2>Insurance grade readiness</h2>
              <p className="muted">{insuranceReadiness.detail}</p>
            </div>
            <span className={`badge ${insuranceReadiness.ready ? "" : "danger"}`}>
              {insuranceReadiness.ready ? "Ready" : "Action needed"}
            </span>
          </div>
          {insuranceReadiness.issues.length ? (
            <ul className="task-list compact">
              {insuranceReadiness.issues.slice(0, 5).map((issue) => (
                <li className="task" key={`${issue.employeeId}-${issue.kind}`}>
                  <span>
                    <strong>
                      {issue.employeeNo} · {issue.employeeName}
                    </strong>
                    <small>{issue.message}</small>
                  </span>
                  <span className="badge danger">Min {formatMoney(issue.recommendedInsuredSalary)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Employee settings</h2>
              <p className="muted">Changes create a new effective profile and write an audit log.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <ul className="task-list">
            {rows.map((row) => (
              <li className="task payroll-compliance-task" key={row.employeeId}>
                  <div className="employee-profile-heading">
                  <span>
                    <strong>
                      {row.employeeNo} · {row.employeeName}
                    </strong>
                    <small>
                      {row.jobTitle} · effective {formatDate(row.profile.effectiveFrom)}
                    </small>
                  </span>
                  <span className={`badge ${row.profile.taxResidency === "non_resident" ? "warning" : ""}`}>
                    {row.profile.taxResidency === "non_resident" ? "Non-resident" : "Resident"}
                  </span>
                  </div>
                <ul className="task-list compact">
                  {insuranceReadiness.recommendations
                    .find((item) => item.employeeId === row.employeeId)
                    ?.items.map((item) => (
                      <li className="task" key={item.kind}>
                        <span>
                          <strong>{insuranceKindLabel(item.kind)}</strong>
                          <small>
                            recommended level {item.recommendedLevel} · {formatMoney(item.recommendedInsuredSalary)}
                            {item.overrideMonthlyWage ? ` · override ${formatMoney(item.overrideMonthlyWage)}` : " · rule grade"}
                          </small>
                        </span>
                        <span className={`badge ${item.ready ? "" : "danger"}`}>
                          {item.ready ? "Ready" : "Review"}
                        </span>
                      </li>
                    ))}
                </ul>
                <form action="/api/payroll/compliance/update" method="post" className="mini-form compact-form">
                  <input type="hidden" name="employeeId" value={row.employeeId} />
                  <div className="field-grid">
                    <label>
                      Tax residency
                      <select name="taxResidency" defaultValue={row.profile.taxResidency}>
                        <option value="resident">Resident</option>
                        <option value="non_resident">Non-resident</option>
                      </select>
                    </label>
                    <label>
                      Dependents
                      <input name="dependentCount" type="number" min="0" step="1" defaultValue={row.profile.dependentCount} />
                    </label>
                    <label>
                      Labor insurance wage
                      <input
                        name="laborInsuranceMonthlyWage"
                        type="number"
                        min="0"
                        placeholder="Rule grade"
                        defaultValue={row.profile.laborInsuranceMonthlyWage ?? ""}
                      />
                    </label>
                    <label>
                      NHI insured wage
                      <input
                        name="healthInsuranceMonthlyWage"
                        type="number"
                        min="0"
                        placeholder="Rule grade"
                        defaultValue={row.profile.healthInsuranceMonthlyWage ?? ""}
                      />
                    </label>
                    <label>
                      Pension wage
                      <input
                        name="laborPensionMonthlyWage"
                        type="number"
                        min="0"
                        placeholder="Rule grade"
                        defaultValue={row.profile.laborPensionMonthlyWage ?? ""}
                      />
                    </label>
                    <label>
                      Non-resident rate (%)
                      <input
                        name="nonResidentWithholdingRate"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue={
                          row.profile.nonResidentWithholdingRate === null ||
                          row.profile.nonResidentWithholdingRate === undefined
                            ? ""
                            : Number((row.profile.nonResidentWithholdingRate * 100).toFixed(2))
                        }
                      />
                    </label>
                  </div>
                  <div className="inline-actions">
                    <span className="muted">{methodLabel(row.profile.incomeTaxWithholdingMethod)}</span>
                    <button className="button primary" type="submit">
                      Save profile
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function methodLabel(method: string) {
  return method === "non_resident_flat" ? "Non-resident flat withholding" : "Annualized progressive estimate";
}

function insuranceKindLabel(kind: string) {
  if (kind === "health_insurance") return "NHI insured wage";
  if (kind === "labor_pension") return "Labor pension wage";
  return "Labor insurance wage";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
