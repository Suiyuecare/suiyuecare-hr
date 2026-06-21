import Link from "next/link";
import { getPolicyDocuments } from "@/server/ai/policy-docs";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";

type SearchParams = Promise<{ error?: string }>;

export default async function PolicySourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "ai:form_builder")) {
    return <UnauthorizedPolicySources />;
  }

  const docs = await getPolicyDocuments(session);
  const approvedCount = docs.filter((doc) => doc.status === "approved").length;
  const draftCount = docs.filter((doc) => doc.status === "draft").length;
  const inactiveCount = docs.filter((doc) => doc.status === "inactive").length;
  const sourceHealth = approvedCount ? "可供 AI 引用" : "待補核准來源";

  return (
    <main className="page ai-policy-source-page">
      <section className="settings-control-hero ai-policy-source-hero" aria-label="AI 政策來源庫">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="badge">AI 來源治理</span>
            <span className={`badge ${approvedCount ? "done" : "warning"}`}>{sourceHealth}</span>
          </div>
          <h1>政策來源庫</h1>
          <p>
            管理 AI Copilot 可引用的公司政策摘錄。只有「已核准」來源會進入政策 Q&A；草稿、停用或含敏感個資的內容都不應提供給 AI。
          </p>
          <div className="settings-control-hero-actions">
            <Link className="button primary" href="#policy-source-wizard">
              新增來源
            </Link>
            <Link className="button" href="/hr/copilot">
              回 AI Copilot
            </Link>
            <Link className="button" href="/settings/law-rules">
              法規規則
            </Link>
          </div>
        </div>
        <aside className={`settings-control-focus ${approvedCount ? "ready" : "warning"}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{approvedCount ? "維持來源新鮮度" : "先補一筆核准來源"}</strong>
          <p>
            {approvedCount
              ? `目前有 ${approvedCount} 筆核准來源可引用；請定期確認版本、關鍵字與來源編號。`
              : "政策 Q&A 沒有核准來源時，Copilot 必須回覆證據不足。"}
          </p>
          <small>不要把身分證、薪資、銀行帳號、健康資料或私人備註貼進來源摘錄。</small>
          <Link className="button primary" href="#policy-source-wizard">
            補來源
          </Link>
        </aside>
      </section>

      {params.error ? (
        <div className="panel risk-box danger-box ai-copilot-error" role="alert">
          <strong>政策來源儲存失敗</strong>
          <p>{params.error}</p>
        </div>
      ) : null}

      <section className="settings-signal-board ai-policy-source-signal-board" aria-label="政策來源訊號板">
        <article className={`settings-signal-card ${approvedCount ? "done" : "warning"}`}>
          <span>已核准</span>
          <strong>{approvedCount}</strong>
          <small>只有這些摘錄會被 AI 政策問答引用。</small>
        </article>
        <article className={`settings-signal-card ${draftCount ? "warning" : "done"}`}>
          <span>草稿</span>
          <strong>{draftCount}</strong>
          <small>草稿不進 AI answer context，需 HR 複核後才可核准。</small>
        </article>
        <article className="settings-signal-card">
          <span>停用</span>
          <strong>{inactiveCount}</strong>
          <small>停用來源保留治理紀錄，但排除在政策問答之外。</small>
        </article>
        <article className="settings-signal-card warning">
          <span>安全規則</span>
          <strong>不貼敏感資料</strong>
          <small>來源摘錄只放政策文字與規則摘要，不放員工個資或薪資資料。</small>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-5 ai-policy-source-wizard" id="policy-source-wizard">
          <div className="section-heading">
            <div>
              <span className="muted">三步來源精靈</span>
              <h2>新增政策來源</h2>
              <p className="muted">用短摘錄、版本與關鍵字管理 AI 可引用內容；預設先存為草稿。</p>
            </div>
          </div>
          <form action="/api/ai/policy-documents" method="post" className="wizard-form" aria-label="政策來源精靈">
            <fieldset>
              <legend>1. 來源基本資料</legend>
              <label>
                標題
                <input name="title" placeholder="特休政策手冊 v2" required />
              </label>
              <div className="field-grid">
                <label>
                  類別
                  <input name="category" placeholder="請假 / 出勤 / 薪資規則" required />
                </label>
                <label>
                  版本
                  <input name="version" placeholder="v2" defaultValue="v1" />
                </label>
                <label>
                  狀態
                  <select name="status" defaultValue="draft">
                    <option value="draft">草稿</option>
                    <option value="approved">已核准</option>
                    <option value="inactive">停用</option>
                  </select>
                </label>
                <label>
                  來源編號
                  <input name="sourceRef" placeholder="handbook://leave/v2" />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>2. AI 檢索線索</legend>
              <label>
                關鍵字
                <input name="keywords" placeholder="特休, annual leave, 請假" required />
              </label>
              <label>
                核准摘錄
                <textarea
                  name="excerpt"
                  placeholder="放入可公開給 HR Copilot 引用的短政策摘錄，不包含個資、薪資、銀行或健康資料。"
                  required
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>3. 安全確認</legend>
              <p className="muted">儲存後會寫入 audit log；只有已核准來源會被 Copilot 引用。</p>
              <button className="button primary" type="submit">
                儲存政策來源
              </button>
            </fieldset>
          </form>
        </section>

        <section className="panel span-7 ai-policy-source-library">
          <div className="section-heading">
            <div>
              <span className="muted">來源清單</span>
              <h2>Copilot 可引用資料</h2>
              <p className="muted">用狀態、版本、關鍵字與摘錄檢查 AI 回答依據。</p>
            </div>
            <Link className="button" href="/hr/copilot">
              測試問答
            </Link>
          </div>
          <ul className="task-list">
            {docs.map((doc) => (
              <li className="task request-task ai-policy-source-item" key={doc.id}>
                <span>
                  <strong>{doc.title}</strong>
                  <small>
                    {doc.category} · {doc.version} · {doc.keywords.join(", ")}
                  </small>
                  <small>{doc.excerpt}</small>
                </span>
                <span className={`badge ${doc.status === "draft" ? "warning" : doc.status === "inactive" ? "danger" : "done"}`}>
                  {policyStatusLabel(doc.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function UnauthorizedPolicySources() {
  return (
    <main className="page ai-policy-source-page">
      <section className="settings-control-hero ai-policy-source-hero" aria-label="AI 政策來源庫">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="badge">AI 來源治理</span>
            <span className="badge danger">權限不足</span>
          </div>
          <h1>政策來源庫</h1>
          <p>政策來源會影響 AI 回答內容，只有 HR/Owner 可以新增、核准或停用來源摘錄。</p>
          <div className="settings-control-hero-actions">
            <Link className="button primary" href="/app">
              回員工前台
            </Link>
            <Link className="button" href="/console">
              切換後台角色
            </Link>
          </div>
        </div>
        <aside className="settings-control-focus danger" aria-label="今日先處理">
          <span className="badge">資料保護</span>
          <strong>來源庫已保護</strong>
          <p>未授權角色不能管理 Copilot 引用來源。</p>
          <small>請切換為人資管理員或 Owner 後再操作。</small>
        </aside>
      </section>
    </main>
  );
}

function policyStatusLabel(status: string) {
  if (status === "approved") return "已核准";
  if (status === "inactive") return "停用";
  return "草稿";
}
