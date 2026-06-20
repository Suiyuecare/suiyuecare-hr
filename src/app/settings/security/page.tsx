import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoSession } from "@/server/auth/session";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import {
  getCompanySecuritySettings,
  hasSsoMetadata,
  type CompanySecuritySettings,
} from "@/server/settings/security";

type SearchParams = Promise<{ error?: string; success?: string }>;

export default async function SecuritySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, success }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    redirect(dashboardPathForRole(session.role));
  }

  const settings = await getCompanySecuritySettings(session);
  const focus = buildSecurityFocus(settings);
  const setupSteps = buildSecuritySteps(settings);
  const checklist = buildSecurityChecklist(settings);

  return (
    <main className="page security-settings-page">
      <section className="settings-control-hero security-settings-hero" aria-label="資安與登入政策工作台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="muted">Owner、人資與行政主管使用</span>
            <span className={`badge ${focus.tone === "ready" ? "" : "warning"}`}>{focus.badge}</span>
          </div>
          <h1>資安與登入政策工作台</h1>
          <p>
            把 MFA、SSO、公司 Email 網域、密碼規則與 session 逾時集中成三步設定；儲存時只寫入政策與非敏感中繼資料，正式登入憑證仍由企業 IdP 與部署保管庫管理。
          </p>
          <div className="settings-control-hero-actions">
            <a className="button primary" href="#security-policy-form">
              調整政策
            </a>
            <Link className="button" href="/settings/access">
              權限與登入中樞
            </Link>
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
        <section className="security-settings-alerts" aria-live="polite">
          <div className="panel success-panel">
            <strong>{successMessage(success)}</strong>
            <p>已寫入 company_security_settings audit log；頁面只顯示政策摘要，不顯示員工個資、薪資、銀行帳號或身分證資料。</p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="security-settings-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>資安設定未儲存</strong>
            <p>{localizeSecurityError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="settings-signal-board security-settings-signal-board" aria-label="資安政策訊號板">
        <article className={`settings-signal-card ${settings.mfaRequiredForAdmins ? "done" : "danger"}`}>
          <span>高權限 MFA</span>
          <strong>{settings.mfaRequiredForAdmins ? "必須" : "未強制"}</strong>
          <small>Owner、HR 與主管登入正式環境前，應先強制多因素驗證。</small>
        </article>
        <article className={`settings-signal-card ${settings.ssoEnabled && hasSsoMetadata(settings) ? "done" : "warning"}`}>
          <span>企業 SSO</span>
          <strong>{settings.ssoEnabled ? settings.ssoProvider ?? "已啟用" : "未啟用"}</strong>
          <small>{hasSsoMetadata(settings) ? "Issuer、Client ID 與 JWKS URL 已保存。" : "正式試用前需補齊 SSO 中繼資料。"}</small>
        </article>
        <article className={`settings-signal-card ${settings.allowedEmailDomains.length ? "done" : "danger"}`}>
          <span>Email 網域</span>
          <strong>{settings.allowedEmailDomains.length ? `${settings.allowedEmailDomains.length} 個` : "未限制"}</strong>
          <small>{settings.allowedEmailDomains.length ? settings.allowedEmailDomains.join(", ") : "邀請帳號前先限制公司網域。"}</small>
        </article>
        <article className={`settings-signal-card ${settings.idleTimeoutMinutes <= 60 ? "done" : "warning"}`}>
          <span>Session 逾時</span>
          <strong>{settings.idleTimeoutMinutes} 分鐘閒置</strong>
          <small>總時長 {settings.sessionTimeoutMinutes} 分鐘；薪資與個資操作會再檢查登入保障。</small>
        </article>
      </section>

      <section className="settings-command-grid security-setup-grid" aria-label="資安設定步驟">
        {setupSteps.map((step) => (
          <article className={`settings-command-card security-setup-card ${step.tone}`} key={step.title}>
            <div>
              <span className="muted">{step.stage}</span>
              <h2>{step.title}</h2>
            </div>
            <span className={`badge ${step.badgeClass}`}>{step.status}</span>
            <p>{step.detail}</p>
            <a className="button primary" href={step.href}>
              {step.actionLabel}
            </a>
            <div className="settings-command-links">
              {step.links.map((link) => (
                <Link href={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid">
        <section className="panel span-12" id="security-policy-form">
          <div className="section-heading">
            <div>
              <h2>三步資安設定精靈</h2>
              <p className="muted">先設定公司登入邊界，再設定 MFA 與 session，最後檢查權限、支援存取與 audit 證據。</p>
            </div>
            <span className="badge">Audited</span>
          </div>

          <form action="/api/settings/security" method="post" className="wizard-form security-settings-form" aria-label="三步資安設定精靈">
            <fieldset className="form-card security-settings-fieldset">
              <legend>1. 公司登入邊界</legend>
              <p className="muted">限制邀請與登入來源；SSO 欄位只保存非敏感中繼資料，實際憑證交給正式 IdP 與部署環境管理。</p>
              <label>
                允許 Email 網域
                <textarea
                  name="allowedEmailDomains"
                  rows={3}
                  defaultValue={settings.allowedEmailDomains.join(", ")}
                  placeholder="suiyuecare.com, hr.suiyuecare.com"
                />
              </label>
              <label className="check-row">
                <input name="ssoEnabled" type="checkbox" defaultChecked={settings.ssoEnabled} />
                啟用企業 SSO 政策
              </label>
              <div className="field-grid">
                <label>
                  SSO 供應商
                  <input name="ssoProvider" placeholder="Entra ID, Okta, Google Workspace" defaultValue={settings.ssoProvider ?? ""} />
                </label>
                <label>
                  Issuer URL
                  <input
                    name="ssoIssuerUrl"
                    type="url"
                    placeholder="https://login.example.com/customer/v2.0"
                    defaultValue={settings.ssoIssuerUrl ?? ""}
                  />
                </label>
                <label>
                  Client ID
                  <input name="ssoClientId" placeholder="public application id" defaultValue={settings.ssoClientId ?? ""} />
                </label>
                <label>
                  JWKS URL
                  <input
                    name="ssoJwksUrl"
                    type="url"
                    placeholder="https://login.example.com/discovery/keys"
                    defaultValue={settings.ssoJwksUrl ?? ""}
                  />
                </label>
              </div>
              <div className="security-domain-board" aria-label="目前允許登入網域">
                {settings.allowedEmailDomains.length ? (
                  settings.allowedEmailDomains.map((domain) => (
                    <span className="security-domain-chip" key={domain}>
                      {domain}
                    </span>
                  ))
                ) : (
                  <span className="security-domain-chip warning">尚未設定公司網域</span>
                )}
              </div>
            </fieldset>

            <fieldset className="form-card security-settings-fieldset">
              <legend>2. MFA、密碼與 session</legend>
              <p className="muted">正式登入供應商可覆寫更嚴格政策；HR One 先保存最低要求，敏感頁面會用這些設定判斷登入保障。</p>
              <div className="toggle-row">
                <label className="check-row">
                  <input name="mfaRequiredForAdmins" type="checkbox" defaultChecked={settings.mfaRequiredForAdmins} />
                  高權限角色必須 MFA
                </label>
                <label className="check-row">
                  <input name="mfaRequiredForEmployees" type="checkbox" defaultChecked={settings.mfaRequiredForEmployees} />
                  員工必須 MFA
                </label>
                <label className="check-row">
                  <input name="passwordRequiresNumber" type="checkbox" defaultChecked={settings.passwordRequiresNumber} />
                  密碼需包含數字
                </label>
                <label className="check-row">
                  <input name="passwordRequiresSymbol" type="checkbox" defaultChecked={settings.passwordRequiresSymbol} />
                  密碼需包含符號
                </label>
              </div>
              <div className="field-grid">
                <label>
                  密碼最小長度
                  <input name="passwordMinLength" type="number" min="8" max="128" defaultValue={settings.passwordMinLength} />
                </label>
                <label>
                  Session 總時長（分鐘）
                  <input name="sessionTimeoutMinutes" type="number" min="15" max="10080" defaultValue={settings.sessionTimeoutMinutes} />
                </label>
                <label>
                  閒置逾時（分鐘）
                  <input name="idleTimeoutMinutes" type="number" min="5" max={settings.sessionTimeoutMinutes} defaultValue={settings.idleTimeoutMinutes} />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-card security-settings-fieldset">
              <legend>3. 上線防漏檢查</legend>
              <p className="muted">這些項目不會自動替你通過上線，但能避免資安設定變成孤島。</p>
              <ul className="task-list security-settings-checklist">
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
              <div className="security-policy-note">
                <strong>敏感資料護欄</strong>
                <p>請勿在任何設定欄位貼上薪資、銀行帳號、身分證字號、健康資料、登入 token 或私人員工備註；系統只需要政策、URL 與公開識別碼。</p>
              </div>
              <button className="button primary" type="submit">
                儲存資安設定
              </button>
            </fieldset>
          </form>
        </section>
      </section>
    </main>
  );
}

function buildSecurityFocus(settings: CompanySecuritySettings) {
  if (!settings.allowedEmailDomains.length) {
    return {
      badge: "Email 網域待補",
      tone: "warning" as const,
      title: "先限制公司 Email 網域",
      detail: "邀請帳號前先限定公司網域，避免外部信箱拿到員工、薪資或文件入口。",
      href: "#security-policy-form",
      label: "設定網域",
    };
  }

  if (!settings.mfaRequiredForAdmins) {
    return {
      badge: "高權限 MFA 待補",
      tone: "warning" as const,
      title: "先強制高權限 MFA",
      detail: "Owner、HR 與主管會接觸薪資、個資與簽核資料，上線前必須有更高登入保障。",
      href: "#security-policy-form",
      label: "啟用 MFA",
    };
  }

  if (!settings.ssoEnabled || !hasSsoMetadata(settings)) {
    return {
      badge: "SSO 待補",
      tone: "warning" as const,
      title: "補企業 SSO 中繼資料",
      detail: "正式導入時要接企業 IdP，才能用公司身份政策處理離職停權、MFA 與高權限登入。",
      href: "#security-policy-form",
      label: "補 SSO",
    };
  }

  if (settings.idleTimeoutMinutes > 60) {
    return {
      badge: "Session 可再收斂",
      tone: "warning" as const,
      title: "縮短閒置逾時",
      detail: "薪資與個資頁面不應長時間維持登入狀態，建議先壓到 60 分鐘內。",
      href: "#security-policy-form",
      label: "調整 session",
    };
  }

  return {
    badge: "資安政策已就緒",
    tone: "ready" as const,
    title: "檢查權限與上線閘門",
    detail: "登入政策已具備基本防護，下一步確認高權限帳號、支援存取、audit 與正式環境 readiness。",
    href: "/settings/readiness",
    label: "看上線閘門",
  };
}

function buildSecuritySteps(settings: CompanySecuritySettings) {
  const ssoReady = settings.ssoEnabled && hasSsoMetadata(settings);
  return [
    {
      stage: "Step 1",
      title: "登入邊界",
      status: settings.allowedEmailDomains.length ? "已限制" : "待補",
      badgeClass: settings.allowedEmailDomains.length ? "" : "warning",
      tone: settings.allowedEmailDomains.length ? "ready" : "warning",
      detail: "公司 Email 網域與 SSO metadata 先定義清楚，權限邀請與正式身份才有一致邊界。",
      href: "#security-policy-form",
      actionLabel: "設定邊界",
      links: [
        { href: "/settings/access", label: "邀請與綁定" },
        { href: "/settings/pilot-invite-readiness", label: "邀請 Gate" },
      ],
    },
    {
      stage: "Step 2",
      title: "登入保障",
      status: settings.mfaRequiredForAdmins ? "MFA" : "未強制",
      badgeClass: settings.mfaRequiredForAdmins ? "" : "danger",
      tone: settings.mfaRequiredForAdmins ? "ready" : "danger",
      detail: "高權限 MFA、密碼下限與 session 逾時是薪資、個資與管理設定的第一層保護。",
      href: "#security-policy-form",
      actionLabel: "調整 MFA",
      links: [
        { href: "/settings/privacy", label: "個資治理" },
        { href: "/settings/support-access", label: "支援存取" },
      ],
    },
    {
      stage: "Step 3",
      title: "SSO 串接",
      status: ssoReady ? "已具備" : "待補",
      badgeClass: ssoReady ? "" : "warning",
      tone: ssoReady ? "ready" : "warning",
      detail: "Issuer、Client ID 與 JWKS URL 讓正式 auth provider 可接上，不需要在程式碼硬寫租戶身份規則。",
      href: "#security-policy-form",
      actionLabel: "補 SSO",
      links: [
        { href: "/auth/sign-in", label: "登入入口" },
        { href: "/settings/audit", label: "Audit log" },
      ],
    },
    {
      stage: "Ongoing",
      title: "權限防漏",
      status: "稽核",
      badgeClass: "",
      tone: "ready",
      detail: "資安政策必須連到 RBAC、ABAC、支援存取與 audit log，避免正式客戶資料從例外流程漏出去。",
      href: "/settings/access",
      actionLabel: "檢查帳號",
      links: [
        { href: "/settings/readiness", label: "上線閘門" },
        { href: "/settings/operational-resilience", label: "備份還原" },
      ],
    },
  ];
}

function buildSecurityChecklist(settings: CompanySecuritySettings) {
  return [
    {
      title: "允許網域已設定",
      detail: settings.allowedEmailDomains.length
        ? `目前限制為 ${settings.allowedEmailDomains.join(", ")}。`
        : "尚未限制公司信箱網域，正式邀請前必須補上。",
      ready: settings.allowedEmailDomains.length > 0,
    },
    {
      title: "高權限 MFA 已強制",
      detail: settings.mfaRequiredForAdmins
        ? "Owner、HR 與主管需具備 MFA 登入保障。"
        : "高權限角色尚未強制 MFA，不建議開放正式薪資與個資操作。",
      ready: settings.mfaRequiredForAdmins,
    },
    {
      title: "SSO 中繼資料已補齊",
      detail: hasSsoMetadata(settings)
        ? "已保存非敏感 SSO metadata，可銜接正式 auth provider。"
        : "需補 Issuer、Client ID、JWKS URL 與供應商名稱。",
      ready: settings.ssoEnabled && hasSsoMetadata(settings),
    },
    {
      title: "閒置逾時小於等於 60 分鐘",
      detail: `目前閒置逾時為 ${settings.idleTimeoutMinutes} 分鐘，session 總時長為 ${settings.sessionTimeoutMinutes} 分鐘。`,
      ready: settings.idleTimeoutMinutes <= 60,
    },
  ];
}

function successMessage(success: string) {
  if (success === "security") return "資安設定已儲存";
  return "設定已更新";
}

function localizeSecurityError(error: string) {
  if (/settings:write/i.test(error)) return "目前角色沒有權限變更資安設定。";
  if (/https/i.test(error) || /url/i.test(error)) return "SSO Issuer 與 JWKS 必須使用有效 HTTPS URL。";
  return "請確認 Email 網域、SSO URL、密碼與 session 數字後再試一次。";
}
