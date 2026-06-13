import type { CompanySecuritySettings } from "@/server/settings/security";
import type { RoleKey } from "./rbac";

export type AuthMethod = "local_password" | "sso" | "api_token";

export type AuthAssurance = {
  method: AuthMethod;
  mfaVerified: boolean;
  authenticatedAt: Date;
  lastSeenAt: Date;
};

export type AuthPolicySession = {
  role: RoleKey;
  user: { id: string; email?: string | null; displayName: string } | null;
  authAssurance?: AuthAssurance;
};

export type AuthPolicyEvaluation = {
  allowed: boolean;
  status: "verified" | "mfa_required" | "sso_required" | "session_expired" | "idle_timeout" | "domain_blocked";
  requiredActions: string[];
  detail: string;
};

const adminRoles = new Set<RoleKey>(["owner", "hr_admin"]);

export function evaluateAuthPolicy(
  session: AuthPolicySession,
  settings: CompanySecuritySettings,
  now = new Date(),
): AuthPolicyEvaluation {
  const assurance = session.authAssurance;
  if (!assurance) {
    return deny("session_expired", "Session assurance claims are missing.", ["Sign in again"]);
  }

  if (!isEmailDomainAllowed(session.user?.email, settings.allowedEmailDomains)) {
    return deny("domain_blocked", "User email domain is not allowed by company policy.", ["Use an approved company email"]);
  }

  if (minutesBetween(assurance.authenticatedAt, now) > settings.sessionTimeoutMinutes) {
    return deny("session_expired", "Session exceeded the configured maximum lifetime.", ["Sign in again"]);
  }

  if (minutesBetween(assurance.lastSeenAt, now) > settings.idleTimeoutMinutes) {
    return deny("idle_timeout", "Session exceeded the configured idle timeout.", ["Resume session"]);
  }

  if (settings.ssoEnabled && assurance.method !== "sso" && session.role !== "employee") {
    return deny("sso_required", "Company policy requires SSO for privileged access.", ["Sign in with SSO"]);
  }

  const mfaRequired = adminRoles.has(session.role)
    ? settings.mfaRequiredForAdmins
    : settings.mfaRequiredForEmployees;
  if (mfaRequired && !assurance.mfaVerified) {
    return deny("mfa_required", "Company policy requires MFA for this role.", ["Complete MFA"]);
  }

  return {
    allowed: true,
    status: "verified",
    requiredActions: [],
    detail: "Session satisfies company authentication policy.",
  };
}

export function assertAuthPolicy(
  session: AuthPolicySession,
  settings: CompanySecuritySettings,
  now = new Date(),
) {
  const evaluation = evaluateAuthPolicy(session, settings, now);
  if (!evaluation.allowed) {
    throw new Error(`Authentication policy blocked request: ${evaluation.detail}`);
  }
  return evaluation;
}

function deny(
  status: AuthPolicyEvaluation["status"],
  detail: string,
  requiredActions: string[],
): AuthPolicyEvaluation {
  return {
    allowed: false,
    status,
    requiredActions,
    detail,
  };
}

function isEmailDomainAllowed(email: string | null | undefined, allowedDomains: string[]) {
  if (allowedDomains.length === 0) return true;
  if (!email || !email.includes("@")) return false;
  const domain = email.split("@").pop()?.toLowerCase();
  return Boolean(domain && allowedDomains.includes(domain));
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}
