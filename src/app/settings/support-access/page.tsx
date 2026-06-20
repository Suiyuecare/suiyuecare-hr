import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { dashboardPathForRole } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  canUseSupportAccess,
  listSupportAccessGrants,
  supportAccessScopes,
  type SupportAccessDataLevel,
  type SupportAccessGrant,
  type SupportAccessScope,
} from "@/server/support/access";

type SearchParams = Promise<{ error?: string; success?: string }>;

const scopeMeta: Record<SupportAccessScope, { label: string; detail: string }> = {
  technical_support: {
    label: "技術支援",
    detail: "排查登入、部署、設定或系統錯誤；預設只看 metadata。",
  },
  billing_support: {
    label: "帳務支援",
    detail: "處理訂閱、席次、合約與付款流程，不碰員工薪資明細。",
  },
  data_migration: {
    label: "資料移轉",
    detail: "協助匯入/匯出檢查，只處理客戶核准資料範圍。",
  },
  incident_response: {
    label: "事件處理",
    detail: "處理資安、資料異常或上線事故，需更嚴格 ticket 與期限。",
  },
};

export default async function SupportAccessPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, success }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (session.role !== "owner") {
    redirect(dashboardPathForRole(session.role));
  }

  const grants = await listSupportAccessGrants(session);
  const now = new Date();
  const activeGrants = grants.filter((grant) => isActiveGrant(grant, now));
  const expiredStillApproved = grants.filter((grant) => grant.status === "approved" && grant.expiresAt <= now);
  const revokedCount = grants.filter((grant) => grant.status === "revoked").length;
  const customerRecordGrantCount = activeGrants.filter((grant) => grant.dataAccessLevel === "customer_approved_records").length;
  const focus = buildSupportAccessFocus({ activeGrants, expiredStillApproved, customerRecordGrantCount });
  const commandCards = buildSupportAccessCards({
    activeCount: activeGrants.length,
    expiredCount: expiredStillApproved.length,
    revokedCount,
    customerRecordGrantCount,
  });
  const checklist = buildSupportAccessChecklist({
    activeCount: activeGrants.length,
    expiredCount: expiredStillApproved.length,
    customerRecordGrantCount,
  });

  return (
    <main className="page support-access-page">
      <section className="settings-control-hero support-access-hero" aria-label="支援存取工作台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="muted">Owner 專用</span>
            <span className={`badge ${focus.tone === "ready" ? "" : "warning"}`}>{focus.badge}</span>
          </div>
          <h1>支援存取工作台</h1>
          <p>
            客服、工程或資料移轉人員只能在客戶核准的 ticket、scope、資料層級與到期時間內取得臨時存取；每次核准與撤銷都會寫入 audit log，避免支援帳號變成隱形代管。
          </p>
          <div className="settings-control-hero-actions">
            <a className="button primary" href="#support-access-approve">
              核准支援存取
            </a>
            <a className="button" href="#support-access-grants">
              檢查存取
            </a>
            <Link className="button" href="/settings/readiness">
              上線閘門
            </Link>
          </div>
        </div>

        <aside className={`settings-control-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="muted">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <a className="button primary" href={focus.href}>
            {focus.label}
          </a>
        </aside>
      </section>

      {success ? (
        <section className="support-access-alerts" aria-live="polite">
          <div className="panel success-panel">
            <strong>{successMessage(success)}</strong>
            <p>已寫入 support_access_grant audit log；頁面只呈現必要支援身份摘要，原因與 email 在稽核中以 hash 保存。</p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="support-access-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>支援存取未更新</strong>
            <p>{localizeSupportAccessError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="settings-signal-board support-access-signal-board" aria-label="支援存取訊號板">
        <article className={`settings-signal-card ${activeGrants.length ? "warning" : "done"}`}>
          <span>有效存取</span>
          <strong>{activeGrants.length} 筆</strong>
          <small>{activeGrants.length ? "確認每筆都有客戶 ticket、scope 與到期時間。" : "目前沒有有效支援存取。"}</small>
        </article>
        <article className={`settings-signal-card ${expiredStillApproved.length ? "danger" : "done"}`}>
          <span>逾期仍核准</span>
          <strong>{expiredStillApproved.length} 筆</strong>
          <small>{expiredStillApproved.length ? "Production Gate 會阻擋逾期仍 approved 的支援存取。" : "沒有逾期仍核准的支援帳號。"}</small>
        </article>
        <article className={`settings-signal-card ${customerRecordGrantCount ? "warning" : "done"}`}>
          <span>資料層級</span>
          <strong>{customerRecordGrantCount ? `${customerRecordGrantCount} 筆可看核准資料` : "Metadata only"}</strong>
          <small>正式客戶支援預設只開 metadata；核准資料需明確 ticket。</small>
        </article>
        <article className="settings-signal-card done">
          <span>撤銷紀錄</span>
          <strong>{revokedCount} 筆</strong>
          <small>撤銷原因保留 hash，避免把客戶事件細節暴露在頁面與 log。</small>
        </article>
      </section>

      <section className="settings-command-grid support-access-command-grid" aria-label="支援存取作業區">
        {commandCards.map((card) => (
          <article className={`settings-command-card support-access-command-card ${card.tone}`} key={card.title}>
            <div>
              <span className="muted">{card.stage}</span>
              <h2>{card.title}</h2>
            </div>
            <span className={`badge ${card.badgeClass}`}>{card.status}</span>
            <p>{card.detail}</p>
            <a className="button primary" href={card.href}>
              {card.actionLabel}
            </a>
            <div className="settings-command-links">
              {card.links.map((link) => (
                <Link href={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid">
        <section className="panel span-12" id="support-access-approve">
          <div className="section-heading">
            <div>
              <h2>三步支援存取精靈</h2>
              <p className="muted">先確認支援人員與 ticket，再限制 scope 與資料層級，最後設定 72 小時內到期時間。</p>
            </div>
            <span className="badge">Owner approved</span>
          </div>
          <form action="/api/settings/support-access" method="post" className="wizard-form support-access-form" aria-label="三步支援存取精靈">
            <input type="hidden" name="action" value="approve" />

            <fieldset className="form-card support-access-fieldset">
              <legend>1. 支援人員與 ticket</legend>
              <p className="muted">每筆支援存取都必須對應客戶核准 ticket；不要把薪資、身分證、銀行帳號或私密人事內容寫進理由。</p>
              <div className="field-grid">
                <label>
                  支援人員 Email
                  <input name="supportPrincipalEmail" type="email" placeholder="support@hrone.example" required />
                </label>
                <label>
                  支援人員名稱
                  <input name="supportPrincipalName" placeholder="客服工程師" />
                </label>
                <label>
                  Ticket ID
                  <input name="ticketId" placeholder="INC-2026-0001" required />
                </label>
                <label>
                  到期時間
                  <input name="expiresAt" type="datetime-local" required />
                </label>
              </div>
              <label>
                核准理由
                <textarea
                  name="reason"
                  placeholder="例：客戶核准 INC-2026-0001，協助排查 SSO 登入設定，僅檢查 metadata。"
                  required
                />
              </label>
            </fieldset>

            <fieldset className="form-card support-access-fieldset">
              <legend>2. Scope 與資料層級</legend>
              <p className="muted">只開本次 ticket 需要的 scope；資料層級預設 metadata only。</p>
              <div className="support-access-scope-grid" aria-label="支援範圍">
                {supportAccessScopes.map((scope) => (
                  <label className="support-access-scope-card" key={scope}>
                    <span>
                      <strong>{scopeMeta[scope].label}</strong>
                      <small>{scopeMeta[scope].detail}</small>
                    </span>
                    <input name="scopes" type="checkbox" value={scope} defaultChecked={scope === "technical_support"} />
                  </label>
                ))}
              </div>
              <label>
                資料層級
                <select name="dataAccessLevel" defaultValue="metadata_only">
                  <option value="metadata_only">只允許 metadata</option>
                  <option value="customer_approved_records">只允許客戶核准紀錄</option>
                </select>
              </label>
            </fieldset>

            <fieldset className="form-card support-access-fieldset">
              <legend>3. 到期與安全確認</legend>
              <p className="muted">系統會阻擋超過 72 小時的核准；工作完成後請立即撤銷，不要等到到期。</p>
              <ul className="task-list support-access-checklist">
                {checklist.map((item) => (
                  <li className="task" key={item.title}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className={`badge ${item.ready ? "" : "warning"}`}>{item.ready ? "完成" : "待補"}</span>
                  </li>
                ))}
              </ul>
              <div className="support-access-policy-note">
                <strong>安全提醒</strong>
                <p>支援存取不是客服代登入。不得用於查看薪資、銀行帳號、身分證、健康資料或私人 HR 備註，除非客戶 ticket 明確核准且權限只限該紀錄。</p>
              </div>
              <button className="button primary" type="submit">
                核准支援存取
              </button>
            </fieldset>
          </form>
        </section>

        <section className="panel span-12" id="support-access-grants">
          <div className="section-heading">
            <div>
              <h2>支援存取紀錄</h2>
              <p className="muted">正式上線 Gate 會阻擋未核准有效存取與逾期仍 approved 的 grant；支援工作完成後請立即撤銷。</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          {grants.length === 0 ? (
            <EmptyState title="目前沒有支援存取" body="只有客戶核准 ticket 需要排查時，Owner 才需要建立短效支援存取。" />
          ) : (
            <div className="support-access-grant-grid" aria-label="支援存取清單">
              {grants.map((grant) => (
                <SupportAccessGrantCard grant={grant} key={grant.id} now={now} />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SupportAccessGrantCard({ grant, now }: { grant: SupportAccessGrant; now: Date }) {
  const activeScopes = grant.scopes.filter((scope) => canUseSupportAccess(grant, scope, now));
  const expired = grant.status === "approved" && grant.expiresAt <= now;
  const status = grant.status === "revoked" ? "revoked" : expired ? "expired" : "active";

  return (
    <article className={`support-access-grant-card ${status}`}>
      <div className="support-access-grant-head">
        <div>
          <span className="muted">{grant.ticketId}</span>
          <h3>{grant.supportPrincipalName || "支援人員"}</h3>
          <small>{maskEmail(grant.supportPrincipalEmail)}</small>
        </div>
        <span className={`badge ${status === "active" ? "warning" : status === "revoked" ? "" : "danger"}`}>
          {supportStatusLabel(status)}
        </span>
      </div>
      <div className="support-access-grant-meta">
        <span>{dataAccessLevelLabel(grant.dataAccessLevel)}</span>
        <span>核准 {formatDate(grant.approvedAt)}</span>
        <span>到期 {formatDate(grant.expiresAt)}</span>
        {grant.lastUsedAt ? <span>最後使用 {formatDate(grant.lastUsedAt)}</span> : <span>尚無使用紀錄</span>}
      </div>
      <div className="support-access-scope-strip" aria-label="已核准支援範圍">
        {grant.scopes.map((scope) => (
          <span className={activeScopes.includes(scope) ? "active" : ""} key={scope}>
            {scopeMeta[scope].label}
          </span>
        ))}
      </div>
      {status === "active" ? (
        <form action="/api/settings/support-access" method="post" className="mini-form support-access-revoke-form" aria-label={`撤銷 ${grant.ticketId}`}>
          <input type="hidden" name="action" value="revoke" />
          <input type="hidden" name="grantId" value={grant.id} />
          <label>
            撤銷原因
            <input name="revokeReason" placeholder="支援作業完成，客戶確認關閉" required />
          </label>
          <button className="button" type="submit">
            撤銷存取
          </button>
        </form>
      ) : grant.status === "revoked" ? (
        <small className="support-access-muted-proof">撤銷原因已以 hash 保留，不在頁面顯示原文。</small>
      ) : (
        <small className="support-access-muted-proof">此 grant 已逾期，請建立撤銷紀錄或確認 production gate。</small>
      )}
    </article>
  );
}

function buildSupportAccessFocus(input: {
  activeGrants: SupportAccessGrant[];
  expiredStillApproved: SupportAccessGrant[];
  customerRecordGrantCount: number;
}) {
  if (input.expiredStillApproved.length > 0) {
    return {
      badge: "逾期存取需處理",
      tone: "danger" as const,
      title: "撤銷逾期支援存取",
      detail: "逾期仍 approved 的支援存取會讓 production gate fail，請先撤銷或補證據。",
      href: "#support-access-grants",
      label: "處理逾期",
    };
  }

  if (input.customerRecordGrantCount > 0) {
    return {
      badge: "核准紀錄存取",
      tone: "warning" as const,
      title: "確認客戶核准範圍",
      detail: "目前有支援存取可看客戶核准紀錄，請確認 ticket、scope、期限與撤銷計畫。",
      href: "#support-access-grants",
      label: "檢查 scope",
    };
  }

  if (input.activeGrants.length > 0) {
    return {
      badge: "有效存取中",
      tone: "warning" as const,
      title: "追蹤有效支援存取",
      detail: "支援工作完成就撤銷，不要等 72 小時自然到期。",
      href: "#support-access-grants",
      label: "查看存取",
    };
  }

  return {
    badge: "支援存取關閉",
    tone: "ready" as const,
    title: "保持最小權限",
    detail: "目前沒有有效支援存取；只有客戶 ticket 明確核准時才建立短效 grant。",
    href: "#support-access-approve",
    label: "必要時核准",
  };
}

function buildSupportAccessCards(input: {
  activeCount: number;
  expiredCount: number;
  revokedCount: number;
  customerRecordGrantCount: number;
}) {
  return [
    {
      stage: "Step 1",
      title: "Ticket 綁定",
      status: "必填",
      badgeClass: "",
      tone: "ready",
      detail: "每筆支援存取都要綁定客戶核准 ticket、支援人員與明確理由。",
      href: "#support-access-approve",
      actionLabel: "建立 grant",
      links: [
        { href: "/settings/audit", label: "Audit log" },
        { href: "/settings/readiness", label: "上線 Gate" },
      ],
    },
    {
      stage: "Step 2",
      title: "Scope 與資料層級",
      status: input.customerRecordGrantCount ? `${input.customerRecordGrantCount} 筆需追蹤` : "Metadata",
      badgeClass: input.customerRecordGrantCount ? "warning" : "",
      tone: input.customerRecordGrantCount ? "warning" : "ready",
      detail: "預設 metadata only；若要看客戶核准紀錄，必須對齊 ticket 與最小資料範圍。",
      href: "#support-access-approve",
      actionLabel: "限制 scope",
      links: [
        { href: "/settings/privacy", label: "個資治理" },
        { href: "/settings/security", label: "登入政策" },
      ],
    },
    {
      stage: "Step 3",
      title: "72 小時期限",
      status: input.activeCount ? `${input.activeCount} 有效` : "無有效",
      badgeClass: input.activeCount ? "warning" : "",
      tone: input.activeCount ? "warning" : "ready",
      detail: "支援存取最長 72 小時；實務上應在工作完成時立即撤銷。",
      href: "#support-access-grants",
      actionLabel: "檢查期限",
      links: [
        { href: "/settings/operational-resilience", label: "營運韌性" },
        { href: "/settings/readiness", label: "Readiness" },
      ],
    },
    {
      stage: "Evidence",
      title: "撤銷與 Gate",
      status: input.expiredCount ? `${input.expiredCount} 逾期` : `${input.revokedCount} 已撤銷`,
      badgeClass: input.expiredCount ? "danger" : "",
      tone: input.expiredCount ? "danger" : "ready",
      detail: "Production verification 會阻擋逾期仍核准或未核准的支援存取。",
      href: "#support-access-grants",
      actionLabel: "看紀錄",
      links: [
        { href: "/settings/readiness", label: "上線閘門" },
        { href: "/settings/audit", label: "Audit" },
      ],
    },
  ];
}

function buildSupportAccessChecklist(input: {
  activeCount: number;
  expiredCount: number;
  customerRecordGrantCount: number;
}) {
  return [
    {
      title: "每筆 grant 都需 ticket",
      detail: "支援人員、ticket、scope、資料層級與到期時間會一起寫入稽核。",
      ready: true,
    },
    {
      title: "有效 grant 需追蹤",
      detail: input.activeCount ? `目前有 ${input.activeCount} 筆有效支援存取。` : "目前沒有有效支援存取。",
      ready: input.activeCount === 0,
    },
    {
      title: "逾期 approved 需撤銷",
      detail: input.expiredCount ? `${input.expiredCount} 筆逾期仍核准會阻擋上線 Gate。` : "沒有逾期仍核准的 grant。",
      ready: input.expiredCount === 0,
    },
    {
      title: "資料層級保持最小",
      detail: input.customerRecordGrantCount ? `${input.customerRecordGrantCount} 筆可看客戶核准紀錄，請確認必要性。` : "目前有效 grant 皆為 metadata only 或無 grant。",
      ready: input.customerRecordGrantCount === 0,
    },
  ];
}

function isActiveGrant(grant: SupportAccessGrant, now: Date) {
  return grant.status === "approved" && grant.expiresAt > now;
}

function supportStatusLabel(status: "active" | "expired" | "revoked") {
  if (status === "revoked") return "已撤銷";
  if (status === "expired") return "已逾期";
  return "有效";
}

function dataAccessLevelLabel(level: SupportAccessDataLevel) {
  if (level === "customer_approved_records") return "客戶核准紀錄";
  return "只允許 metadata";
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "email hash saved";
  return `${local.slice(0, Math.min(7, local.length))}...@${domain}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(value);
}

function successMessage(success: string) {
  if (success === "approved") return "支援存取已核准";
  if (success === "revoked") return "支援存取已撤銷";
  return "支援存取已更新";
}

function localizeSupportAccessError(error: string) {
  if (/Only owner/i.test(error)) return "只有 Owner 可以核准或撤銷支援存取。";
  if (/72 hours/i.test(error)) return "支援存取最長不能超過 72 小時。";
  if (/expiry/i.test(error)) return "到期時間必須有效且晚於現在。";
  if (/scope/i.test(error)) return "至少需要選擇一個支援範圍。";
  if (/reason/i.test(error)) return "請填寫足夠清楚的核准或撤銷原因；系統會以 hash 保存證據。";
  if (/email/i.test(error)) return "支援人員 Email 格式不正確。";
  return "請確認支援人員、ticket、scope、資料層級與到期時間後再試一次。";
}
