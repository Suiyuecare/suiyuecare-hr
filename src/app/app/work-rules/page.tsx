import { getDemoSession } from "@/server/auth/session";
import { getWorkRulesWorkspace, type CompanyWorkRuleView } from "@/server/work-rules/service";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function EmployeeWorkRulesPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, success }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getWorkRulesWorkspace(session);
  const activeRules = workspace.rules.filter((rule) => rule.status === "active" && rule.acknowledgementRequired);
  const openRules = activeRules.filter((rule) => !hasAcknowledgement(rule, workspace.acknowledgements));
  const completedCount = activeRules.length - openRules.length;

  return (
    <main className="page mobile-page employee-work-rule-page">
      <section className="employee-hero employee-work-rule-hero" aria-label="公司規章確認">
        <div className="employee-hero-main">
          <div className="employee-hero-topline">
            <span className="muted">員工前台</span>
            <span className={`badge ${openRules.length ? "warning" : "done"}`}>
              {openRules.length ? `${openRules.length} 待確認` : "已完成"}
            </span>
          </div>
          <h1>公司規章</h1>
          <p>用手機確認目前有效的工作規則與員工手冊；確認後會留下 hash 證據，HR 不會在 audit log 儲存規章原文。</p>
          <div className="employee-hero-actions">
            <a className="button primary" href="#work-rule-today">
              查看待辦
            </a>
            <a className="button" href="/app">
              回首頁
            </a>
          </div>
        </div>
        <aside className="employee-hero-status">
          <small>今天要處理</small>
          <strong>{openRules.length ? "先確認新規章" : "目前沒有待辦"}</strong>
          <p>{openRules.length ? "閱讀摘要與來源後，一鍵確認即可完成。" : "你已完成目前需要確認的公司規章。"}</p>
        </aside>
      </section>

      {success ? (
        <section className="access-result-banner success-banner" aria-live="polite">
          <strong>規章確認已完成</strong>
          <p>系統已留下確認時間與 hash 證據，你可以回到首頁繼續其他任務。</p>
        </section>
      ) : null}

      {error ? (
        <section className="access-result-banner danger-panel" aria-live="polite">
          <strong>無法確認規章</strong>
          <p>{localizeWorkRuleError(error)}</p>
        </section>
      ) : null}

      <section className="grid" id="work-rule-today">
        <section className="panel span-12 today-card employee-work-rule-today">
          <div>
            <span className="muted">待確認規章</span>
            <h2>{openRules.length}</h2>
            <p className="muted">
              已完成 {completedCount}/{activeRules.length} 份。常見任務三步內完成：看摘要、確認來源、按下確認。
            </p>
          </div>
          <span className={`badge ${openRules.length ? "warning" : "done"}`}>
            {openRules.length ? "待處理" : "完成"}
          </span>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <span className="muted">目前有效版本</span>
              <h2>需要你確認的規章</h2>
              <p className="muted">公司規章原文由 HR 文件庫或來源連結管理，這裡顯示摘要、版本、來源與確認按鈕。</p>
            </div>
            <span className="badge">{activeRules.length} 份</span>
          </div>
          <div className="employee-work-rule-list">
            {activeRules.length === 0 ? (
              <div className="empty-card">
                <strong>目前沒有需要確認的規章</strong>
                <p className="muted">若 HR 發布新版本，會出現在這裡。</p>
              </div>
            ) : null}
            {activeRules.map((rule) => {
              const acknowledgement = workspace.acknowledgements.find(
                (item) => item.workRuleId === rule.id && item.version === rule.version,
              );
              return (
                <article className={`employee-work-rule-card ${acknowledgement ? "done" : "warning"}`} key={rule.id}>
                  <div className="employee-work-rule-card-head">
                    <div>
                      <span className="muted">{rule.category}</span>
                      <h3>{rule.title}</h3>
                    </div>
                    <span className={`badge ${acknowledgement ? "done" : "warning"}`}>
                      {acknowledgement ? "已確認" : "待確認"}
                    </span>
                  </div>
                  <p>{rule.summary}</p>
                  <dl className="access-fact-grid">
                    <div>
                      <dt>版本</dt>
                      <dd>{rule.version}</dd>
                    </div>
                    <div>
                      <dt>生效日</dt>
                      <dd>{rule.effectiveFrom.toLocaleDateString("zh-TW")}</dd>
                    </div>
                    <div>
                      <dt>來源</dt>
                      <dd>{rule.sourceRef ?? "請洽 HR"}</dd>
                    </div>
                    <div>
                      <dt>內容 hash</dt>
                      <dd>{rule.contentHash.slice(0, 12)}</dd>
                    </div>
                  </dl>
                  {acknowledgement ? (
                    <p className="employee-work-rule-proof">
                      已於 {acknowledgement.acknowledgedAt.toLocaleDateString("zh-TW")} 確認 · hash{" "}
                      {acknowledgement.acknowledgementHash.slice(0, 12)}
                    </p>
                  ) : (
                    <form action="/api/work-rules" method="post" aria-label={`確認 ${rule.title}`}>
                      <input type="hidden" name="intent" value="acknowledge" />
                      <input type="hidden" name="workRuleId" value={rule.id} />
                      <button className="button primary" type="submit">
                        我已閱讀並確認
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

function hasAcknowledgement(
  rule: CompanyWorkRuleView,
  acknowledgements: Awaited<ReturnType<typeof getWorkRulesWorkspace>>["acknowledgements"],
) {
  return acknowledgements.some((item) => item.workRuleId === rule.id && item.version === rule.version);
}

function localizeWorkRuleError(error: string) {
  if (/employee context/i.test(error)) return "需要員工身分才能確認公司規章，請切換到員工角色後再試一次。";
  if (/not found/i.test(error)) return "這份規章目前不是可確認狀態，請重新整理或洽 HR。";
  return "請重新整理後再確認一次。";
}
