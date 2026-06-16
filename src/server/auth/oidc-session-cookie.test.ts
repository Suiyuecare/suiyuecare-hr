import { describe, expect, it } from "vitest";
import type { OidcVerifiedClaims } from "./oidc";
import {
  buildOidcSessionCookiePayload,
  oidcSessionCookieName,
  oidcSessionCookieOptions,
  oidcSessionCookiePayloadToClaims,
  openOidcSessionCookie,
  readOidcSessionCookieFromHeader,
  sealOidcSessionCookie,
} from "./oidc-session-cookie";

const env = {
  HR_ONE_ENV: "production",
  HR_ONE_ENCRYPTION_KEY: "encryption-key-with-at-least-32-characters",
  HR_ONE_WEB_SESSION_MAX_AGE_SECONDS: "3600",
};

const claims: OidcVerifiedClaims = {
  subject: "external-subject-1",
  issuer: "https://login.customer.example/tenant/v2.0",
  audience: ["hr-one-api"],
  email: "employee@customer.example",
  emailVerified: true,
  name: "Employee Name",
  tenantExternalId: "customer-a",
  companyExternalId: "company-1",
  employeeId: "employee-1",
  employeeName: "Employee Name",
  roleKeys: ["employee"],
  authAssurance: {
    method: "sso",
    mfaVerified: true,
    authenticatedAt: new Date("2026-06-17T00:00:00.000Z"),
    lastSeenAt: new Date("2026-06-17T00:00:00.000Z"),
  },
};

describe("OIDC session cookie", () => {
  it("seals a minimal encrypted session without raw email or display name", async () => {
    const payload = buildOidcSessionCookiePayload({
      claims,
      env,
      now: new Date("2026-06-17T00:10:00.000Z"),
    });
    const sealed = await sealOidcSessionCookie(payload, env);

    expect(sealed).not.toContain("employee@customer.example");
    expect(sealed).not.toContain("Employee Name");
    await expect(openOidcSessionCookie(sealed, env, new Date("2026-06-17T00:20:00.000Z"))).resolves.toMatchObject({
      issuer: claims.issuer,
      subject: claims.subject,
      tenantExternalId: "customer-a",
      companyExternalId: "company-1",
    });
  });

  it("converts decrypted cookies into DB-resolvable OIDC claims without email fallback data", async () => {
    const payload = buildOidcSessionCookiePayload({
      claims,
      env,
      now: new Date("2026-06-17T00:10:00.000Z"),
    });
    const cookieClaims = oidcSessionCookiePayloadToClaims(payload);

    expect(cookieClaims.email).toBeNull();
    expect(cookieClaims.roleKeys).toEqual([]);
    expect(cookieClaims.authAssurance).toMatchObject({
      method: "sso",
      mfaVerified: true,
    });
  });

  it("rejects expired or tampered cookies", async () => {
    const payload = buildOidcSessionCookiePayload({
      claims,
      env: { ...env, HR_ONE_WEB_SESSION_MAX_AGE_SECONDS: "60" },
      now: new Date("2026-06-17T00:10:00.000Z"),
    });
    const sealed = await sealOidcSessionCookie(payload, env);

    await expect(openOidcSessionCookie(sealed, env, new Date("2026-06-17T00:10:30.000Z"))).resolves.toBeTruthy();
    await expect(openOidcSessionCookie(sealed, env, new Date("2026-06-17T00:11:01.000Z"))).rejects.toThrow(/expired/);
    await expect(openOidcSessionCookie(`${sealed}tampered`, env)).rejects.toThrow();
  });

  it("uses secure production cookie options and parses cookie headers", () => {
    expect(oidcSessionCookieOptions(env)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 3600,
    });
    expect(readOidcSessionCookieFromHeader(`foo=bar; ${oidcSessionCookieName}=abc.def; other=value`)).toBe("abc.def");
  });
});
