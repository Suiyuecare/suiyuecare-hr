import { generateKeyPairSync, createSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  oidcConfigFromEnv,
  tenantSessionFromOidcClaims,
  verifyOidcJwt,
  type OidcVerificationConfig,
} from "./oidc";

const now = new Date("2026-06-12T08:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1_000);
const config: OidcVerificationConfig = {
  issuer: "https://login.customer.example/tenant/v2.0",
  audience: "hr-one-api",
  jwksUrl: "https://login.customer.example/tenant/keys",
  maxTokenAgeSeconds: 3_600,
};

describe("OIDC token verification", () => {
  it("verifies RS256 JWTs and maps claims to auth assurance without raw token storage", async () => {
    const fixture = createJwtFixture({
      iss: config.issuer,
      aud: ["hr-one-api", "other-api"],
      exp: nowSeconds + 600,
      iat: nowSeconds - 120,
      nbf: nowSeconds - 180,
      sub: "external-user-1",
      email: "owner@customer.example",
      email_verified: true,
      name: "Customer Owner",
      amr: ["pwd", "mfa"],
      tenant_id: "customer-a",
      company_id: "customer-a-main",
      roles: ["owner"],
    });

    const claims = await verifyOidcJwt({
      token: fixture.token,
      config,
      fetchJwks: async (url) => {
        expect(url).toBe(config.jwksUrl);
        return fixture.jwks;
      },
      now,
    });

    expect(claims).toMatchObject({
      subject: "external-user-1",
      issuer: config.issuer,
      audience: ["hr-one-api", "other-api"],
      email: "owner@customer.example",
      emailVerified: true,
      name: "Customer Owner",
      tenantExternalId: "customer-a",
      companyExternalId: "customer-a-main",
      roleKeys: ["owner"],
      authAssurance: {
        method: "sso",
        mfaVerified: true,
        authenticatedAt: new Date((nowSeconds - 120) * 1_000),
        lastSeenAt: now,
      },
    });
    expect(JSON.stringify(claims)).not.toContain(fixture.token);
  });

  it("rejects issuer, audience, and expired token mismatches", async () => {
    const issuerMismatch = createJwtFixture({
      iss: "https://evil.example",
      aud: config.audience,
      exp: nowSeconds + 600,
      iat: nowSeconds - 60,
      sub: "external-user-1",
    });
    await expect(verifyOidcJwt({
      token: issuerMismatch.token,
      config,
      fetchJwks: async () => issuerMismatch.jwks,
      now,
    })).rejects.toThrow(/issuer/);

    const audienceMismatch = createJwtFixture({
      iss: config.issuer,
      aud: "wrong-api",
      exp: nowSeconds + 600,
      iat: nowSeconds - 60,
      sub: "external-user-1",
    });
    await expect(verifyOidcJwt({
      token: audienceMismatch.token,
      config,
      fetchJwks: async () => audienceMismatch.jwks,
      now,
    })).rejects.toThrow(/audience/);

    const expired = createJwtFixture({
      iss: config.issuer,
      aud: config.audience,
      exp: nowSeconds - 1,
      iat: nowSeconds - 600,
      sub: "external-user-1",
    });
    await expect(verifyOidcJwt({
      token: expired.token,
      config,
      fetchJwks: async () => expired.jwks,
      now,
    })).rejects.toThrow(/expired/);
  });

  it("rejects unsupported algorithms and missing signing keys", async () => {
    const fixture = createJwtFixture({
      iss: config.issuer,
      aud: config.audience,
      exp: nowSeconds + 600,
      iat: nowSeconds - 60,
      sub: "external-user-1",
    }, { alg: "none" });

    await expect(verifyOidcJwt({
      token: fixture.token,
      config,
      fetchJwks: async () => fixture.jwks,
      now,
    })).rejects.toThrow(/algorithm/);

    const missingKid = createJwtFixture({
      iss: config.issuer,
      aud: config.audience,
      exp: nowSeconds + 600,
      iat: nowSeconds - 60,
      sub: "external-user-1",
    });

    await expect(verifyOidcJwt({
      token: missingKid.token,
      config,
      fetchJwks: async () => ({ keys: [] }),
      now,
    })).rejects.toThrow(/signing key/);
  });

  it("builds OIDC config from production environment variables", () => {
    expect(oidcConfigFromEnv({
      HR_ONE_AUTH_ISSUER_URL: config.issuer,
      HR_ONE_AUTH_AUDIENCE: config.audience,
      HR_ONE_AUTH_JWKS_URL: config.jwksUrl,
      HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS: "1800",
    })).toEqual({
      ...config,
      maxTokenAgeSeconds: 1_800,
    });
  });

  it("converts verified OIDC claims into tenant sessions for shared guards", () => {
    const session = tenantSessionFromOidcClaims({
      subject: "external-user-1",
      issuer: config.issuer,
      audience: [config.audience],
      email: "manager@customer.example",
      emailVerified: true,
      name: "Customer Manager",
      tenantExternalId: "customer-a",
      companyExternalId: "customer-a-main",
      employeeId: null,
      employeeName: null,
      roleKeys: ["unknown-role", "manager"],
      authAssurance: {
        method: "sso",
        mfaVerified: true,
        authenticatedAt: new Date("2026-06-12T07:58:00.000Z"),
        lastSeenAt: now,
      },
    });

    expect(session).toMatchObject({
      role: "manager",
      tenantId: "customer-a",
      companyId: "customer-a-main",
      user: {
        id: "external-user-1",
        email: "manager@customer.example",
        displayName: "Customer Manager",
      },
      employee: null,
      authAssurance: {
        method: "sso",
        mfaVerified: true,
      },
    });
  });

  it("blocks OIDC sessions without tenant context or HR One role claims", () => {
    const baseClaims = {
      subject: "external-user-1",
      issuer: config.issuer,
      audience: [config.audience],
      email: "manager@customer.example",
      emailVerified: true,
      name: "Customer Manager",
      tenantExternalId: "customer-a",
      companyExternalId: "customer-a-main",
      employeeId: null,
      employeeName: null,
      roleKeys: ["manager"],
      authAssurance: {
        method: "sso" as const,
        mfaVerified: true,
        authenticatedAt: new Date("2026-06-12T07:58:00.000Z"),
        lastSeenAt: now,
      },
    };

    expect(() => tenantSessionFromOidcClaims({
      ...baseClaims,
      tenantExternalId: null,
    })).toThrow(/tenant or company/);

    expect(() => tenantSessionFromOidcClaims({
      ...baseClaims,
      roleKeys: ["finance_admin"],
    })).toThrow(/role claim/);
  });
});

function createJwtFixture(
  payload: Record<string, unknown>,
  headerOverrides: Record<string, unknown> = {},
) {
  const kid = "test-key-1";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const jwk = {
    ...publicJwk,
    kid,
    alg: "RS256",
    use: "sig",
  };
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid,
    ...headerOverrides,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(privateKey);

  return {
    token: `${signingInput}.${base64Url(signature)}`,
    jwks: {
      keys: [jwk],
    },
  };
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64Url(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64Url(value: Buffer) {
  return value
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
