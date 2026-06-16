import { getDemoSession } from "@/server/auth/demo-session";
import { getBetaPilotReadinessReport } from "@/server/readiness/beta-pilot";
import { getLaunchReadinessReport } from "@/server/readiness/launch";

export default async function LaunchReadinessPage() {
  const session = await getDemoSession();
  const report = await getLaunchReadinessReport(session);
  const betaPilot = await getBetaPilotReadinessReport(session, report);

  return (
    <main className="page">
      <section className="page-header">
        <h1>上線與試用準備度</h1>
        <p>把 HR One 從展示環境推進到 20-50 人、2 週可試用的客戶導入狀態。</p>
      </section>

      <section className="grid">
        <div className="panel span-3 metric">
          <span className="muted">Beta 試用</span>
          <strong>{betaPilot.readyForPilot ? "Ready" : "Not ready"}</strong>
          <span className={`badge ${betaPilot.readyForPilot ? "" : betaPilot.blockedCount ? "danger" : "warning"}`}>
            {betaPilot.trialDays} 天 / {betaPilot.targetEmployeeRange.min}-{betaPilot.targetEmployeeRange.max} 人
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Beta Ready</span>
          <strong>{betaPilot.readyCount}</strong>
          <span className="badge">checks</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Beta 待處理</span>
          <strong>{betaPilot.actionRequiredCount}</strong>
          <span className="badge warning">before trial</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Beta 阻擋</span>
          <strong>{betaPilot.blockedCount}</strong>
          <span className={`badge ${betaPilot.blockedCount > 0 ? "danger" : ""}`}>hard gate</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>2 週試用 Gate</h2>
              <p className="muted">
                目標是讓一家公司 20-50 人實際試用 2 週，完成打卡、請假、簽核、公告、HR 月結預演、薪資單查看，且不發生權限與敏感資料外洩。
              </p>
            </div>
            <span className={`badge ${betaPilot.readyForPilot ? "" : betaPilot.blockedCount ? "danger" : "warning"}`}>
              {betaPilot.readyForPilot ? "可開始試用" : "尚未可試用"}
            </span>
          </div>
          <ol className="close-steps">
            {betaPilot.phases.map((phase) => (
              <li key={phase.step} className={`close-step ${phase.status === "ready" ? "done" : phase.status}`}>
                <strong>
                  {phase.step}. {phase.title}
                </strong>
                <span>{phase.summary}</span>
                <a className="button" href={phase.actionHref}>
                  {phase.actionLabel}
                </a>
              </li>
            ))}
          </ol>
          <ul className="task-list">
            {betaPilot.items.map((item) => (
              <li className="task" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.area} · {item.detail}
                  </small>
                  <small>{item.nextStep}</small>
                </span>
                <span className="inline-actions">
                  <a className="button" href={item.actionHref}>
                    {item.actionLabel}
                  </a>
                  <span className={`badge ${badgeClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">Launch Ready</span>
          <strong>{report.readyCount}</strong>
          <span className="badge">checks</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Launch 待處理</span>
          <strong>{report.actionRequiredCount}</strong>
          <span className="badge warning">before launch</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Launch 阻擋</span>
          <strong>{report.blockedCount}</strong>
          <span className={`badge ${report.blockedCount > 0 ? "danger" : ""}`}>hard gate</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">正式販售</span>
          <strong>{report.readyForSale ? "Ready" : "Not ready"}</strong>
          <span className={`badge ${report.readyForSale ? "" : "warning"}`}>launch gate</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Production setup wizard</h2>
              <p className="muted">
                Beta 試用過關後，再依序清掉正式販售與 production tenant 的完整上線 gate。
              </p>
            </div>
            <span className="badge">Guided path</span>
          </div>
          <ol className="close-steps">
            {report.setupSteps.map((step) => (
              <li key={step.step} className={`close-step ${step.status === "ready" ? "done" : step.status}`}>
                <strong>
                  {step.step}. {step.title}
                </strong>
                <span>{step.summary}</span>
                <a className="button" href={step.actionHref}>
                  {step.actionLabel}
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Readiness checks</h2>
              <p className="muted">
                These checks focus on persistence, security, compliance governance, operational delivery, auditability, and KPI proof.
              </p>
            </div>
            <a className="button" href="/settings">
              Settings
            </a>
          </div>

          <ul className="task-list">
            {report.items.map((item) => (
              <li className="task" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.area} · {item.detail}
                  </small>
                  <small>{item.nextStep}</small>
                </span>
                <span className="inline-actions">
                  <a className="button" href={item.actionHref}>
                    {item.actionLabel}
                  </a>
                <span className={`badge ${badgeClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12" id="database-setup">
          <div className="section-heading">
            <div>
              <h2>Database setup path</h2>
              <p className="muted">
                Run these commands in a production-like environment with PostgreSQL before onboarding a customer tenant.
              </p>
            </div>
            <span className="badge">Required</span>
          </div>
          <ul className="task-list">
            <li className="task">
              <span>
                <strong>1. Apply migrations</strong>
                <small>pnpm db:migrate</small>
              </span>
              <span className="badge">Schema</span>
            </li>
            <li className="task">
              <span>
                <strong>2. Load baseline data</strong>
                <small>pnpm db:seed</small>
              </span>
              <span className="badge">Tenant</span>
            </li>
            <li className="task">
              <span>
                <strong>3. Provision customer foundation</strong>
                <small>pnpm db:provision:tenant -- --tenant-slug=&lt;customer-slug&gt; ...</small>
              </span>
              <span className="badge warning">Customer</span>
            </li>
            <li className="task">
              <span>
                <strong>4. Verify demo baseline</strong>
                <small>pnpm db:verify</small>
              </span>
              <span className="badge">Demo gate</span>
            </li>
            <li className="task">
              <span>
                <strong>5. Verify production tenant</strong>
                <small>pnpm db:verify:production -- --tenant-slug=&lt;customer-slug&gt;</small>
              </span>
              <span className="badge danger">Launch gate</span>
            </li>
          </ul>
        </section>
      </section>
    </main>
  );
}

function badgeClass(status: string) {
  if (status === "blocked") return "danger";
  if (status === "action_required") return "warning";
  return "";
}

function statusLabel(status: string) {
  if (status === "action_required") return "Action required";
  return status;
}
