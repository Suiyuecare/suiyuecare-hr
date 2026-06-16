import { getSafeAuthLoginUrl } from "@/server/auth/login-url";

export default function AuthRequiredPage() {
  const loginUrl = getSafeAuthLoginUrl();

  return (
    <main className="page">
      <section className="page-header">
        <h1>需要正式登入</h1>
        <p>正式試用環境已停用示範角色切換。請使用公司正式登入入口，或聯絡管理員協助。</p>
      </section>

      <section className="panel">
        <h2>無法使用示範模式</h2>
        <p className="muted">
          HR One 在 production 只接受已驗證的 tenant session；這能避免員工、主管、人資或薪資資料被錯誤的示範身分讀取。
        </p>
        {loginUrl ? (
          <a className="button primary" href={loginUrl}>
            前往正式登入
          </a>
        ) : (
          <a className="button primary" href="/auth/sign-in">
            使用公司 Email 登入
          </a>
        )}
      </section>
    </main>
  );
}
