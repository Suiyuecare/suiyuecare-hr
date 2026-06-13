import { DashboardLink } from "@/components/DashboardLink";
import { getDemoSession } from "@/server/auth/demo-session";
import { getOwnPayslip } from "@/server/payroll/service";

export default async function PayslipPage() {
  const session = await getDemoSession();
  const { payslip, accessDenied } = await safeGetOwnPayslip(session);

  return (
    <>
      <main className="page mobile-page">
        <section className="page-header">
          <h1>Payslip</h1>
          <p>Only your own released payslip is visible here.</p>
        </section>

        {accessDenied ? (
          <section className="panel">
            <h2>Access denied</h2>
            <p className="muted">Payslip access is limited to your own employee role or authorized payroll staff.</p>
          </section>
        ) : !payslip ? (
          <section className="panel">
            <h2>No released payslip</h2>
            <p className="muted">Payslips appear after HR locks payroll and releases them.</p>
          </section>
        ) : (
          <section className="panel payslip">
            <div className="section-heading">
              <div>
                <h2>{payslip.periodLabel}</h2>
                <p className="muted">{payslip.employeeName}</p>
              </div>
              <span className="badge">{payslip.status}</span>
            </div>

            <div className="payroll-preview">
              <div className="metric">
                <span className="muted">Gross</span>
                <strong>{formatMoney(payslip.grossPay)}</strong>
              </div>
              <div className="metric">
                <span className="muted">Deductions</span>
                <strong>{formatMoney(payslip.deductions)}</strong>
              </div>
              <div className="metric">
                <span className="muted">Net</span>
                <strong>{formatMoney(payslip.netPay)}</strong>
              </div>
            </div>

            <ul className="task-list">
              {payslip.items.map((item) => (
                <li className="task" key={`${item.kind}-${item.code}`}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.kind}</small>
                  </span>
                  <span className={`badge ${item.kind === "deduction" ? "warning" : ""}`}>
                    {formatMoney(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Employee mobile navigation">
        <DashboardLink href="/app" label="Home" />
        <DashboardLink href="/app/payslip" label="Payslip" />
        <DashboardLink href="/manager/inbox" label="Inbox" />
        <DashboardLink href="/hr" label="HR" />
      </nav>
    </>
  );
}

async function safeGetOwnPayslip(session: Awaited<ReturnType<typeof getDemoSession>>) {
  try {
    return {
      payslip: await getOwnPayslip(session),
      accessDenied: false,
    };
  } catch {
    return {
      payslip: null,
      accessDenied: true,
    };
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
