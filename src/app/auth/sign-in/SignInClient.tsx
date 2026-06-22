"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type SignInState = "idle" | "redirecting" | "sending" | "sent" | "error";
type QuickLoginRole = "owner" | "hr_admin" | "manager" | "employee";

export type QuickLoginAccount = {
  role: QuickLoginRole;
  title: string;
  subtitle: string;
  buttonLabel: string;
};

type SignInClientProps = {
  quickAccounts: QuickLoginAccount[];
  quickLoginUnavailableReason?: string;
};

export default function SignInClient({ quickAccounts, quickLoginUnavailableReason }: SignInClientProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SignInState>("idle");
  const [message, setMessage] = useState("");
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }, []);

  async function signInWithGoogle() {
    setState("redirecting");
    setMessage("");

    if (!supabase) {
      setState("error");
      setMessage("目前尚未設定登入服務，請聯絡系統管理員。");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setState("error");
      setMessage("無法開啟 Google 登入。請稍後再試，或聯絡系統管理員。");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setMessage("");

    if (!supabase) {
      setState("error");
      setMessage("目前尚未設定登入服務，請聯絡系統管理員。");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setState("error");
      setMessage("請輸入有效的公司 Email。");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setState("error");
      setMessage("無法寄出登入連結。請確認 Email 已由人資建立，或稍後再試。");
      return;
    }

    setState("sent");
    setMessage("登入連結已寄出，請到信箱開啟連結完成登入。");
  }

  return (
    <main className="auth-portal-page" aria-label="HR One 公司登入">
      <section className="auth-portal-card">
        <div className="auth-portal-info">
          <div className="auth-portal-brand">
            <span aria-hidden="true">HR</span>
            <div>
              <strong>歲悅長照集團</strong>
              <small>SUIYUECARE HR PORTAL</small>
            </div>
          </div>

          <div className="auth-portal-copy">
            <span className="auth-overline">INTERNAL ACCESS</span>
            <h1>
              <span>HR One</span>
              <span>人資工作台</span>
            </h1>
            <p>登入後依職等、角色、組織節點與資料範圍，載入員工前台、主管簽核與 HR 後台。</p>
          </div>

          <dl className="auth-portal-facts" aria-label="登入與權限摘要">
            <div>
              <dt>登入方式</dt>
              <dd>Google / Email</dd>
            </div>
            <div>
              <dt>權限模型</dt>
              <dd>RBAC + Data Scope</dd>
            </div>
            <div>
              <dt>資料範圍</dt>
              <dd>依組織圖控管</dd>
            </div>
          </dl>
        </div>

        <div className="auth-portal-signin">
          <span>SIGN IN</span>
          <h2>帳號登入</h2>
          <p>請使用公司 Google 帳號登入。</p>
          <button
            className="google-signin-button"
            type="button"
            onClick={signInWithGoogle}
            disabled={state === "redirecting"}
          >
            <span aria-hidden="true">G</span>
            {state === "redirecting" ? "前往 Google" : "使用 Google 登入"}
          </button>

          {quickAccounts.length > 0 ? (
            <section className="auth-quick-login" aria-label="示範帳號快速登入">
              <header>
                <strong>快速登入</strong>
                <small>選一種身分直接進入</small>
              </header>
              <div className="auth-quick-grid">
                {quickAccounts.map((account) => (
                  <form key={account.role} action="/api/demo/switch-role" method="post" className="auth-quick-account">
                    <input type="hidden" name="role" value={account.role} />
                    <strong>{account.title}</strong>
                    <small>{account.subtitle}</small>
                    <button className="button primary" type="submit">
                      {account.buttonLabel}
                    </button>
                  </form>
                ))}
              </div>
            </section>
          ) : quickLoginUnavailableReason ? (
            <p className="auth-quick-note">快速登入僅開放試用環境。</p>
          ) : null}

          <details className="auth-email-fallback">
            <summary>使用 Email 登入連結</summary>
            <form className="mini-form" onSubmit={submit}>
              <label>
                公司 Email
                <input
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  required
                />
              </label>
              <button className="button primary" type="submit" disabled={state === "sending"}>
                {state === "sending" ? "寄送中" : "寄送登入連結"}
              </button>
            </form>
          </details>

          {message ? (
            <p className={`auth-message ${state === "error" ? "danger-text" : ""}`} role="status">
              {message}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
