"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type SignInState = "idle" | "sending" | "sent" | "error";

export default function SignInPage() {
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
    <main className="page">
      <section className="page-header">
        <h1>公司登入</h1>
        <p>請使用人資已建立的公司 Email。正式試用環境不開放示範角色切換。</p>
      </section>

      <section className="panel auth-panel">
        <h2>取得登入連結</h2>
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
        {message ? (
          <p className={`muted ${state === "error" ? "danger-text" : ""}`} role="status">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
