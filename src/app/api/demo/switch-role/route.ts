import { NextResponse } from "next/server";
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
