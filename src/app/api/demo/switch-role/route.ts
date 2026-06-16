import { NextResponse } from "next/server";
import { assertDemoAuthAllowed, isDemoAuthAllowed } from "@/server/auth/demo-mode";
import {
  demoCookieOptions,
  defaultDemoAuthClaimsForRole,
  demoAuthenticatedAtCookie,
  demoAuthMethodCookie,
  demoLastSeenAtCookie,
  demoMfaCookie,
  demoRoleCookie,
} from "@/server/auth/demo-session";
import { dashboardPathForRole, normalizeRole } from "@/server/auth/rbac";

export async function POST(request: Request) {
  if (!isDemoEndpointAllowed()) {
    return NextResponse.json(
      { error: "Demo endpoints are disabled." },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  assertDemoAuthAllowed();
  const formData = await request.formData();
  const role = normalizeRole(String(formData.get("role") ?? ""));
  const response = NextResponse.redirect(new URL(dashboardPathForRole(role), request.url), 303);
  response.cookies.set(demoRoleCookie, role, demoCookieOptions());
  const claims = defaultDemoAuthClaimsForRole(role);
  response.cookies.set(demoAuthMethodCookie, claims.method, demoCookieOptions());
  response.cookies.set(demoMfaCookie, String(claims.mfaVerified), demoCookieOptions());
  response.cookies.set(demoAuthenticatedAtCookie, claims.authenticatedAt, demoCookieOptions());
  response.cookies.set(demoLastSeenAtCookie, claims.lastSeenAt, demoCookieOptions());
  return response;
}

function isDemoEndpointAllowed() {
  return isDemoAuthAllowed();
}
