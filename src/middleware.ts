import { NextResponse, type NextRequest } from "next/server";
import {
  clientIdentifierFromHeaders,
  enforceApiRateLimit,
  resolveRateLimitConfig,
  type RateLimitStore,
} from "@/server/security/rate-limit";
import { evaluateMutationOrigin } from "@/server/security/request-origin";

const rateLimitStore: RateLimitStore = new Map();

export async function middleware(request: NextRequest) {
  const rateLimitDecision = await enforceApiRateLimit({
    method: request.method,
    pathname: request.nextUrl.pathname,
    clientIdentifier: clientIdentifierFromHeaders({
      cfConnectingIp: request.headers.get("cf-connecting-ip"),
      forwardedFor: request.headers.get("x-forwarded-for"),
      realIp: request.headers.get("x-real-ip"),
    }),
    nowMs: Date.now(),
    store: rateLimitStore,
    config: resolveRateLimitConfig(process.env),
  });

  if (!rateLimitDecision.allowed) {
    const providerUnavailable = rateLimitDecision.reason === "provider_unavailable";
    return NextResponse.json(
      {
        error: providerUnavailable ? "Rate limit provider unavailable." : "Too many requests.",
      },
      {
        status: providerUnavailable ? 503 : 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimitDecision.retryAfterSeconds),
          "X-RateLimit-Limit": String(rateLimitDecision.limit),
          "X-RateLimit-Remaining": String(rateLimitDecision.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rateLimitDecision.resetAtMs / 1_000)),
        },
      },
    );
  }

  const decision = evaluateMutationOrigin({
    method: request.method,
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    secFetchSite: request.headers.get("sec-fetch-site"),
  });

  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: "Cross-origin mutation blocked.",
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
