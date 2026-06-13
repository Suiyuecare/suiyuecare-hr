import { cookies } from "next/headers";
import { getDb } from "@/server/db/client";
import { getFallbackSession } from "@/server/demo/fallback";
import type { AuthAssurance, AuthMethod } from "./policy";
import { normalizeRole, type RoleKey } from "./rbac";

export const demoRoleCookie = "hrone_demo_role";
export const demoAuthMethodCookie = "hrone_demo_auth_method";
export const demoMfaCookie = "hrone_demo_mfa_verified";
export const demoAuthenticatedAtCookie = "hrone_demo_authenticated_at";
export const demoLastSeenAtCookie = "hrone_demo_last_seen_at";

export function demoCookieOptions(env: Record<string, string | undefined> = process.env) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: env.HR_ONE_ENV === "production",
  };
}

export async function getDemoRole(): Promise<RoleKey> {
  const cookieStore = await cookies();
  return normalizeRole(cookieStore.get(demoRoleCookie)?.value);
}

export async function getDemoSession() {
  const role = await getDemoRole();
  const authAssurance = await getDemoAuthAssurance(role);
  if (!process.env.DATABASE_URL) {
    return { ...getFallbackSession(role), authAssurance };
  }

  const db = getDb();

  try {
    const userRole = await db.userRole.findFirst({
      where: {
        role: {
          key: role,
        },
      },
      include: {
        user: {
          include: {
            employee: {
              include: {
                department: true,
              },
            },
          },
        },
        role: true,
      },
    });

    if (!userRole) {
      return getFallbackSession(role);
    }

    return {
      role,
      user: userRole.user,
      employee: userRole.user.employee,
      tenantId: userRole.tenantId,
      companyId: userRole.companyId,
      authAssurance,
    };
  } catch {
    return { ...getFallbackSession(role), authAssurance };
  }
}

export async function getDemoAuthAssurance(role: RoleKey): Promise<AuthAssurance> {
  const cookieStore = await cookies();
  const now = new Date();
  const authenticatedAt = readDateCookie(cookieStore.get(demoAuthenticatedAtCookie)?.value) ?? now;
  const lastSeenAt = readDateCookie(cookieStore.get(demoLastSeenAtCookie)?.value) ?? now;
  return {
    method: normalizeAuthMethod(cookieStore.get(demoAuthMethodCookie)?.value, role),
    mfaVerified: cookieStore.get(demoMfaCookie)?.value === "true" || role === "owner" || role === "hr_admin",
    authenticatedAt,
    lastSeenAt,
  };
}

export function defaultDemoAuthClaimsForRole(role: RoleKey) {
  const now = new Date().toISOString();
  return {
    method: role === "employee" ? "local_password" as const : "sso" as const,
    mfaVerified: role === "owner" || role === "hr_admin" || role === "manager",
    authenticatedAt: now,
    lastSeenAt: now,
  };
}

function normalizeAuthMethod(value: string | undefined, role: RoleKey): AuthMethod {
  if (value === "sso" || value === "api_token" || value === "local_password") return value;
  return role === "employee" ? "local_password" : "sso";
}

function readDateCookie(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
