import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import { getPayrollAdjustmentWorkspace } from "@/server/payroll/adjustments";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function PayrollAdjustmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getPayrollAdjustmentWorkspace(session);

  if (!workspace.payrollRun) {
    return (
      <main className="page">
        <EmptyState
          title="No payroll run yet"
          body="Create, calculate, confirm, and lock payroll before applying adjustments."
        />
      </main>
    );
  }

  const canAdjust = workspace.payrollRun.status === "locked" || workspace.payrollRun.status === "released";
  const canApprove = hasPermission(session.role, "payroll_adjustment:approve");
  const pendingAdjustments = workspace.adjustments.filter((adjustment) => adjustment.status === "pending");

  return (
    <main className="page">
      <section className="page-header">
        <h1>Payroll Adjustments</h1>
        <p>Request and approve explicit post-lock corrections with audit logs. Locked payroll items are never changed silently.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to apply adjustment</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Payroll period</span>
          <strong>{workspace.payrollRun.periodLabel}</strong>
          <span className="badge">{workspace.payrollRun.status}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Applied adjustments</span>
          <strong>{workspace.adjustments.filter((adjustment) => adjustment.status === "applied").length}</strong>
          <span className="badge">Owner approved</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Mutation rule</span>
          <strong>{pendingAdjustments.length}</strong>
          <span className={`badge ${pendingAdjustments.length ? "warning" : ""}`}>Pending approval</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Request adjustment</h2>
              <p className="muted">Use positive amounts. Owner approval is required before pay items or payslips change.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <form action="/api/payroll/adjustments/apply" method="post" className="mini-form">
            <input type="hidden" name="payrollRunId" value={workspace.payrollRun.id} />
            <div className="field-grid">
              <label>
                Employee
                <select name="employeeId" required>
                  {workspace.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employeeNo} · {employee.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select name="kind" defaultValue="allowance">
                  <option value="allowance">Allowance</option>
                  <option value="deduction">Deduction</option>
                </select>
              </label>
              <label>
                Amount
                <input name="amount" type="number" min="1" step="1" required disabled={!canAdjust} />
              </label>
              <label>
                Reason
                <input name="reason" minLength={4} required disabled={!canAdjust} />
              </label>
            </div>
            <button className="button primary" type="submit" disabled={!canAdjust}>
              Submit for approval
            </button>
          </form>
        </section>

        {canApprove ? (
          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>Owner approval</h2>
                <p className="muted">Approving a pending request applies the payroll item and updates released payslips.</p>
              </div>
              <span className={`badge ${pendingAdjustments.length ? "warning" : ""}`}>
                {pendingAdjustments.length} pending
              </span>
            </div>
            {pendingAdjustments.length === 0 ? (
              <p className="muted">No payroll adjustments waiting for approval.</p>
            ) : (
              <ul className="task-list">
                {pendingAdjustments.map((adjustment) => (
                  <li className="task vertical-task" key={adjustment.id}>
                    <span>
                      <strong>
                        {adjustment.employeeName} · {adjustment.kind}
                      </strong>
                      <small>
                        {formatMoney(adjustment.amount)} · {adjustment.reason}
                      </small>
                    </span>
                    <form action="/api/payroll/adjustments/decision" method="post" className="decision-form">
                      <input type="hidden" name="adjustmentId" value={adjustment.id} />
                      <input name="comment" placeholder="Decision comment" />
                      <button className="button primary" type="submit" name="decision" value="approve">
                        Approve
                      </button>
                      <button className="button danger" type="submit" name="decision" value="reject">
                        Reject
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="panel span-12">
          <h2>Adjustment log</h2>
          {workspace.adjustments.length === 0 ? (
            <p className="muted">No adjustments applied.</p>
          ) : (
            <ul className="task-list">
              {workspace.adjustments.map((adjustment) => (
                <li className="task" key={adjustment.id}>
                  <span>
                    <strong>
                      {adjustment.employeeName} · {adjustment.kind}
                    </strong>
                    <small>
                      {adjustment.reason}
                      {adjustment.decisionComment ? ` · ${adjustment.decisionComment}` : ""}
                    </small>
                  </span>
                  <span className={`badge ${badgeClassForAdjustment(adjustment.status, adjustment.kind)}`}>
                    {adjustment.status} · {formatMoney(adjustment.amount)}
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

function badgeClassForAdjustment(status: string, kind: string) {
  if (status === "rejected") return "danger";
  if (status === "pending" || kind === "deduction") return "warning";
  return "";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
