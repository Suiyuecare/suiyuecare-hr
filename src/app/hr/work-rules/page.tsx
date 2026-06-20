import { getDemoSession } from "@/server/auth/session";
import {
  article70WorkRuleItems,
  getWorkRulesWorkspace,
  type CompanyWorkRuleView,
  type WorkRuleReadiness,
} from "@/server/work-rules/service";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function WorkRulesPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, success }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getWorkRulesWorkspace(session);
  const { readiness } = workspace;
  const today = new Date().toISOString().slice(0, 10);
  const focus = buildWorkRuleFocus(readiness);
  const pendingRules = workspace.rules.filter((rule) => rule.reviewStatus !== "approved");
  const acknowledgementRate =
    readiness.requiredAcknowledgementCount > 0
      ? Math.round((readiness.acknowledgedCount / readiness.requiredAcknowledgementCount) * 100)
      : 100;

  return (
    <main className="page work-rule-page">
      <section className="hr-monthly-hero work-rule-hero" aria-label="工作規則管理工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="muted">公司管理 · 工作規則</span>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "可上線" : "需處理"}
            </span>
          </div>
          <h1>工作規則與公司規章</h1>
          <p>
            讓 HR 不用工程支援就能發布員工手冊、工作規則與政策版本；系統只保存來源、摘要與內容 hash，員工在手機端一鍵確認並留下 audit 證據。
          </p>
          <div className="hr-monthly-hero-actions">
            <a className="button primary" href="#work-rule-wizard">
              建立規章
            </a>
            <a className="button" href="#article-70">
              檢查第 70 條
            </a>
            <a className="button" href="/app/work-rules">
              員工端預覽
            </a>
          </div>
        </div>
        <aside className={`hr-monthly-hero-focus ${focus.tone}`}>
          <span>{focus.label}</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <div className="hr-monthly-focus-footer">
            <a className="button primary" href={focus.href}>
              {focus.action}
            </a>
          </div>
        </aside>
      </section>

      {success ? (
        <section className="access-result-banner success-banner" aria-live="polite">
          <strong>{successMessage(success)}</strong>
          <p>已寫入 audit log；內容本文不回顯、不進 audit metadata，只保留 content hash 與來源參照。</p>
        </section>
      ) : null}

      {error ? (
        <section className="access-result-banner danger-panel" aria-live="polite">
          <strong>無法更新工作規則</strong>
          <p>{localizeWorkRuleError(error)}</p>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board work-rule-signal-board" aria-label="工作規則訊號板">
        <a className={`hr-monthly-signal-card ${readiness.ready ? "done" : "warning"}`} href="#work-rule-readiness">
          <span>上線狀態</span>
          <strong>{readiness.ready ? "Ready" : "Open"}</strong>
          <small>{readiness.detail}</small>
        </a>
        <a className={`hr-monthly-signal-card ${readiness.article70MissingItems.length ? "warning" : "done"}`} href="#article-70">
          <span>勞基法第 70 條</span>
          <strong>
            {readiness.article70CoveredCount}/{readiness.article70RequiredCount}
          </strong>
          <small>{readiness.article70Required ? "30 人以上公司需完整維護工作規則項目。" : "未達 30 人仍建議先建立可揭示規章。"}</small>
        </a>
        <a className={`hr-monthly-signal-card ${pendingRules.length ? "danger" : "done"}`} href="#work-rule-list">
          <span>HR/法務複核</span>
          <strong>{pendingRules.length}</strong>
          <small>未核准規章不能當作正式員工依據。</small>
        </a>
        <a className={`hr-monthly-signal-card ${acknowledgementRate >= 95 ? "done" : "warning"}`} href="#work-rule-evidence">
          <span>員工確認</span>
          <strong>{acknowledgementRate}%</strong>
          <small>
            {readiness.acknowledgedCount}/{readiness.requiredAcknowledgementCount} 筆確認證據。
          </small>
        </a>
      </section>

      <section className="grid">
        <section className="panel span-12" id="work-rule-readiness">
          <div className="section-heading">
            <div>
              <span className="muted">今日先處理</span>
              <h2>規章上線 Gate</h2>
              <p className="muted">正式導入前，要同時確認版本已核准、員工可閱讀、確認紀錄可稽核。</p>
            </div>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "無阻擋" : `${readiness.missing.length} 項缺口`}
            </span>
          </div>
          {readiness.missing.length > 0 ? (
            <div className="work-rule-gap-grid">
              {readiness.missing.map((item) => (
                <article className="work-rule-gap-card" key={item}>
                  <strong>{missingLabel(item)}</strong>
                  <p>{missingDetail(item)}</p>
                  <span className="badge warning">待處理</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">工作規則已發布、核准，且需要確認的員工已完成確認。</p>
          )}
        </section>

        <section className="panel span-12" id="article-70">
          <div className="section-heading">
            <div>
              <span className="muted">台灣法遵檢核</span>
              <h2>勞基法第 70 條項目覆蓋</h2>
              <p className="muted">勞動部條文指出，僱用勞工 30 人以上者應訂立工作規則、報主管機關核備並公開揭示。</p>
            </div>
            <a className="button" href="https://laws.mol.gov.tw/flaw/FLAWDOC01.aspx?flno=70&id=FL014930" rel="noreferrer" target="_blank">
              官方法源
            </a>
          </div>
          <div className="work-rule-article-grid">
            {article70WorkRuleItems.map((item) => {
              const missing = readiness.article70MissingItems.includes(item);
              return (
                <div className={`work-rule-article-item ${missing ? "warning" : "done"}`} key={item}>
                  <span>{item}</span>
                  <strong>{missing ? "待補" : "已涵蓋"}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel span-5" id="work-rule-wizard">
          <div className="section-heading">
            <div>
              <span className="muted">三步設定</span>
              <h2>新增或更新規章</h2>
              <p className="muted">貼上內容只用來計算 hash；送出後頁面不回顯原文。</p>
            </div>
            <span className="badge">No code</span>
          </div>
          <form action="/api/work-rules" method="post" className="wizard-form work-rule-wizard" aria-label="工作規則設定精靈">
            <input type="hidden" name="intent" value="save" />
            <fieldset className="form-card">
              <legend>1. 規章基本資料</legend>
              <label>
                規章名稱
                <input name="title" defaultValue="綜合工作規則與員工手冊" required />
              </label>
              <div className="field-grid">
                <label>
                  法定章節
                  <select name="category" defaultValue="綜合工作規則">
                    <option value="綜合工作規則">綜合工作規則</option>
                    {article70WorkRuleItems.map((item) => (
                      <option value={item} key={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  版本
                  <input name="version" defaultValue="2026.01" required />
                </label>
                <label>
                  生效日
                  <input name="effectiveFrom" type="date" defaultValue={today} required />
                </label>
              </div>
            </fieldset>
            <fieldset className="form-card">
              <legend>2. 核准與公開狀態</legend>
              <div className="field-grid">
                <label>
                  發布狀態
                  <select name="status" defaultValue="active">
                    <option value="draft">草稿</option>
                    <option value="active">啟用</option>
                    <option value="retired">停用</option>
                  </select>
                </label>
                <label>
                  HR/法務複核
                  <select name="reviewStatus" defaultValue="approved">
                    <option value="pending_review">待複核</option>
                    <option value="approved">已核准</option>
                    <option value="rejected">退回修正</option>
                  </select>
                </label>
              </div>
              <label>
                來源或核備參照
                <input name="sourceRef" placeholder="例：主管機關核備字號、文件庫 ref、內網公告 URL" defaultValue="demo://work-rules/employee-handbook-2026" />
              </label>
              <label className="check-row">
                <input name="acknowledgementRequired" type="checkbox" defaultChecked />
                需要員工手機端確認
              </label>
            </fieldset>
            <fieldset className="form-card">
              <legend>3. 摘要與內容 hash</legend>
              <label>
                員工可見摘要
                <textarea
                  name="summary"
                  rows={4}
                  defaultValue="涵蓋出勤、請假、加班、薪資發放、資安、職場安全、獎懲與離職交接等公司工作規則。"
                  required
                />
              </label>
              <label>
                規章內容原文
                <textarea name="content" rows={5} placeholder="貼上正式規章內容，系統只計算 content hash，不在頁面或 audit log 保存原文。" required />
              </label>
              <button className="button primary" type="submit">
                儲存並發布規章
              </button>
            </fieldset>
          </form>
        </section>

        <section className="panel span-7" id="work-rule-list">
          <div className="section-heading">
            <div>
              <span className="muted">版本清單</span>
              <h2>已建立規章</h2>
              <p className="muted">員工只會看到已啟用且需要確認的規章。</p>
            </div>
            <span className="badge">{workspace.rules.length} 份</span>
          </div>
          <div className="work-rule-list">
            {workspace.rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
            {workspace.rules.length === 0 ? (
              <div className="empty-card">
                <strong>尚未建立規章</strong>
                <p className="muted">請先用左側精靈建立員工手冊或工作規則。</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel span-12" id="work-rule-evidence">
          <div className="section-heading">
            <div>
              <span className="muted">公開揭示與確認證據</span>
              <h2>員工確認紀錄</h2>
              <p className="muted">確認紀錄只顯示員工、版本、日期與 hash 摘要，不顯示規章原文或私人備註。</p>
            </div>
            <span className="badge">{workspace.acknowledgements.length} 筆</span>
          </div>
          <ul className="task-list">
            {workspace.acknowledgements.length === 0 ? (
              <li className="task">
                <span>尚無確認紀錄。</span>
                <span className="badge warning">待員工確認</span>
              </li>
            ) : null}
            {workspace.acknowledgements.map((acknowledgement) => (
              <li className="task" key={acknowledgement.id}>
                <span>
                  <strong>{acknowledgement.employeeName}</strong>
                  <small>
                    {acknowledgement.workRuleTitle} · {acknowledgement.version} ·{" "}
                    {acknowledgement.acknowledgedAt.toLocaleDateString("zh-TW")}
                  </small>
                  <small>確認 hash {acknowledgement.acknowledgementHash.slice(0, 12)}</small>
                </span>
                <span className="badge">{acknowledgementSourceLabel(acknowledgement.source)}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function RuleCard({ rule }: { rule: CompanyWorkRuleView }) {
  return (
    <article className={`work-rule-card ${rule.status}`}>
      <div className="work-rule-card-head">
        <div>
          <span className="muted">{rule.category}</span>
          <h3>{rule.title}</h3>
        </div>
        <span className={`badge ${rule.status === "active" && rule.reviewStatus === "approved" ? "done" : "warning"}`}>
          {statusLabel(rule.status)} · {reviewStatusLabel(rule.reviewStatus)}
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
          <dd>{rule.sourceRef ?? "未設定"}</dd>
        </div>
        <div>
          <dt>內容 hash</dt>
          <dd>{rule.contentHash.slice(0, 12)}</dd>
        </div>
      </dl>
    </article>
  );
}

function buildWorkRuleFocus(readiness: WorkRuleReadiness) {
  if (readiness.pendingReviewCount > 0) {
    return {
      label: "今日先處理",
      title: "先完成 HR/法務複核",
      detail: `${readiness.pendingReviewCount} 份規章還不是已核准狀態，暫時不能當成正式員工依據。`,
      action: "檢查版本",
      href: "#work-rule-list",
      tone: "danger",
    };
  }
  if (readiness.article70Required && readiness.article70MissingItems.length > 0) {
    return {
      label: "法遵缺口",
      title: "補齊第 70 條項目",
      detail: `30 人以上公司需維護工作規則項目，目前還缺 ${readiness.article70MissingItems.length} 類。`,
      action: "查看缺口",
      href: "#article-70",
      tone: "warning",
    };
  }
  if (readiness.acknowledgedCount < readiness.requiredAcknowledgementCount) {
    return {
      label: "員工待辦",
      title: "推進員工確認",
      detail: `${readiness.acknowledgedCount}/${readiness.requiredAcknowledgementCount} 筆確認完成，需提醒員工到手機端確認。`,
      action: "查看證據",
      href: "#work-rule-evidence",
      tone: "warning",
    };
  }
  return {
    label: "可試營運",
    title: "規章發布與確認已就緒",
    detail: "下一步可把規章確認納入 Day 1 員工導入與 Day 14 audit evidence package。",
    action: "看員工端",
    href: "/app/work-rules",
    tone: "ready",
  };
}

function statusLabel(status: string) {
  if (status === "active") return "啟用";
  if (status === "draft") return "草稿";
  if (status === "retired") return "停用";
  return status;
}

function reviewStatusLabel(status: string) {
  if (status === "approved") return "已核准";
  if (status === "pending_review") return "待複核";
  if (status === "rejected") return "退回";
  return status;
}

function acknowledgementSourceLabel(source: string) {
  if (source === "employee_self_service") return "員工自助";
  if (source === "seed") return "種子資料";
  return source;
}

function successMessage(success: string) {
  if (success === "save") return "工作規則已儲存";
  return "工作規則已更新";
}

function localizeWorkRuleError(error: string) {
  if (/work_rule:manage/i.test(error)) return "目前角色沒有權限管理工作規則。";
  return "請確認規章名稱、版本、生效日、複核狀態與內容欄位後再試一次。";
}

function missingLabel(item: string) {
  if (item === "active company work rules or employee handbook") return "缺少啟用規章";
  if (item === "HR/legal review approval for all work rules") return "尚未全部複核";
  if (item === "Labor Standards Act Article 70 work-rule coverage") return "第 70 條項目未完整";
  if (item === "employee acknowledgement coverage") return "員工確認未完成";
  return item;
}

function missingDetail(item: string) {
  if (item === "active company work rules or employee handbook") return "至少需要一份啟用的員工手冊或工作規則。";
  if (item === "HR/legal review approval for all work rules") return "請把正式版本送 HR/法務複核，避免草稿被員工誤認為正式規章。";
  if (item === "Labor Standards Act Article 70 work-rule coverage") return "30 人以上公司需要檢查工作時間、工資、加班、紀律、離職退休等 12 類項目。";
  if (item === "employee acknowledgement coverage") return "需要員工在手機端完成閱讀確認，才有公開揭示與確認證據。";
  return "請依公司規章流程補齊。";
}
