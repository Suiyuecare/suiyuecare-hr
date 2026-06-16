import type { AuthAssurance } from "./policy";
import { normalizeRole, roleKeys, type RoleKey } from "./rbac";
import type { TenantSessionLike } from "./guards";

export type OidcVerificationConfig = {
  issuer: string;
  audience: string;
  jwksUrl: string;
  maxTokenAgeSeconds: number;
  defaultTenantExternalId?: string | null;
  defaultCompanyExternalId?: string | null;
};

export type OidcVerifiedClaims = {
  subject: string;
  issuer: string;
  audience: string[];
  email: string | null;
  emailVerified: boolean | null;
  name: string | null;
  tenantExternalId: string | null;
  companyExternalId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  roleKeys: string[];
  authAssurance: AuthAssurance;
};

export function tenantSessionFromOidcClaims(claims: OidcVerifiedClaims): TenantSessionLike {
  if (!claims.tenantExternalId || !claims.companyExternalId) {
    throw new Error("OIDC token is missing tenant or company context.");
  }
  if (!claims.email) {
    throw new Error("OIDC token is missing user email.");
  }
  if (claims.emailVerified === false) {
    throw new Error("OIDC token email is not verified.");
  }

  return {
    role: selectRole(claims.roleKeys),
    tenantId: claims.tenantExternalId,
    companyId: claims.companyExternalId,
    user: {
      id: claims.subject,
      email: claims.email,
      displayName: claims.name ?? claims.email,
    },
    employee: claims.employeeId
      ? { id: claims.employeeId, displayName: claims.employeeName ?? claims.name ?? claims.email }
      : null,
    authAssurance: claims.authAssurance,
  };
}

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
};

type JwtPayload = {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  amr?: unknown;
  acr?: unknown;
  tenant_id?: unknown;
  company_id?: unknown;
  employee_id?: unknown;
  employee_name?: unknown;
  roles?: unknown;
};

type Jwks = {
  keys?: unknown;
};

type Jwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

export async function verifyOidcJwt(input: {
  token: string;
  config: OidcVerificationConfig;
  fetchJwks?: (url: string) => Promise<Jwks>;
  now?: Date;
}): Promise<OidcVerifiedClaims> {
  const now = input.now ?? new Date();
  const parts = input.token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid OIDC token format.");
  }

  const header = parseJsonPart<JwtHeader>(parts[0], "header");
  const payload = parseJsonPart<JwtPayload>(parts[1], "payload");

  const algorithm = jwtAlgorithm(header.alg);
  if (!algorithm) {
    throw new Error("Unsupported OIDC token algorithm.");
  }

  const jwk = await findSigningJwk({
    jwksUrl: input.config.jwksUrl,
    kid: typeof header.kid === "string" ? header.kid : null,
    alg: algorithm,
    fetchJwks: input.fetchJwks,
  });

  const verified = await verifyJwtSignature({
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: parts[2],
    jwk,
    alg: algorithm,
  });
  if (!verified) {
    throw new Error("OIDC token signature verification failed.");
  }

  return normalizeAndValidateClaims(payload, input.config, now);
}

export function oidcConfigFromEnv(env: Record<string, string | undefined>): OidcVerificationConfig {
  return {
    issuer: requiredEnv(env, "HR_ONE_AUTH_ISSUER_URL"),
    audience: requiredEnv(env, "HR_ONE_AUTH_AUDIENCE"),
    jwksUrl: requiredEnv(env, "HR_ONE_AUTH_JWKS_URL"),
    maxTokenAgeSeconds: readInteger(env.HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS, 3_600),
    defaultTenantExternalId: optionalEnv(env, "HR_ONE_AUTH_DEFAULT_TENANT"),
    defaultCompanyExternalId: optionalEnv(env, "HR_ONE_AUTH_DEFAULT_COMPANY"),
  };
}

function normalizeAndValidateClaims(
  payload: JwtPayload,
  config: OidcVerificationConfig,
  now: Date,
): OidcVerifiedClaims {
  const issuer = stringClaim(payload.iss, "iss");
  const subject = stringClaim(payload.sub, "sub");
  const audience = audienceClaim(payload.aud);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const exp = numericClaim(payload.exp, "exp");
  const iat = numericClaim(payload.iat, "iat");
  const nbf = typeof payload.nbf === "number" ? payload.nbf : null;

  if (issuer !== config.issuer) {
    throw new Error("OIDC token issuer does not match configuration.");
  }
  if (!audience.includes(config.audience)) {
    throw new Error("OIDC token audience does not match configuration.");
  }
  if (exp <= nowSeconds) {
    throw new Error("OIDC token is expired.");
  }
  if (nbf !== null && nbf > nowSeconds) {
    throw new Error("OIDC token is not valid yet.");
  }
  if (iat > nowSeconds) {
    throw new Error("OIDC token issued-at time is in the future.");
  }
  if (nowSeconds - iat > config.maxTokenAgeSeconds) {
    throw new Error("OIDC token exceeds maximum configured age.");
  }

  return {
    subject,
    issuer,
    audience,
    email: optionalString(payload.email),
    emailVerified: typeof payload.email_verified === "boolean" ? payload.email_verified : null,
    name: optionalString(payload.name),
    tenantExternalId: optionalString(payload.tenant_id) ?? config.defaultTenantExternalId ?? null,
    companyExternalId: optionalString(payload.company_id) ?? config.defaultCompanyExternalId ?? null,
    employeeId: optionalString(payload.employee_id),
    employeeName: optionalString(payload.employee_name),
    roleKeys: stringArray(payload.roles),
    authAssurance: {
      method: "sso",
      mfaVerified: hasMfaEvidence(payload.amr, payload.acr),
      authenticatedAt: new Date(iat * 1_000),
      lastSeenAt: now,
    },
  };
}

async function findSigningJwk(input: {
  jwksUrl: string;
  kid: string | null;
  alg: "RS256" | "ES256";
  fetchJwks?: (url: string) => Promise<Jwks>;
}) {
  const jwks = input.fetchJwks ? await input.fetchJwks(input.jwksUrl) : await fetchJwks(input.jwksUrl);
  const keys = Array.isArray(jwks.keys) ? jwks.keys as Jwk[] : [];
  const key = keys.find((candidate) => {
    if (!jwkSupportsAlgorithm(candidate, input.alg)) return false;
    if (candidate.use && candidate.use !== "sig") return false;
    return input.kid ? candidate.kid === input.kid : true;
  });

  if (!key) {
    throw new Error("No matching OIDC signing key found.");
  }
  return key;
}

async function fetchJwks(url: string) {
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error("OIDC JWKS fetch failed.");
  }
  return await response.json() as Jwks;
}

async function verifyJwtSignature(input: {
  signingInput: string;
  signature: string;
  jwk: Jwk;
  alg: "RS256" | "ES256";
}) {
  if (input.alg === "ES256") {
    const key = await crypto.subtle.importKey(
      "jwk",
      input.jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(input.signature),
      new TextEncoder().encode(input.signingInput),
    );
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    input.jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(input.signature),
    new TextEncoder().encode(input.signingInput),
  );
}

function jwtAlgorithm(value: unknown): "RS256" | "ES256" | null {
  if (value === "RS256" || value === "ES256") return value;
  return null;
}

function jwkSupportsAlgorithm(jwk: Jwk, alg: "RS256" | "ES256") {
  if (jwk.alg && jwk.alg !== alg) return false;
  if (alg === "RS256") return jwk.kty === "RSA";
  return jwk.kty === "EC" && jwk.crv === "P-256";
}

function parseJsonPart<T>(part: string, label: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as T;
  } catch {
    throw new Error(`Invalid OIDC token ${label}.`);
  }
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

function stringClaim(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`OIDC token is missing ${name}.`);
  }
  return value;
}

function numericClaim(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`OIDC token is missing ${name}.`);
  }
  return value;
}

function audienceClaim(value: unknown) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new Error("OIDC token is missing aud.");
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function hasMfaEvidence(amr: unknown, acr: unknown) {
  const methods = stringArray(amr).map((item) => item.toLowerCase());
  if (methods.some((item) => ["mfa", "otp", "fido", "hwk", "swk"].includes(item))) {
    return true;
  }
  return typeof acr === "string" && /mfa|multi/i.test(acr);
}

function requiredEnv(env: Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key}.`);
  }
  return value;
}

function optionalEnv(env: Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value || null;
}

function readInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function selectRole(values: string[]): RoleKey {
  const role = values.find((value) => roleKeys.includes(value as RoleKey));
  if (!role) {
    throw new Error("OIDC token is missing an HR One role claim.");
  }
  return normalizeRole(role);
}
