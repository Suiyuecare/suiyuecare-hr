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
          <h1>我的薪資單</h1>
          <p>薪資單發布後，只能查看自己的薪資資料。</p>
        </section>

        {accessDenied ? (
          <section className="panel">
            <h2>無法查看薪資單</h2>
            <p className="muted">薪資單僅限本人或授權薪資人員查看。</p>
          </section>
        ) : !payslip ? (
          <section className="panel">
            <h2>尚無已發布薪資單</h2>
            <p className="muted">人資完成薪資鎖定並發布後，這裡會出現你的薪資單。</p>
          </section>
        ) : (
          <section className="panel payslip">
            <div className="section-heading">
              <div>
                <h2>{payslip.periodLabel}</h2>
                <p className="muted">{payslip.employeeName}</p>
              </div>
              <span className="badge">{labelPayslipStatus(payslip.status)}</span>
            </div>

            <div className="payroll-preview">
              <div className="metric">
                <span className="muted">應發</span>
                <strong>{formatMoney(payslip.grossPay)}</strong>
              </div>
              <div className="metric">
                <span className="muted">扣項</span>
                <strong>{formatMoney(payslip.deductions)}</strong>
              </div>
              <div className="metric">
                <span className="muted">實發</span>
                <strong>{formatMoney(payslip.netPay)}</strong>
              </div>
            </div>

            <ul className="task-list">
              {payslip.items.map((item) => (
                <li className="task" key={`${item.kind}-${item.code}`}>
                  <span>
                    <strong>{translatePayrollItemName(item.name)}</strong>
                    <small>{labelPayrollItemKind(item.kind)}</small>
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

      <nav className="bottom-nav" aria-label="員工手機導覽">
        <DashboardLink href="/app" label="首頁" />
        <DashboardLink href="/app/payslip" label="薪資單" />
        <DashboardLink href="/manager/inbox" label="簽核" />
        <DashboardLink href="/hr" label="人資" />
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

function labelPayrollItemKind(kind: string) {
  if (kind === "earning") return "給付";
  if (kind === "allowance") return "津貼";
  if (kind === "overtime") return "加班費";
  if (kind === "deduction") return "扣項";
  if (kind === "employer_contribution") return "雇主負擔";
  return kind;
}

function labelPayslipStatus(status: string) {
  if (status === "released") return "已發布";
  if (status === "draft") return "草稿";
  return status;
}

function translatePayrollItemName(name: string) {
  const labels: Record<string, string> = {
    "Base salary": "本薪",
    "Meal allowance": "伙食津貼",
    "Welfare deduction": "福利金扣款",
    "Overtime pay": "加班費",
    "Labor insurance": "勞保費",
    "National health insurance": "健保費",
    "Income tax withholding": "所得稅扣繳",
    "Labor pension employer contribution": "雇主提繳勞退",
    "Occupational accident insurance": "職災保險",
  };
  return labels[name] ?? name;
}
