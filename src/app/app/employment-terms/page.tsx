import { DashboardLink } from "@/components/DashboardLink";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getOwnEmploymentTerms, type EmploymentTermView } from "@/server/employees/employment-terms";

type SearchParams = Promise<{ error?: string }>;

export default async function EmployeeEmploymentTermsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const terms = await getOwnEmploymentTerms(session);
  const pending = terms.filter((term) => term.acknowledgementRequired && !term.acknowledgedAt);
  const nextTerm = pending[0] ?? terms[0];

  return (
    <>
      <main className="page mobile-page employee-terms-page">
        <section className="employee-terms-hero" aria-label="我的工作條件">
          <div>
            <span className="badge">員工前台</span>
            <h1>我的工作條件</h1>
            <p>確認目前有效的工作地點、工時、給薪日、福利與公司條款版本。</p>
          </div>
          <span className={`badge ${pending.length ? "warning" : "done"}`}>
            {pending.length ? "待確認" : "已完成"}
          </span>
        </section>

        {error ? (
          <section className="employee-terms-alerts" aria-live="polite">
            <div className="panel danger-panel">
              <strong>工作條件未確認</strong>
              <p>{localizeEmploymentTermsError(error)}</p>
            </div>
          </section>
        ) : null}

        <section className={`employee-terms-today ${pending.length ? "warning" : "ready"}`} aria-label="今日工作條件任務">
          <div>
            <span>今日任務</span>
            <strong>{pending.length ? "請確認新版工作條件" : "目前沒有待確認條款"}</strong>
            <p>
              {nextTerm
                ? `${nextTerm.version} · ${nextTerm.jobTitle} · 生效 ${formatDate(nextTerm.effectiveFrom)}`
                : "HR 發布後，工作條件會出現在這裡。"}
            </p>
          </div>
          <small>{pending.length ? `${pending.length} 筆待確認` : `${terms.length} 筆有效版本`}</small>
        </section>

        <section className="employee-terms-section">
          <div className="section-heading">
            <div>
              <h2>有效版本</h2>
              <p className="muted">薪資明細不在這裡顯示；本頁只顯示必要工作條件與版本證據。</p>
            </div>
            <span className="badge">{terms.length}</span>
          </div>
          {terms.length === 0 ? (
            <EmptyState title="尚無工作條件" body="HR 發布有效條款後，這裡會顯示待確認任務。" />
          ) : (
            <ul className="employee-terms-list">
              {terms.map((term) => (
                <li className={`employee-terms-card ${term.acknowledgedAt ? "ready" : "warning"}`} key={term.id}>
                  <div className="employee-terms-card-heading">
                    <span>
                      <strong>{term.jobTitle}</strong>
                      <small>{term.version} · 生效 {formatDate(term.effectiveFrom)}</small>
                    </span>
                    <span className={`badge ${term.acknowledgedAt ? "done" : "warning"}`}>
                      {term.acknowledgedAt ? "已確認" : "待確認"}
                    </span>
                  </div>
                  <div className="employee-terms-detail-list" aria-label={`${term.version} 工作條件摘要`}>
                    <span>
                      <strong>工作地點</strong>
                      <small>{term.workLocation}</small>
                    </span>
                    <span>
                      <strong>工時與休假</strong>
                      <small>{term.regularWorkSchedule}</small>
                    </span>
                    <span>
                      <strong>給薪日</strong>
                      <small>{term.wagePaymentDay}</small>
                    </span>
                    <span>
                      <strong>福利</strong>
                      <small>{term.benefitsSummary}</small>
                    </span>
                    <span>
                      <strong>薪資摘要 hash</strong>
                      <small>{shortHash(term.wageBasisSummaryHash)}</small>
                    </span>
                    <span>
                      <strong>來源</strong>
                      <small>{term.sourceRef ?? "HR 尚未設定來源"}</small>
                    </span>
                  </div>
                  {term.acknowledgedAt ? (
                    <p className="employee-terms-confirmed">已於 {formatDate(term.acknowledgedAt)} 確認。</p>
                  ) : (
                    <form action="/api/employees/employment-terms" method="post" className="employee-terms-action">
                      <input type="hidden" name="intent" value="acknowledge" />
                      <input type="hidden" name="termId" value={term.id} />
                      <button className="button primary" type="submit">
                        我已閱讀並確認
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <nav className="bottom-nav" aria-label="員工手機導覽">
        <DashboardLink href="/app" label="首頁" />
        <DashboardLink href="/app/employment-terms" label="工作條件" />
        <DashboardLink href="/app/documents" label="文件" />
        <DashboardLink href="/app/payslip" label="薪資單" />
        <DashboardLink href="/manager/inbox" label="Inbox" />
      </nav>
    </>
  );
}

function shortHash(value: string | null) {
  return value ? value.slice(0, 12) : "缺";
}

function formatDate(date: EmploymentTermView["effectiveFrom"] | null) {
  return date ? date.toISOString().slice(0, 10) : "未設定";
}

function localizeEmploymentTermsError(error: string) {
  if (error.includes("employment_terms:self") || error.includes("permission")) return "目前角色無法確認工作條件，請切回員工身分。";
  if (error.includes("not found")) return "找不到這筆工作條件，請重新整理後再試。";
  return error;
}
