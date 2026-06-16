import { getSafeAuthLoginUrl } from "@/server/auth/login-url";

export default function AuthRequiredPage() {
  const loginUrl = getSafeAuthLoginUrl();

  return (
    <main className="page">
      <section className="page-header">
        <h1>需要正式登入</h1>
        <p>正式試用環境已停用示範角色切換。請使用公司 SSO 或由管理員提供的正式登入入口。</p>
      </section>

      <section className="panel">
        <h2>無法使用示範模式</h2>
        <p className="muted">
          HR One 在 production 只接受已驗證的 tenant session；這能避免員工、主管、人資或薪資資料被錯誤的示範身分讀取。
        </p>
        {loginUrl ? (
          <a className="button primary" href={loginUrl}>
            前往公司 SSO 登入
          </a>
        ) : (
          <p className="muted">目前尚未設定正式 SSO 登入網址，請聯絡系統管理員。</p>
        )}
      </section>
    </main>
  );
}
