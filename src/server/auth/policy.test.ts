import { describe, expect, it } from "vitest";
import { evaluateAuthPolicy } from "./policy";
import type { CompanySecuritySettings } from "@/server/settings/security";

const settings: CompanySecuritySettings = {
  mfaRequiredForAdmins: true,
  mfaRequiredForEmployees: false,
  ssoEnabled: true,
  ssoProvider: "Entra ID",
  ssoIssuerUrl: "https://login.example.com/demo/v2.0",
  ssoClientId: "hr-one-client-id",
  ssoJwksUrl: "https://login.example.com/demo/discovery/v2.0/keys",
  passwordMinLength: 12,
  passwordRequiresNumber: true,
  passwordRequiresSymbol: true,
  sessionTimeoutMinutes: 480,
  idleTimeoutMinutes: 60,
  allowedEmailDomains: ["hrone.test"],
};

const now = new Date("2026-06-12T08:00:00.000Z");

describe("auth policy", () => {
  it("allows privileged SSO sessions with MFA", () => {
    expect(evaluateAuthPolicy({
      role: "owner",
      user: { id: "user-owner", email: "owner@hrone.test", displayName: "Owner" },
      authAssurance: {
        method: "sso",
        mfaVerified: true,
        authenticatedAt: new Date("2026-06-12T07:30:00.000Z"),
        lastSeenAt: new Date("2026-06-12T07:59:00.000Z"),
      },
    }, settings, now)).toMatchObject({
      allowed: true,
      status: "verified",
    });
  });

  it("blocks privileged local sessions when SSO is required", () => {
    expect(evaluateAuthPolicy({
      role: "hr_admin",
      user: { id: "user-hr", email: "hr@hrone.test", displayName: "HR" },
      authAssurance: {
        method: "local_password",
        mfaVerified: true,
        authenticatedAt: new Date("2026-06-12T07:30:00.000Z"),
        lastSeenAt: new Date("2026-06-12T07:59:00.000Z"),
      },
    }, settings, now)).toMatchObject({
      allowed: false,
      status: "sso_required",
    });
  });

  it("blocks missing MFA and stale sessions", () => {
    expect(evaluateAuthPolicy({
      role: "owner",
      user: { id: "user-owner", email: "owner@hrone.test", displayName: "Owner" },
      authAssurance: {
        method: "sso",
        mfaVerified: false,
        authenticatedAt: new Date("2026-06-12T07:30:00.000Z"),
        lastSeenAt: new Date("2026-06-12T07:59:00.000Z"),
      },
    }, settings, now)).toMatchObject({
      allowed: false,
      status: "mfa_required",
    });

    expect(evaluateAuthPolicy({
      role: "employee",
      user: { id: "user-employee", email: "employee@hrone.test", displayName: "Employee" },
      authAssurance: {
        method: "local_password",
        mfaVerified: false,
        authenticatedAt: new Date("2026-06-11T20:00:00.000Z"),
        lastSeenAt: new Date("2026-06-12T07:59:00.000Z"),
      },
    }, settings, now)).toMatchObject({
      allowed: false,
      status: "session_expired",
    });
  });

  it("blocks users outside allowed email domains", () => {
    expect(evaluateAuthPolicy({
      role: "employee",
      user: { id: "user-employee", email: "employee@example.com", displayName: "Employee" },
      authAssurance: {
        method: "local_password",
        mfaVerified: false,
        authenticatedAt: new Date("2026-06-12T07:30:00.000Z"),
        lastSeenAt: new Date("2026-06-12T07:59:00.000Z"),
      },
    }, settings, now)).toMatchObject({
      allowed: false,
      status: "domain_blocked",
    });
  });
});
