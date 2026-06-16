export function getSafeAuthLoginUrl(env: Record<string, string | undefined> = process.env) {
  const value = env.HR_ONE_AUTH_LOGIN_URL?.trim();
  return isSafeAuthLoginUrl(value) ? value : null;
}

export function isSafeAuthLoginUrl(value: string | null | undefined) {
  if (!value || hasWeakValue(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isLocalHost(url.hostname);
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function hasWeakValue(value: string) {
  return /changeme|change-me|replace|placeholder|example|demo|test|localhost|password/i.test(value);
}
