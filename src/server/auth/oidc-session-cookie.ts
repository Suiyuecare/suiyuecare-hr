import type { OidcVerifiedClaims } from "./oidc";
import type { AuthAssurance } from "./policy";

export const oidcSessionCookieName = "hrone_oidc_session";

export type OidcSessionCookiePayload = {
  version: 1;
  issuer: string;
  subject: string;
  tenantExternalId: string;
  companyExternalId: string;
  authAssurance: {
    method: "sso";
    mfaVerified: boolean;
    authenticatedAt: string;
    lastSeenAt: string;
  };
  issuedAt: string;
  expiresAt: string;
};

const cookieVersionPrefix = "v1";
const defaultSessionMaxAgeSeconds = 8 * 60 * 60;
const maximumSessionMaxAgeSeconds = 24 * 60 * 60;

export function oidcSessionCookieOptions(
  env: Record<string, string | undefined> = process.env,
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: env.HR_ONE_ENV === "production",
    maxAge: readSessionMaxAgeSeconds(env),
  };
}

export function buildOidcSessionCookiePayload(input: {
  claims: OidcVerifiedClaims;
  now?: Date;
  env?: Record<string, string | undefined>;
}): OidcSessionCookiePayload {
  if (!input.claims.tenantExternalId || !input.claims.companyExternalId) {
    throw new Error("OIDC session cookie requires tenant and company context.");
  }
  const now = input.now ?? new Date();
  const maxAgeSeconds = readSessionMaxAgeSeconds(input.env ?? process.env);
  return {
    version: 1,
    issuer: input.claims.issuer,
    subject: input.claims.subject,
    tenantExternalId: input.claims.tenantExternalId,
    companyExternalId: input.claims.companyExternalId,
    authAssurance: {
      method: "sso",
      mfaVerified: input.claims.authAssurance.mfaVerified,
      authenticatedAt: input.claims.authAssurance.authenticatedAt.toISOString(),
      lastSeenAt: now.toISOString(),
    },
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + maxAgeSeconds * 1_000).toISOString(),
  };
}

export async function sealOidcSessionCookie(
  payload: OidcSessionCookiePayload,
  env: Record<string, string | undefined> = process.env,
) {
  const key = await importEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return [
    cookieVersionPrefix,
    base64Url(iv),
    base64Url(ciphertext),
  ].join(".");
}

export async function openOidcSessionCookie(
  value: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<OidcSessionCookiePayload> {
  if (!value) {
    throw new Error("OIDC session cookie is missing.");
  }
  const [version, ivPart, ciphertextPart] = value.split(".");
  if (version !== cookieVersionPrefix || !ivPart || !ciphertextPart) {
    throw new Error("OIDC session cookie has an invalid format.");
  }

  const key = await importEncryptionKey(env);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivPart) },
    key,
    base64UrlToBytes(ciphertextPart),
  );
  const payload = parsePayload(new TextDecoder().decode(plaintext));
  if (new Date(payload.expiresAt).getTime() <= now.getTime()) {
    throw new Error("OIDC session cookie is expired.");
  }
  return payload;
}

export function oidcSessionCookiePayloadToClaims(payload: OidcSessionCookiePayload): OidcVerifiedClaims {
  return {
    subject: payload.subject,
    issuer: payload.issuer,
    audience: [],
    email: null,
    emailVerified: null,
    name: null,
    tenantExternalId: payload.tenantExternalId,
    companyExternalId: payload.companyExternalId,
    employeeId: null,
    employeeName: null,
    roleKeys: [],
    authAssurance: parseAuthAssurance(payload.authAssurance),
  };
}

export function readOidcSessionCookieFromHeader(header: string | null | undefined) {
  if (!header) return null;
  const cookies = header.split(";").map((item) => item.trim());
  const cookie = cookies.find((item) => item.startsWith(`${oidcSessionCookieName}=`));
  return cookie ? decodeURIComponent(cookie.slice(oidcSessionCookieName.length + 1)) : null;
}

function parseAuthAssurance(value: OidcSessionCookiePayload["authAssurance"]): AuthAssurance {
  return {
    method: "sso",
    mfaVerified: value.mfaVerified,
    authenticatedAt: new Date(value.authenticatedAt),
    lastSeenAt: new Date(value.lastSeenAt),
  };
}

function parsePayload(text: string): OidcSessionCookiePayload {
  const value = JSON.parse(text) as Partial<OidcSessionCookiePayload>;
  if (
    value.version !== 1 ||
    typeof value.issuer !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.tenantExternalId !== "string" ||
    typeof value.companyExternalId !== "string" ||
    typeof value.issuedAt !== "string" ||
    typeof value.expiresAt !== "string" ||
    !value.authAssurance ||
    value.authAssurance.method !== "sso" ||
    typeof value.authAssurance.mfaVerified !== "boolean" ||
    typeof value.authAssurance.authenticatedAt !== "string" ||
    typeof value.authAssurance.lastSeenAt !== "string"
  ) {
    throw new Error("OIDC session cookie payload is invalid.");
  }
  return value as OidcSessionCookiePayload;
}

async function importEncryptionKey(env: Record<string, string | undefined>) {
  const secret = env.HR_ONE_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("HR_ONE_ENCRYPTION_KEY is required for OIDC session cookies.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function readSessionMaxAgeSeconds(env: Record<string, string | undefined>) {
  const raw = Number(env.HR_ONE_WEB_SESSION_MAX_AGE_SECONDS ?? "");
  if (!Number.isInteger(raw) || raw <= 0) return defaultSessionMaxAgeSeconds;
  return Math.min(raw, maximumSessionMaxAgeSeconds);
}

function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(Buffer.from(padded, "base64"));
}
