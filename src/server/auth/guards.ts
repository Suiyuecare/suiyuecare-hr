import { headers } from "next/headers";
import { getDemoSession } from "./demo-session";
import {
  oidcConfigFromEnv,
  verifyOidcJwt,
  type OidcVerifiedClaims,
} from "./oidc";
import { resolveOidcTenantSession } from "./oidc-session";
import { assertAuthPolicy, type AuthAssurance } from "./policy";
import { assertPermission, type Permission, type RoleKey } from "./rbac";
import { getCompanySecuritySettingsForAuth } from "@/server/settings/security";

export type GuardedSession = Awaited<ReturnType<typeof getDemoSession>>;

export type TenantSessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user: { id: string; email?: string | null; displayName: string; status?: string | null } | null;
  employee: { id: string; displayName: string } | null;
  authAssurance?: AuthAssurance;
};

type GuardOptions = {
  permission?: Permission;
  employeeRequired?: boolean;
};

export async function requireTenantSession(options: GuardOptions = {}) {
  const session = process.env.HR_ONE_AUTH_SESSION_SOURCE === "oidc"
    ? await getOidcTenantSessionFromRequestHeaders()
    : await getDemoSession();
  await assertTenantSessionAccess(session, options);
  return session;
}

export async function tenantSessionFromAuthorizationHeader(input: {
  authorization: string | null;
  env?: Record<string, string | undefined>;
  verifyToken?: (token: string) => Promise<OidcVerifiedClaims>;
  resolveClaims?: (claims: OidcVerifiedClaims) => Promise<TenantSessionLike>;
}) {
  const token = parseBearerToken(input.authorization);
  if (!token) {
    throw new Error("Bearer token is required.");
  }
  const claims = input.verifyToken
    ? await input.verifyToken(token)
    : await verifyOidcJwt({
        token,
        config: oidcConfigFromEnv(input.env ?? process.env),
      });
  return input.resolveClaims
    ? input.resolveClaims(claims)
    : resolveOidcTenantSession({
        claims,
        env: input.env,
      });
}

export async function assertTenantSessionAccess(
  session: TenantSessionLike,
  options: GuardOptions = {},
) {
  if (!session.tenantId || !session.companyId) {
    throw new Error("Tenant and company context are required.");
  }
  if (!session.user) {
    throw new Error("Authenticated user context is required.");
  }
  if (session.user.status && session.user.status !== "active") {
    throw new Error("User account is not active.");
  }
  if (options.permission) {
    assertPermission(session.role, options.permission);
  }
  if (options.employeeRequired && !session.employee) {
    throw new Error("Employee context is required.");
  }
  const securitySettings = await getCompanySecuritySettingsForAuth(session);
  assertAuthPolicy(session, securitySettings);
}

async function getOidcTenantSessionFromRequestHeaders() {
  const headerStore = await headers();
  return tenantSessionFromAuthorizationHeader({
    authorization: headerStore.get("authorization"),
  });
}

function parseBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
