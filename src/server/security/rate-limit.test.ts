import { describe, expect, it } from "vitest";
import {
  clientIdentifierFromHeaders,
  enforceApiRateLimit,
  evaluateApiRateLimit,
  resolveRateLimitConfig,
  type RateLimitConfig,
  type RateLimitStore,
} from "@/server/security/rate-limit";

describe("API rate limiter", () => {
  it("allows safe methods without consuming the mutation limit", () => {
    const store: RateLimitStore = new Map();
    const decision = evaluateApiRateLimit({
      method: "GET",
      pathname: "/api/payroll/create",
      clientIdentifier: "203.0.113.10",
      nowMs: 1_000,
      store,
      config: config({ maxRequests: 10 }),
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "safe_method",
      remaining: 10,
    });
    expect(store.size).toBe(0);
  });

  it("blocks unsafe API requests after the configured window limit", () => {
    const store: RateLimitStore = new Map();
    const rateLimitConfig = config({ maxRequests: 10 });

    for (let index = 0; index < 10; index += 1) {
      expect(evaluateApiRateLimit({
        method: "POST",
        pathname: "/api/payroll/create",
        clientIdentifier: "203.0.113.10",
        nowMs: 1_000,
        store,
        config: rateLimitConfig,
      }).allowed).toBe(true);
    }

    const blocked = evaluateApiRateLimit({
      method: "POST",
      pathname: "/api/payroll/create",
      clientIdentifier: "203.0.113.10",
      nowMs: 2_000,
      store,
      config: rateLimitConfig,
    });

    expect(blocked).toMatchObject({
      allowed: false,
      reason: "limit_exceeded",
      remaining: 0,
      retryAfterSeconds: 58,
    });
  });

  it("resets request counts after the configured window", () => {
    const store: RateLimitStore = new Map();
    const rateLimitConfig = config({ windowSeconds: 10, maxRequests: 10 });

    for (let index = 0; index < 10; index += 1) {
      evaluateApiRateLimit({
        method: "POST",
        pathname: "/api/workflows/leave",
        clientIdentifier: "203.0.113.10",
        nowMs: 9_000,
        store,
        config: rateLimitConfig,
      });
    }

    const nextWindow = evaluateApiRateLimit({
      method: "POST",
      pathname: "/api/workflows/leave",
      clientIdentifier: "203.0.113.10",
      nowMs: 10_000,
      store,
      config: rateLimitConfig,
    });

    expect(nextWindow).toMatchObject({
      allowed: true,
      reason: "within_limit",
      remaining: 9,
      retryAfterSeconds: 10,
    });
  });

  it("uses stricter buckets for AI, imports, and authentication-adjacent endpoints", () => {
    const rateLimitConfig = config({ maxRequests: 600 });

    expect(decisionFor("/api/ai/policy", rateLimitConfig).limit).toBe(60);
    expect(decisionFor("/api/employees/import", rateLimitConfig).limit).toBe(120);
    expect(decisionFor("/api/demo/switch-role", rateLimitConfig).limit).toBe(120);
    expect(decisionFor("/api/workflows/leave", rateLimitConfig).limit).toBe(600);
  });

  it("resolves bounded config from environment variables", () => {
    expect(resolveRateLimitConfig({
      HR_ONE_RATE_LIMIT_ENABLED: "false",
      HR_ONE_RATE_LIMIT_WINDOW_SECONDS: "2",
      HR_ONE_RATE_LIMIT_MAX_REQUESTS: "20000",
    })).toEqual({
      enabled: false,
      provider: "memory",
      windowSeconds: 10,
      maxRequests: 10_000,
      externalEndpoint: null,
      externalToken: null,
    });
  });

  it("delegates unsafe requests to an external HTTP provider without sending raw identifiers", async () => {
    let requestBody: unknown;
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        allowed: true,
        remaining: 12,
        resetAtMs: 61_000,
        retryAfterSeconds: 0,
      });
    };

    const decision = await enforceApiRateLimit({
      method: "POST",
      pathname: "/api/ai/policy",
      clientIdentifier: "203.0.113.10",
      nowMs: 1_000,
      store: new Map(),
      config: config({
        provider: "external_http",
        externalEndpoint: "https://limits.customer.example/check",
        externalToken: "runtime-secret-token",
      }),
      fetcher,
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "within_limit",
      bucket: "ai",
      limit: 60,
      remaining: 12,
    });
    expect(requestBody).toMatchObject({
      bucket: "ai",
      limit: 60,
      windowSeconds: 60,
      nowMs: 1_000,
    });
    expect(JSON.stringify(requestBody)).not.toContain("203.0.113.10");
  });

  it("fails closed when the external HTTP provider is unavailable", async () => {
    const decision = await enforceApiRateLimit({
      method: "POST",
      pathname: "/api/workflows/leave",
      clientIdentifier: "203.0.113.10",
      nowMs: 1_000,
      store: new Map(),
      config: config({
        provider: "external_http",
        externalEndpoint: "https://limits.customer.example/check",
      }),
      fetcher: async () => new Response("unavailable", { status: 503 }),
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "provider_unavailable",
      remaining: 0,
    });
  });

  it("derives a client identifier without logging or returning raw request details", () => {
    expect(clientIdentifierFromHeaders({
      cfConnectingIp: null,
      forwardedFor: "203.0.113.10, 198.51.100.8",
      realIp: "198.51.100.9",
    })).toBe("203.0.113.10");

    expect(clientIdentifierFromHeaders({})).toBe("unknown-client");
  });
});

function decisionFor(pathname: string, rateLimitConfig: RateLimitConfig) {
  return evaluateApiRateLimit({
    method: "POST",
    pathname,
    clientIdentifier: "203.0.113.10",
    nowMs: 1_000,
    store: new Map(),
    config: rateLimitConfig,
  });
}

function config(overrides: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return {
    enabled: true,
    provider: "memory",
    windowSeconds: 60,
    maxRequests: 600,
    externalEndpoint: null,
    externalToken: null,
    ...overrides,
  };
}
