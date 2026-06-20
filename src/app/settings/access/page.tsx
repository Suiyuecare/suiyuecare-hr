import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getUserAccessWorkspace } from "@/server/auth/access-management";
import { roleKeys, type RoleKey } from "@/server/auth/rbac";

type SearchParams = Promise<{ error?: string; success?: string }>;

export default async function AccessSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, success }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getUserAccessWorkspace(session);
  const suspendedCount = workspace.users.filter((user) => user.status === "suspended").length;
  const privilegedUsers = workspace.users.filter((user) =>
    user.roles.some((role) => role === "owner" || role === "hr_admin" || role === "manager"),
  );
  const privilegedMissingSso = workspace.ssoEnabled
    ? privilegedUsers.filter((user) => user.externalIdentities.length === 0).length
    : 0;
  const unlinkedEmployeeCount = workspace.employees.filter((employee) => !employee.userId).length;
  const roleCoverageCount = roleKeys.filter((role) =>
    workspace.users.some((user) => user.roles.includes(role) && user.status !== "suspended"),
  ).length;
  const focus = buildAccessFocus({
    unlinkedEmployeeCount,
    privilegedMissingSso,
    suspendedCount,
    roleCoverageCount,
  });

  return (
    <main className="page access-control-page">
      <section className="settings-control-hero access-control-hero" aria-label="權限與登入中樞">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="muted">Owner、人資與行政主管使用</span>
            <span className={`badge ${focus.tone === "ready" ? "" : "warning"}`}>{focus.badge}</span>
          </div>
          <h1>權限與登入中樞</h1>
          <p>
            把邀請帳號、RBAC 角色、員工主檔綁定、停用帳號與 SSO 身分綁定放在同一個可稽核流程裡；正式導入前先確定每位員工只看到自己的任務與資料。
          </p>
          <div className="settings-control-hero-actions">
            <a className="button primary" href="#access-invite">
              邀請使用者
            </a>
            <a className="button" href="#access-users">
              檢查帳號
            </a>
            <a className="button" href="/settings/security">
              調整資安政策
            </a>
          </div>
        </div>
        <aside className="settings-control-focus">
          <span className="muted">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <a className="button primary" href={focus.href}>
            {focus.label}
          </a>
        </aside>
      </section>

      {success ? (
        <section className="access-result-banner success-banner" aria-live="polite">
          <strong>{successMessage(success)}</strong>
          <p>已寫入權限 audit log；頁面只顯示必要身分摘要，SSO subject 與員工關聯以 hash/狀態保存證據。</p>
        </section>
      ) : null}

      {error ? (
        <section className="access-result-banner danger-panel" aria-live="polite">
          <strong>無法更新權限</strong>
          <p>{localizeAccessError(error)}</p>
        </section>
      ) : null}

      <section className="settings-signal-board access-signal-board" aria-label="權限狀態訊號板">
        <a className={`settings-signal-card ${unlinkedEmployeeCount ? "warning" : "done"}`} href="#access-users">
          <span>員工登入綁定</span>
          <strong>{unlinkedEmployeeCount ? `${unlinkedEmployeeCount} 人待綁` : "已覆蓋"}</strong>
          <small>正式邀請前，每位 active 員工都需要對應帳號或明確暫緩原因。</small>
        </a>
        <a className={`settings-signal-card ${roleCoverageCount === roleKeys.length ? "done" : "warning"}`} href="#access-users">
          <span>核心角色覆蓋</span>
          <strong>{roleCoverageCount}/{roleKeys.length}</strong>
          <small>Owner、HR、主管、員工四種角色都要有可測試帳號。</small>
        </a>
        <a className={`settings-signal-card ${privilegedMissingSso ? "warning" : "done"}`} href="#access-users">
          <span>高權限 SSO</span>
          <strong>{workspace.ssoEnabled ? `${privilegedMissingSso} 待補` : "政策未強制"}</strong>
          <small>正式環境應讓 Owner、HR、主管綁定企業 IdP 與 MFA。</small>
        </a>
        <a className={`settings-signal-card ${suspendedCount ? "danger" : "done"}`} href="#access-users">
          <span>停用帳號</span>
          <strong>{suspendedCount}</strong>
          <small>留停、離職與支援帳號都要可停用、可追蹤、可復用。</small>
        </a>
      </section>

      <section className="settings-command-grid access-command-grid" aria-label="權限作業區">
        <article className="settings-command-card ready">
          <div>
            <span className="muted">Step 1</span>
            <h2>邀請帳號</h2>
          </div>
          <span className="badge">Audited</span>
          <p>建立使用者、套用角色與允許網域檢查；邀請 token 不保存原文。</p>
          <a className="button primary" href="#access-invite">
            開始邀請
          </a>
          <div className="settings-command-links">
            <a href="/settings/security">允許網域</a>
            <a href="/settings/pilot-invite-readiness">邀請 Gate</a>
          </div>
        </article>
        <article className={`settings-command-card ${unlinkedEmployeeCount ? "warning" : "ready"}`}>
          <div>
            <span className="muted">Step 2</span>
            <h2>綁定員工</h2>
          </div>
          <span className={`badge ${unlinkedEmployeeCount ? "warning" : ""}`}>
            {unlinkedEmployeeCount ? "待補" : "Ready"}
          </span>
          <p>把登入帳號連到員工主檔，讓前台任務、薪資單 self-only 與主管線權限能正確運作。</p>
          <a className="button primary" href="#access-users">
            處理綁定
          </a>
          <div className="settings-command-links">
            <a href="/hr/employees">人事主檔</a>
            <a href="/settings/pilot-invite-readiness">權限防漏</a>
          </div>
        </article>
        <article className={`settings-command-card ${privilegedMissingSso ? "warning" : "ready"}`}>
          <div>
            <span className="muted">Step 3</span>
            <h2>綁定 SSO</h2>
          </div>
          <span className={`badge ${privilegedMissingSso ? "warning" : ""}`}>
            {workspace.ssoEnabled ? "SSO" : "Optional"}
          </span>
          <p>只顯示 subject hash，避免把 IdP subject、token 或私人識別碼放到頁面與 audit metadata。</p>
          <a className="button primary" href="#access-users">
            檢查 SSO
          </a>
          <div className="settings-command-links">
            <a href="/settings/security">SSO 設定</a>
            <a href="/settings/audit">Audit log</a>
          </div>
        </article>
        <article className={`settings-command-card ${suspendedCount ? "danger" : "ready"}`}>
          <div>
            <span className="muted">Ongoing</span>
            <h2>停用與復用</h2>
          </div>
          <span className={`badge ${suspendedCount ? "danger" : ""}`}>
            {suspendedCount ? "需追蹤" : "正常"}
          </span>
          <p>離職、留停、支援或錯誤邀請都從同一張使用者卡片停用，避免散落在深層選單。</p>
          <a className="button primary" href="#access-users">
            查看帳號
          </a>
          <div className="settings-command-links">
            <a href="/hr/offboarding">離職交接</a>
            <a href="/settings/support-access">支援存取</a>
          </div>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-12 access-invite-panel" id="access-invite">
          <div className="section-heading">
            <div>
              <span className="muted">三步邀請</span>
              <h2>新增使用者</h2>
              <p className="muted">先輸入公司 Email 與名稱，再選角色，送出後到下方卡片完成員工與 SSO 綁定。</p>
            </div>
            <span className="badge">不存 raw token</span>
          </div>
          <form action="/api/settings/access" method="post" className="wizard-form access-invite-form" aria-label="新增使用者">
            <input type="hidden" name="action" value="invite" />
            <fieldset className="form-card">
              <legend>1. 帳號資料</legend>
              <div className="field-grid">
                <label>
                  公司 Email
                  <input name="email" type="email" placeholder="new.user@hrone.test" required />
                </label>
                <label>
                  顯示名稱
                  <input name="displayName" placeholder="新進同仁" required />
                </label>
              </div>
              <p className="muted">允許網域：{workspace.allowedEmailDomains.join("、") || "未限制，正式環境建議設定"}</p>
            </fieldset>
            <fieldset className="form-card">
              <legend>2. 選擇角色</legend>
              <RoleCheckboxes defaultRoles={["employee"]} />
            </fieldset>
            <fieldset className="form-card">
              <legend>3. 建立邀請</legend>
              <p className="muted">建立後請到使用者卡片綁定員工主檔；所有角色與狀態變更都會寫入 audit log。</p>
              <button className="button primary" type="submit">
                建立邀請
              </button>
            </fieldset>
          </form>
        </section>

        <section className="panel span-12" id="access-users">
          <div className="section-heading">
            <div>
              <span className="muted">帳號、角色、員工與 SSO</span>
              <h2>使用者權限清單</h2>
              <p className="muted">卡片只放今天要處理的權限動作；薪資、銀行、身分證、健康資料不會出現在這裡。</p>
            </div>
            <span className="badge">{workspace.users.length} 個帳號</span>
          </div>
          {workspace.users.length === 0 ? (
            <EmptyState title="尚未建立帳號" body="先邀請 Owner 或 HR Admin，再完成員工主檔與 SSO 綁定。" />
          ) : (
            <div className="access-user-grid">
              {workspace.users.map((user) => (
                <article className={`access-user-card ${user.status}`} key={user.id}>
                  <div className="access-user-card-head">
                    <div>
                      <span className="muted">{user.email}</span>
                      <h3>{user.displayName}</h3>
                    </div>
                    <span className={`badge ${user.status === "suspended" ? "danger" : user.status === "invited" ? "warning" : ""}`}>
                      {statusLabel(user.status)}
                    </span>
                  </div>

                  <dl className="access-fact-grid">
                    <div>
                      <dt>角色</dt>
                      <dd>{user.roles.map(roleLabel).join("、")}</dd>
                    </div>
                    <div>
                      <dt>員工綁定</dt>
                      <dd>{user.employee ? `${user.employee.employeeNo} · ${user.employee.displayName}` : "尚未綁定"}</dd>
                    </div>
                    <div>
                      <dt>部門</dt>
                      <dd>{user.employee?.departmentName ?? "未指定"}</dd>
                    </div>
                    <div>
                      <dt>登入要求</dt>
                      <dd>{user.authRequirement === "sso" ? "需 SSO" : "密碼或 SSO"}</dd>
                    </div>
                  </dl>

                  <div className="access-user-actions">
                    <form action="/api/settings/access" method="post" className="access-inline-form" aria-label={`切換 ${user.displayName} 帳號狀態`}>
                      <input type="hidden" name="action" value="status" />
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="status" value={user.status === "suspended" ? "active" : "suspended"} />
                      <label className="access-status-reason">
                        {user.status === "suspended" ? "復用原因" : "停用原因"}
                        <textarea
                          name="statusReason"
                          rows={2}
                          placeholder={user.status === "suspended" ? "例：留停復職已完成權限複核" : "例：離職交接完成，停用登入"}
                          required
                        />
                        <small>audit log 僅保存原因 hash，不保存原文。</small>
                      </label>
                      <button className={`button ${user.status === "suspended" ? "" : "danger"}`} type="submit">
                        {user.status === "suspended" ? "復用帳號" : "停用帳號"}
                      </button>
                    </form>

                    <details className="access-edit-panel">
                      <summary>調整角色</summary>
                      <form action="/api/settings/access" method="post" className="mini-form compact-form" aria-label={`調整 ${user.displayName} 角色`}>
                        <input type="hidden" name="action" value="roles" />
                        <input type="hidden" name="userId" value={user.id} />
                        <RoleCheckboxes defaultRoles={user.roles} />
                        <button className="button primary" type="submit">
                          儲存角色
                        </button>
                      </form>
                    </details>

                    <details className="access-edit-panel" open={!user.employee}>
                      <summary>綁定員工</summary>
                      <form action="/api/settings/access" method="post" className="mini-form compact-form" aria-label={`綁定 ${user.displayName} 員工`}>
                        <input type="hidden" name="action" value="employee" />
                        <input type="hidden" name="userId" value={user.id} />
                        <label>
                          員工主檔
                          <select name="employeeId" defaultValue={user.employee?.id ?? ""}>
                            <option value="">不綁定 / 解除綁定</option>
                            {workspace.employees.map((employee) => (
                              <option
                                key={employee.id}
                                value={employee.id}
                                disabled={Boolean(employee.userId && employee.userId !== user.id)}
                              >
                                {employee.employeeNo} · {employee.displayName}
                                {employee.userId && employee.userId !== user.id ? "（已被其他帳號使用）" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="button primary" type="submit">
                          儲存員工綁定
                        </button>
                      </form>
                    </details>

                    <details className="access-edit-panel">
                      <summary>SSO 身分</summary>
                      <div className="access-sso-list">
                        {user.externalIdentities.length > 0 ? (
                          user.externalIdentities.map((identity) => (
                            <p key={identity.id}>
                              <strong>{identity.provider}</strong>
                              <span>{identity.issuer}</span>
                              <small>subject hash {identity.subjectHash}</small>
                            </p>
                          ))
                        ) : (
                          <p className="muted">尚未綁定 SSO 身分。</p>
                        )}
                      </div>
                      <form action="/api/settings/access" method="post" className="mini-form compact-form" aria-label={`綁定 ${user.displayName} SSO`}>
                        <input type="hidden" name="action" value="identity" />
                        <input type="hidden" name="userId" value={user.id} />
                        <div className="field-grid">
                          <label>
                            SSO 提供者
                            <input name="provider" placeholder="Entra ID" defaultValue={user.externalIdentities[0]?.provider ?? ""} required />
                          </label>
                          <label>
                            Issuer URL
                            <input name="issuer" type="url" placeholder="https://login.example.com/customer/v2.0" defaultValue={user.externalIdentities[0]?.issuer ?? ""} required />
                          </label>
                          <label>
                            Immutable subject
                            <input name="subject" placeholder="IdP subject / object id" required />
                          </label>
                        </div>
                        <button className="button primary" type="submit">
                          儲存 SSO 綁定
                        </button>
                      </form>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function RoleCheckboxes({ defaultRoles }: { defaultRoles: RoleKey[] }) {
  return (
    <div className="role-pill-grid">
      {roleKeys.map((role) => (
        <label className="check-row role-pill" key={role}>
          <input name="roles" type="checkbox" value={role} defaultChecked={defaultRoles.includes(role)} />
          <span>{roleLabel(role)}</span>
          <small>{roleDescription(role)}</small>
        </label>
      ))}
    </div>
  );
}

function buildAccessFocus(input: {
  unlinkedEmployeeCount: number;
  privilegedMissingSso: number;
  suspendedCount: number;
  roleCoverageCount: number;
}) {
  if (input.unlinkedEmployeeCount > 0) {
    return {
      title: "先補員工登入綁定",
      detail: `${input.unlinkedEmployeeCount} 位員工尚未綁定帳號，會影響前台任務、薪資單本人查看與主管線權限。`,
      href: "#access-users",
      label: "處理綁定",
      badge: `${input.unlinkedEmployeeCount} 人待綁`,
      tone: "warning" as const,
    };
  }
  if (input.privilegedMissingSso > 0) {
    return {
      title: "高權限帳號需補 SSO",
      detail: `${input.privilegedMissingSso} 個 Owner/HR/主管帳號尚未綁定企業 IdP。`,
      href: "#access-users",
      label: "補 SSO",
      badge: "SSO 待補",
      tone: "warning" as const,
    };
  }
  if (input.roleCoverageCount < roleKeys.length) {
    return {
      title: "核心角色測試帳號不足",
      detail: "上線前要能用 Owner、HR、主管、員工四種角色跑完整 smoke flow。",
      href: "#access-invite",
      label: "新增帳號",
      badge: "角色待補",
      tone: "warning" as const,
    };
  }
  return {
    title: input.suspendedCount ? "確認停用帳號原因" : "權限基礎已可試用",
    detail: input.suspendedCount
      ? "停用帳號需和人事異動、離職交接或支援存取紀錄對齊。"
      : "接下來可跑邀請 readiness 與薪資單 self-only 權限防漏。",
    href: input.suspendedCount ? "#access-users" : "/settings/pilot-invite-readiness",
    label: input.suspendedCount ? "檢查停用" : "跑邀請 Gate",
    badge: input.suspendedCount ? "需追蹤" : "Ready",
    tone: input.suspendedCount ? "warning" as const : "ready" as const,
  };
}

function statusLabel(status: string) {
  if (status === "active") return "啟用";
  if (status === "invited") return "已邀請";
  if (status === "suspended") return "已停用";
  return status;
}

function roleLabel(role: RoleKey) {
  const labels: Record<RoleKey, string> = {
    owner: "老闆/Owner",
    hr_admin: "人資 HR",
    manager: "主管",
    employee: "員工",
  };
  return labels[role];
}

function roleDescription(role: RoleKey) {
  const descriptions: Record<RoleKey, string> = {
    owner: "公司設定、權限與上線閘門",
    hr_admin: "人事、假勤、薪資與表單",
    manager: "團隊與統一簽核 Inbox",
    employee: "手機前台與本人資料",
  };
  return descriptions[role];
}

function successMessage(success: string) {
  if (success === "invite") return "使用者邀請已建立";
  if (success === "employee") return "帳號與員工主檔綁定已更新";
  if (success === "identity") return "SSO 身分已綁定";
  if (success === "roles") return "角色權限已更新";
  if (success === "status") return "帳號狀態已更新";
  return "權限設定已更新";
}

function localizeAccessError(error: string) {
  if (/domain/i.test(error)) return "Email 網域不在公司允許清單內，請先到資安設定補允許網域或改用公司信箱。";
  if (/already linked/i.test(error)) return "這位員工已綁定到其他帳號，請先解除原綁定再重試。";
  if (/Issuer/i.test(error)) return "Issuer 必須是有效的 HTTPS URL。";
  if (/settings:write/i.test(error)) return "目前角色沒有權限變更使用者與登入設定。";
  if (/active Owner/i.test(error)) return "系統必須保留至少一個已啟用的 Owner，請先新增或啟用另一個 Owner 再調整。";
  if (/Status change reason/i.test(error)) return "停用或復用帳號時必須填寫原因；系統只會保存原因 hash 作為 audit 證據。";
  return "請確認欄位、角色與員工綁定狀態後再試一次。";
}
