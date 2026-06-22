import { getSafeAuthLoginUrl } from "@/server/auth/login-url";

export default function AuthRequiredPage() {
  const loginUrl = getSafeAuthLoginUrl();

  return (
    <main className="auth-portal-page auth-status-page">
      <section className="auth-status-card">
        <span>INTERNAL ACCESS</span>
        <h1>需要正式登入</h1>
        <p>請使用公司 Google 帳號登入 HR One。系統會依員工帳號、角色與組織資料載入可用工作台。</p>
        {loginUrl ? (
          <a className="button primary" href={loginUrl}>
            前往正式登入
          </a>
        ) : (
          <a className="button primary" href="/auth/sign-in">
            前往帳號登入
          </a>
        )}
      </section>
    </main>
  );
}
