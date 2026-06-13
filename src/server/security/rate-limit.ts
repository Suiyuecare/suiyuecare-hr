export type RateLimitConfig = {
  enabled: boolean;
  provider: string;
  windowSeconds: number;
  maxRequests: number;
  externalEndpoint: string | null;
  externalToken: string | null;
};

export type RateLimitDecision = {
  allowed: boolean;
  reason: "safe_method" | "disabled" | "within_limit" | "limit_exceeded" | "provider_unavailable";
  bucket: string;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
};

type RateLimitEntry = {
  count: number;
  resetAtMs: number;
};

export type RateLimitStore = Map<string, RateLimitEntry>;

type ExternalRateLimitResponse = {
  allowed?: unknown;
  remaining?: unknown;
  resetAtMs?: unknown;
  retryAfterSeconds?: unknown;
};

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const defaultWindowSeconds = 60;
const defaultMaxRequests = 600;
const minimumWindowSeconds = 10;
const maximumWindowSeconds = 3_600;
const minimumMaxRequests = 10;
const maximumMaxRequests = 10_000;

export function resolveRateLimitConfig(env: Record<string, string | undefined>): RateLimitConfig {
  return {
    enabled: env.HR_ONE_RATE_LIMIT_ENABLED !== "false",
    provider: env.HR_ONE_RATE_LIMIT_PROVIDER?.trim() || "memory",
    windowSeconds: boundedInteger(
      env.HR_ONE_RATE_LIMIT_WINDOW_SECONDS,
      defaultWindowSeconds,
      minimumWindowSeconds,
      maximumWindowSeconds,
    ),
    maxRequests: boundedInteger(
      env.HR_ONE_RATE_LIMIT_MAX_REQUESTS,
      defaultMaxRequests,
      minimumMaxRequests,
      maximumMaxRequests,
    ),
    externalEndpoint: optionalText(env.HR_ONE_RATE_LIMIT_HTTP_ENDPOINT),
    externalToken: optionalText(env.HR_ONE_RATE_LIMIT_HTTP_TOKEN),
  };
}

export async function enforceApiRateLimit(input: {
  method: string;
  pathname: string;
  clientIdentifier: string | null;
  nowMs: number;
  store: RateLimitStore;
  config: RateLimitConfig;
  fetcher?: typeof fetch;
}): Promise<RateLimitDecision> {
  const bucket = classifyRateLimitBucket(input.pathname);
  const limit = limitForBucket(bucket, input.config.maxRequests);
  const resetAtMs = nextResetAt(input.nowMs, input.config.windowSeconds);

  if (safeMethods.has(input.method.toUpperCase())) {
    return decision(true, "safe_method", bucket, limit, limit, resetAtMs, input.nowMs);
  }

  if (!input.config.enabled) {
    return decision(true, "disabled", bucket, limit, limit, resetAtMs, input.nowMs);
  }

  if (input.config.provider !== "external_http") {
    return evaluateApiRateLimit(input);
  }

  if (!input.config.externalEndpoint) {
    return decision(false, "provider_unavailable", bucket, limit, 0, resetAtMs, input.nowMs);
  }

  try {
    const response = await (input.fetcher ?? fetch)(input.config.externalEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.config.externalToken
          ? { Authorization: `Bearer ${input.config.externalToken}` }
          : {}),
      },
      body: JSON.stringify({
        bucket,
        keyHash: await hashRateLimitKey(`${bucket}:${input.clientIdentifier || "unknown-client"}`),
        limit,
        windowSeconds: input.config.windowSeconds,
        nowMs: input.nowMs,
      }),
    });

    if (!response.ok) {
      return decision(false, "provider_unavailable", bucket, limit, 0, resetAtMs, input.nowMs);
    }

    const payload = (await response.json()) as ExternalRateLimitResponse;
    const externalResetAtMs = numberOr(payload.resetAtMs, resetAtMs);
    const externalRemaining = boundedNumber(numberOr(payload.remaining, 0), 0, limit);
    const allowed = payload.allowed === true;

    return {
      ...decision(
        allowed,
        allowed ? "within_limit" : "limit_exceeded",
        bucket,
        limit,
        externalRemaining,
        externalResetAtMs,
        input.nowMs,
      ),
      retryAfterSeconds: numberOr(
        payload.retryAfterSeconds,
        Math.max(Math.ceil((externalResetAtMs - input.nowMs) / 1_000), 0),
      ),
    };
  } catch {
    return decision(false, "provider_unavailable", bucket, limit, 0, resetAtMs, input.nowMs);
  }
}

export function evaluateApiRateLimit(input: {
  method: string;
  pathname: string;
  clientIdentifier: string | null;
  nowMs: number;
  store: RateLimitStore;
  config: RateLimitConfig;
}): RateLimitDecision {
  const bucket = classifyRateLimitBucket(input.pathname);
  const limit = limitForBucket(bucket, input.config.maxRequests);
  const resetAtMs = nextResetAt(input.nowMs, input.config.windowSeconds);

  if (safeMethods.has(input.method.toUpperCase())) {
    return decision(true, "safe_method", bucket, limit, limit, resetAtMs, input.nowMs);
  }

  if (!input.config.enabled) {
    return decision(true, "disabled", bucket, limit, limit, resetAtMs, input.nowMs);
  }

  pruneExpiredEntries(input.store, input.nowMs);

  const key = rateLimitKey({
    bucket,
    clientIdentifier: input.clientIdentifier,
    windowStartMs: resetAtMs - input.config.windowSeconds * 1_000,
  });
  const current = input.store.get(key);
  const count = current?.count ?? 0;

  if (count >= limit) {
    return decision(false, "limit_exceeded", bucket, limit, 0, current?.resetAtMs ?? resetAtMs, input.nowMs);
  }

  const nextCount = count + 1;
  input.store.set(key, { count: nextCount, resetAtMs });

  return decision(
    true,
    "within_limit",
    bucket,
    limit,
    Math.max(limit - nextCount, 0),
    resetAtMs,
    input.nowMs,
  );
}

export function clientIdentifierFromHeaders(input: {
  cfConnectingIp?: string | null;
  forwardedFor?: string | null;
  realIp?: string | null;
}) {
  const identifier = input.cfConnectingIp ?? firstForwardedFor(input.forwardedFor) ?? input.realIp;
  return identifier?.trim() || "unknown-client";
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function classifyRateLimitBucket(pathname: string) {
  if (pathname.startsWith("/api/ai/")) return "ai";
  if (pathname.includes("/import") || pathname.includes("profile-import")) return "import";
  if (pathname.includes("/auth") || pathname.includes("/demo/switch-role")) return "auth";
  return "api";
}

function limitForBucket(bucket: string, configuredMaxRequests: number) {
  if (bucket === "ai") return Math.min(configuredMaxRequests, 60);
  if (bucket === "import") return Math.min(configuredMaxRequests, 120);
  if (bucket === "auth") return Math.min(configuredMaxRequests, 120);
  return configuredMaxRequests;
}

function nextResetAt(nowMs: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1_000;
  return Math.floor(nowMs / windowMs) * windowMs + windowMs;
}

function rateLimitKey(input: {
  bucket: string;
  clientIdentifier: string | null;
  windowStartMs: number;
}) {
  return `${input.bucket}:${input.clientIdentifier || "unknown-client"}:${input.windowStartMs}`;
}

function pruneExpiredEntries(store: RateLimitStore, nowMs: number) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAtMs <= nowMs) {
      store.delete(key);
    }
  }
}

function decision(
  allowed: boolean,
  reason: RateLimitDecision["reason"],
  bucket: string,
  limit: number,
  remaining: number,
  resetAtMs: number,
  nowMs: number,
): RateLimitDecision {
  return {
    allowed,
    reason,
    bucket,
    limit,
    remaining,
    resetAtMs,
    retryAfterSeconds: Math.max(Math.ceil((resetAtMs - nowMs) / 1_000), 0),
  };
}

function firstForwardedFor(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || null;
}

async function hashRateLimitKey(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
