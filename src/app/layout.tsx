import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getDemoSession } from "@/server/auth/demo-session";
import { evaluateAuthPolicy } from "@/server/auth/policy";
import { roleKeys } from "@/server/auth/rbac";
import { getCompanySecuritySettingsForAuth } from "@/server/settings/security";

export const metadata: Metadata = {
  title: "HR One",
  description: "為台灣企業打造的 AI 原生人資作業系統",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getDemoSession();
  const securitySettings = await getCompanySecuritySettingsForAuth(session);
  const authEvaluation = evaluateAuthPolicy(session, securitySettings);
  const authAssurance = "authAssurance" in session ? session.authAssurance : undefined;

  return (
    <html lang="zh-Hant">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-inner">
              <Link href="/" className="brand" aria-label="HR One 首頁">
                <strong>HR One</strong>
                <span>AI 原生人資作業系統</span>
              </Link>
              <div className="auth-assurance" aria-label="登入安全狀態">
                <span className={`badge ${authEvaluation.allowed ? "" : "warning"}`}>
                  {authEvaluation.allowed ? "登入已驗證" : translateAuthStatus(authEvaluation.status)}
                </span>
                <small>
                  {translateAuthMethod(authAssurance?.method)} · 多因素驗證{" "}
                  {authAssurance?.mfaVerified ? "已完成" : "未完成"}
                </small>
              </div>
              <nav className="topbar-nav" aria-label="主要系統切換">
                <Link href="/app">員工前台</Link>
                <Link href="/console">管理後台</Link>
              </nav>
              <form action="/api/demo/switch-role" method="post" className="role-switcher">
                <label className="muted" htmlFor="role">
                  示範角色
                </label>
                <select id="role" name="role" defaultValue={session.role}>
                  {roleKeys.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
                <button className="button primary" type="submit">
                  切換
                </button>
              </form>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

function roleLabel(role: string) {
  if (role === "owner") return "老闆";
  if (role === "hr_admin") return "人資管理員";
  if (role === "manager") return "主管";
  return "員工";
}

function translateAuthMethod(method?: string) {
  if (!method) return "未知登入方式";
  if (method === "demo_cookie") return "示範登入";
  return method;
}

function translateAuthStatus(status: string) {
  const labels: Record<string, string> = {
    allowed: "登入已驗證",
    mfa_required: "需要多因素驗證",
    sso_required: "需要單一登入",
    denied: "登入未通過",
  };
  return labels[status] ?? status.replace("_", " ");
}
