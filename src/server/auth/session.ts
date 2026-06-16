import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getDemoRole as getLocalDemoRole,
  getDemoSession as getLocalDemoSession,
} from "./demo-session";
import { isDemoAuthAllowed } from "./demo-mode";
import { tenantSessionFromAuthorizationHeader, type TenantSessionLike } from "./guards";
import type { RoleKey } from "./rbac";

export type AppSession = TenantSessionLike;

export async function getAppSession(): Promise<AppSession> {
  if (process.env.HR_ONE_AUTH_SESSION_SOURCE === "oidc") {
    return getOidcPageSession();
  }
  return getLocalDemoSession();
}

export async function getOptionalAppSession(): Promise<AppSession | null> {
  try {
    return await getAppSession();
  } catch {
    return null;
  }
}

export async function getAppRole(): Promise<RoleKey> {
  if (process.env.HR_ONE_AUTH_SESSION_SOURCE === "oidc") {
    return (await getAppSession()).role;
  }
  return getLocalDemoRole();
}

export async function getDemoSession() {
  try {
    return await getAppSession();
  } catch {
    redirect("/auth/required");
  }
}

export async function getDemoRole() {
  try {
    return await getAppRole();
  } catch {
    redirect("/auth/required");
  }
}

export function canUseDemoRoleSwitcher(env: Record<string, string | undefined> = process.env) {
  return isDemoAuthAllowed(env);
}

async function getOidcPageSession() {
  const headerStore = await headers();
  try {
    return await tenantSessionFromAuthorizationHeader({
      authorization: headerStore.get("authorization"),
    });
  } catch {
    redirect("/auth/required");
  }
}
