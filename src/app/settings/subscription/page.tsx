import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getSubscriptionWorkspace } from "@/server/subscriptions/service";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function SubscriptionSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getSubscriptionWorkspace(session);
  const { subscription, readiness, productModules } = workspace;

  if (!workspace) {
    return (
      <main className="page">
        <EmptyState title="No subscription workspace" body="Switch to the owner demo role to manage commercial readiness." />
      </main>
    );
  }

  return (
    <main className="page subscription-page">
      <section className="settings-control-hero subscription-hero" aria-label="商務訂閱與模組販售">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="muted">Finance-style commercial console</span>
            <span className={`badge ${readiness.ready ? "" : "warning"}`}>
              {readiness.ready ? "可商轉" : `${readiness.missing.length} 項缺口`}
            </span>
          </div>
          <h1>商務訂閱與模組販售</h1>
          <p>
            把客戶方案、席次、合約證據與 HR One 可販售模組放在同一個 Owner 工作台；
            銷售前要能說清楚買到哪些模組、哪些 Gate 還沒過，以及不會交付哪些敏感能力。
          </p>
          <div className="settings-control-hero-actions">
            <a className="button primary" href="#product-modules">
              查看模組包
            </a>
            <a className="button" href="/settings/readiness">
              上線 Gate
            </a>
            <a className="button" href="/console">
              回後台工作台
            </a>
          </div>
        </div>
        <aside className={`settings-control-focus ${readiness.ready ? "ready" : "warning"}`}>
          <span className="muted">今日先處理</span>
          <strong>{readiness.ready ? "商務條件已可進入交付" : "先補合約與驗證缺口"}</strong>
          <p>{readiness.ready ? "接著確認 production DB、SSO、KPI 與 pilot evidence。" : localizeMissing(readiness.missing[0] ?? "commercial terms reviewed")}</p>
          <span className={`badge ${readiness.ready ? "" : "warning"}`}>
            {readiness.ready ? "已驗證" : "不可販售"}
          </span>
        </aside>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>無法更新商務訂閱</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">方案</span>
          <strong>{planLabel(subscription.plan)}</strong>
          <span className={`badge ${subscription.status === "active" ? "" : "warning"}`}>{statusLabel(subscription.status)}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">席次</span>
          <strong>
            {subscription.activeSeatCount}/{subscription.seatLimit}
          </strong>
          <span className={`badge ${readiness.seatUtilizationPercent > 100 ? "danger" : ""}`}>
            {readiness.seatUtilizationPercent}%
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">試用剩餘</span>
          <strong>{readiness.daysUntilTrialEnd ?? "n/a"}</strong>
          <span className="badge">天</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">模組包</span>
          <strong>{productModules.includedCount}/{productModules.totalCount}</strong>
          <span className={`badge ${productModules.readyForPackaging ? "" : "warning"}`}>
            {productModules.planLabel}
          </span>
        </div>

        <section className={`panel span-12 risk-box ${readiness.ready ? "success-box" : "danger-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{readiness.ready ? "商務條件可交付" : "商務條件仍有缺口"}</h2>
              <p className="muted">{localizeReadinessDetail(readiness.detail)}</p>
            </div>
            <span className={`badge ${readiness.ready ? "" : "danger"}`}>{readiness.ready ? "可交付" : "阻擋"}</span>
          </div>
          {readiness.missing.length > 0 ? (
            <ul className="task-list">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{localizeMissing(item)}</span>
                  <span className="badge danger">必補</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>客戶方案、席次、帳務聯絡人、合約證據與商務複核都已就緒。</p>
          )}
        </section>

        <section className="panel span-12 product-module-board" id="product-modules" aria-label="可販售模組目錄">
          <div className="section-heading">
            <div>
              <h2>可販售模組目錄</h2>
              <p className="muted">
                參照 Finance 模組的產品化方式，把 HR One 拆成可報價、可交付、可驗收的模組包；模組開關不可取代 RBAC、tenant isolation 或薪資權限。
              </p>
            </div>
            <span className={`badge ${productModules.readyForPackaging ? "" : "warning"}`}>
              {productModules.readyForPackaging ? "可包裝報價" : "尚未可報價"}
            </span>
          </div>
          <div className="product-module-summary" aria-label="模組包摘要">
            <article>
              <span>已含模組</span>
              <strong>{productModules.includedCount}</strong>
              <small>{productModules.sellableIncludedCount} 個可販售</small>
            </article>
            <article>
              <span>需升級</span>
              <strong>{productModules.upgradeRequiredCount}</strong>
              <small>依方案自動判定</small>
            </article>
            <article>
              <span>Gate 待確認</span>
              <strong>{productModules.gatedIncludedCount}</strong>
              <small>pilot 或正式 gate</small>
            </article>
            <article>
              <span>目前方案</span>
              <strong>{productModules.planLabel}</strong>
              <small>由訂閱設定控制</small>
            </article>
          </div>
          <div className="product-module-grid">
            {productModules.items.map((item) => (
              <article className={`product-module-card ${moduleTone(item)}`} key={item.module.id}>
                <div className="product-module-card-head">
                  <div>
                    <span className="eyebrow">{categoryLabel(item.module.category)}</span>
                    <h3>{item.module.title}</h3>
                  </div>
                  <span className={`badge ${moduleBadgeClass(item)}`}>{moduleStatusLabel(item)}</span>
                </div>
                <p>{item.module.summary}</p>
                <div className="product-module-meta">
                  <span>最低 {item.planLabel}</span>
                  <span>{deliveryLabel(item.module.deliveryStatus)}</span>
                  <span>{item.module.defaultEnabled ? "預設啟用" : "加購/人工啟用"}</span>
                </div>
                <div className="product-module-gates" aria-label={`${item.module.title} 交付 Gate`}>
                  {item.module.gates.slice(0, 3).map((gate) => (
                    <span key={gate}>{localizeGate(gate)}</span>
                  ))}
                </div>
                <div className="product-module-links">
                  {item.module.pages.slice(0, 2).map((page) => (
                    <a className="button" href={page} key={page}>
                      {pageLabel(page)}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>商務設定精靈</h2>
              <p className="muted">
                只保存合約參照與 hash；不要貼原始合約、銀行資料、信用卡資料或客戶私人備註。
              </p>
            </div>
            <span className="badge">Owner only</span>
          </div>

          <form action="/api/settings/subscription" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                方案
                <select name="plan" defaultValue={subscription.plan}>
                  <option value="demo">Demo</option>
                  <option value="team">Team</option>
                  <option value="business">Business</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>
              <label>
                狀態
                <select name="status" defaultValue={subscription.status}>
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label>
                席次上限
                <input name="seatLimit" type="number" min="1" defaultValue={subscription.seatLimit} />
              </label>
              <label>
                續約提醒天數
                <input name="renewalNoticeDays" type="number" min="1" max="180" defaultValue={subscription.renewalNoticeDays} />
              </label>
              <label>
                試用到期日
                <input name="trialEndsAt" type="date" defaultValue={formatDateInput(subscription.trialEndsAt)} />
              </label>
              <label>
                合約開始日
                <input name="contractStartsAt" type="date" defaultValue={formatDateInput(subscription.contractStartsAt)} />
              </label>
              <label>
                合約結束日
                <input name="contractEndsAt" type="date" defaultValue={formatDateInput(subscription.contractEndsAt)} />
              </label>
              <label>
                帳務聯絡 Email
                <input name="billingContactEmail" type="email" defaultValue={subscription.billingContactEmail ?? ""} />
              </label>
              <label>
                合約參照
                <input name="contractRef" defaultValue={subscription.contractRef ?? ""} placeholder="contract://customer/hrone-2026" />
              </label>
              <label>
                合約 hash
                <input name="contractHash" defaultValue={subscription.contractHash ?? ""} placeholder="Auto-generated if blank" />
              </label>
              <label>
                收款模式
                <select name="paymentCollectionMode" defaultValue={subscription.paymentCollectionMode}>
                  <option value="manual_invoice">Manual invoice</option>
                  <option value="stripe_placeholder">Stripe placeholder</option>
                  <option value="partner_reseller">Partner reseller</option>
                </select>
              </label>
              <label>
                商務複核
                <select name="verificationStatus" defaultValue={subscription.verificationStatus}>
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
            </div>
            <button className="button primary" type="submit">
              儲存商務設定
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function formatDateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function planLabel(value: string) {
  const labels: Record<string, string> = {
    demo: "Demo",
    team: "Team",
    business: "Business",
    enterprise: "Enterprise",
  };
  return labels[value] ?? value;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    trial: "試用",
    active: "啟用",
    past_due: "逾期",
    suspended: "暫停",
    cancelled: "取消",
  };
  return labels[value] ?? value;
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    core: "核心",
    employee: "員工前台",
    operations: "營運",
    payroll: "薪資",
    compliance: "法遵",
    platform: "平台",
    add_on: "加值",
  };
  return labels[value] ?? value;
}

function deliveryLabel(value: string) {
  const labels: Record<string, string> = {
    ready: "可交付",
    pilot: "試行",
    gate_required: "需 Gate",
  };
  return labels[value] ?? value;
}

function moduleTone(item: { included: boolean; blockedByGate: boolean; module: { deliveryStatus: string } }) {
  if (!item.included) return "warning";
  if (item.blockedByGate || item.module.deliveryStatus === "gate_required") return "danger";
  if (item.module.deliveryStatus === "pilot") return "warning";
  return "ready";
}

function moduleBadgeClass(item: { included: boolean; blockedByGate: boolean; module: { deliveryStatus: string } }) {
  const tone = moduleTone(item);
  if (tone === "danger") return "danger";
  if (tone === "warning") return "warning";
  return "";
}

function moduleStatusLabel(item: { included: boolean; blockedByGate: boolean; module: { deliveryStatus: string; sellable: boolean } }) {
  if (!item.included) return "需升級";
  if (!item.module.sellable) return "內部 Gate";
  if (item.blockedByGate) return "未放行";
  return deliveryLabel(item.module.deliveryStatus);
}

function localizeMissing(value: string) {
  const labels: Record<string, string> = {
    "paid customer plan selected": "選擇付費客戶方案",
    "active subscription status": "訂閱狀態需為啟用",
    "seat limit covers active users": "席次需涵蓋所有啟用使用者",
    "billing contact email": "補齊帳務聯絡 Email",
    "contract reference and hash": "補齊合約參照與 hash",
    "contract term dates": "補齊合約起訖日期",
    "renewal review before contract end": "合約到期前需完成續約複核",
    "commercial terms reviewed": "商務條件需由 Owner 複核",
  };
  return labels[value] ?? value;
}

function localizeReadinessDetail(value: string) {
  return value
    .replace("seat(s)", "席")
    .replace("trial", "試用剩餘")
    .replace("day(s)", "天")
    .replace("contract", "合約剩餘")
    .replace("review", "複核");
}

function localizeGate(value: string) {
  const labels: Record<string, string> = {
    "tenant isolation": "tenant 隔離",
    "RBAC/ABAC": "RBAC/ABAC",
    "audit log coverage": "audit 覆蓋",
    "mobile task completion": "手機任務完成率",
    "self-only data access": "本人資料邊界",
    "payslip release boundary": "薪資單釋出邊界",
    "15-second approval UX": "15 秒簽核",
    "approval audit log": "簽核 audit",
    "manager salary boundary": "主管薪資邊界",
    "attendance exceptions < 10%": "出勤異常 < 10%",
    "five-year attendance retention": "出勤保存五年",
    "law rule version linkage": "法規版本連結",
    "payroll lock workflow": "薪資鎖定流程",
    "unauthorized salary access = 0": "薪資未授權 0",
    "wage roster five-year retention": "工資清冊五年",
    "official .gov.tw sources": "官方來源",
    "11/11 compliance coverage": "11/11 法遵覆蓋",
    "human legal review before payroll lock": "鎖薪前人工複核",
    "HR-created forms > 80%": "HR 自建表單 > 80%",
    "workflow audit coverage": "流程 audit",
    "attachment metadata only": "附件 metadata",
    "field-level permission matrix": "欄位權限矩陣",
    "high-sensitive second review": "高敏二人覆核",
    "no raw salary export leakage": "薪資匯出防漏",
    "100% source references": "100% 來源引用",
    "blocked sensitive decisions": "封鎖敏感決策",
    "prompt/output hash audit": "AI hash audit",
    "production database ready": "正式 DB ready",
    "two-tenant isolation test": "雙租戶隔離測試",
    "backup restore drill evidence": "還原演練證據",
  };
  return labels[value] ?? value;
}

function pageLabel(page: string) {
  const labels: Record<string, string> = {
    "/console": "後台",
    "/settings/organization": "組織",
    "/settings/access": "權限",
    "/settings/audit": "Audit",
    "/app": "員工前台",
    "/app/attendance": "出勤",
    "/app/payslip": "薪資單",
    "/app/documents": "文件",
    "/manager/inbox": "Inbox",
    "/hr/forms": "表單",
    "/hr/attendance-exceptions": "異常",
    "/hr/attendance-policies": "打卡",
    "/hr/leave-policies": "假別",
    "/hr": "月結",
    "/hr/salary-profiles": "薪資資料",
    "/hr/payroll-recordkeeping": "工資清冊",
    "/settings/law-rules": "法規",
    "/hr/worktime-compliance": "工時",
    "/hr/insurance": "投保",
    "/hr/payroll-compliance": "薪資法遵",
    "/hr/reports": "報表",
    "/settings/pilot-evidence": "證據",
    "/hr/copilot": "AI",
    "/hr/policy-sources": "來源",
    "/settings/readiness": "上線",
    "/settings/production-database": "DB Gate",
    "/settings/support-access": "支援",
  };
  return labels[page] ?? page;
}
