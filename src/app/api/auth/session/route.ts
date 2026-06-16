import { NextResponse } from "next/server";
import { oidcConfigFromEnv, verifyOidcJwt } from "@/server/auth/oidc";
import { resolveOidcTenantSession } from "@/server/auth/oidc-session";
import {
  buildOidcSessionCookiePayload,
  oidcSessionCookieName,
  oidcSessionCookieOptions,
  sealOidcSessionCookie,
} from "@/server/auth/oidc-session-cookie";
import { dashboardPathForRole } from "@/server/auth/rbac";

export async function POST(request: Request) {
  if (process.env.HR_ONE_AUTH_SESSION_SOURCE !== "oidc") {
    return NextResponse.json(
      { error: "OIDC session endpoint is disabled." },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json(
      { error: "Bearer token is required." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const claims = await verifyOidcJwt({
      token,
      config: oidcConfigFromEnv(process.env),
    });
    const session = await resolveOidcTenantSession({
      claims,
      env: process.env,
    });
    const cookieValue = await sealOidcSessionCookie(buildOidcSessionCookiePayload({ claims }));
    const response = NextResponse.json(
      {
        ok: true,
        redirectTo: dashboardPathForRole(session.role),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
    response.cookies.set(oidcSessionCookieName, cookieValue, oidcSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: "OIDC session could not be established." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json(
    { ok: true },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
  response.cookies.set(oidcSessionCookieName, "", {
    ...oidcSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

function parseBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
