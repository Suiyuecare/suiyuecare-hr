"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type CallbackState = "checking" | "failed";

export default function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>("checking");
  const [message, setMessage] = useState("正在確認登入狀態");

  useEffect(() => {
    let cancelled = false;

    async function establishSession() {
      const token = await readAccessToken();
      if (!token) {
        if (!cancelled) {
          setState("failed");
          setMessage("登入連結沒有有效憑證，請重新寄送登入連結。");
        }
        return;
      }

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const body = await response.json().catch(() => ({})) as { redirectTo?: string };
      if (!response.ok) {
        if (!cancelled) {
          setState("failed");
          setMessage("登入驗證未通過。請確認帳號已由人資建立，或聯絡系統管理員。");
        }
        return;
      }

      window.location.replace(body.redirectTo ?? "/app");
    }

    establishSession().catch(() => {
      if (!cancelled) {
        setState("failed");
        setMessage("登入流程暫時無法完成，請稍後再試。");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <section className="page-header">
        <h1>{state === "checking" ? "正在登入" : "登入失敗"}</h1>
        <p>{message}</p>
      </section>
      {state === "failed" ? (
        <section className="panel">
          <a className="button primary" href="/auth/sign-in">
            重新取得登入連結
          </a>
        </section>
      ) : null}
    </main>
  );
}

async function readAccessToken() {
  const hashToken = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access_token");
  if (hashToken) return hashToken;

  const supabase = createSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
