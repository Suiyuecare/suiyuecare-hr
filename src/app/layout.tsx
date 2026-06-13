import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getDemoSession } from "@/server/auth/demo-session";
import { evaluateAuthPolicy } from "@/server/auth/policy";
import { roleKeys } from "@/server/auth/rbac";
import { getCompanySecuritySettingsForAuth } from "@/server/settings/security";

export const metadata: Metadata = {
  title: "HR One",
  description: "AI Native HR Operating System foundation for Taiwan companies",
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
              <Link href="/" className="brand" aria-label="HR One home">
                <strong>HR One</strong>
                <span>AI Native HR OS</span>
              </Link>
              <div className="auth-assurance" aria-label="Authentication assurance">
                <span className={`badge ${authEvaluation.allowed ? "" : "warning"}`}>
                  {authEvaluation.allowed ? "Auth verified" : authEvaluation.status.replace("_", " ")}
                </span>
                <small>
                  {authAssurance?.method ?? "unknown"} · MFA {authAssurance?.mfaVerified ? "yes" : "no"}
                </small>
              </div>
              <form action="/api/demo/switch-role" method="post" className="role-switcher">
                <label className="muted" htmlFor="role">
                  Demo role
                </label>
                <select id="role" name="role" defaultValue={session.role}>
                  {roleKeys.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button className="button primary" type="submit">
                  Switch
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
