import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type CompanySecuritySettings = {
  mfaRequiredForAdmins: boolean;
  mfaRequiredForEmployees: boolean;
  ssoEnabled: boolean;
  ssoProvider: string | null;
  ssoIssuerUrl: string | null;
  ssoClientId: string | null;
  ssoJwksUrl: string | null;
  passwordMinLength: number;
  passwordRequiresNumber: boolean;
  passwordRequiresSymbol: boolean;
  sessionTimeoutMinutes: number;
  idleTimeoutMinutes: number;
  allowedEmailDomains: string[];
};

export type CompanySecuritySettingsInput = Partial<CompanySecuritySettings>;

type SecuritySettingsDemoState = {
  settings: CompanySecuritySettings;
};

const defaultSecuritySettings: CompanySecuritySettings = {
  mfaRequiredForAdmins: true,
  mfaRequiredForEmployees: false,
  ssoEnabled: false,
  ssoProvider: null,
  ssoIssuerUrl: null,
  ssoClientId: null,
  ssoJwksUrl: null,
  passwordMinLength: 12,
  passwordRequiresNumber: true,
  passwordRequiresSymbol: true,
  sessionTimeoutMinutes: 480,
  idleTimeoutMinutes: 60,
  allowedEmailDomains: ["hrone.test"],
};

const globalForSecuritySettings = globalThis as unknown as {
  hrOneSecuritySettingsDemoState?: SecuritySettingsDemoState;
};

export async function getCompanySecuritySettings(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  return readCompanySecuritySettings(session);
}

export async function getCompanySecuritySettingsForAuth(session: SessionLike) {
  return readCompanySecuritySettings(session);
}

async function readCompanySecuritySettings(session: SessionLike) {
  if (canUseDatabase(session)) {
    try {
      const record = await getDb().companySecuritySetting.findUnique({
        where: { companyId: session.companyId! },
      });
      return record ? readRecord(record) : defaultSecuritySettings;
    } catch {
      return getDemoState().settings;
    }
  }
  return getDemoState().settings;
}

export async function updateCompanySecuritySettings(
  session: SessionLike,
  input: CompanySecuritySettingsInput,
) {
  assertPermission(session.role, "settings:write");
  const before = await getCompanySecuritySettings({ ...session, role: "owner" });
  const normalized = normalizeSettings(input, before);

  if (canUseDatabase(session)) {
    try {
      return updateDbSettings(session, before, normalized);
    } catch {
      return updateDemoSettings(session, before, normalized);
    }
  }
  return updateDemoSettings(session, before, normalized);
}

export function resetSecuritySettingsDemoState() {
  globalForSecuritySettings.hrOneSecuritySettingsDemoState = {
    settings: { ...defaultSecuritySettings },
  };
}

function getDemoState() {
  if (!globalForSecuritySettings.hrOneSecuritySettingsDemoState) {
    resetSecuritySettingsDemoState();
  }
  return globalForSecuritySettings.hrOneSecuritySettingsDemoState!;
}

async function updateDbSettings(
  session: SessionLike,
  before: CompanySecuritySettings,
  normalized: CompanySecuritySettings,
) {
  const db = getDb();
  const updated = await db.$transaction(async (tx) => {
    const record = await tx.companySecuritySetting.upsert({
      where: { companyId: session.companyId! },
      create: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        ...writeRecord(normalized),
        updatedByUserId: session.user?.id,
      },
      update: {
        ...writeRecord(normalized),
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "company_security_settings",
      entityId: record.id,
      before,
      after: normalized,
      metadata: {
        changedFields: changedFields(before, normalized),
        mfaPolicyChanged: before.mfaRequiredForAdmins !== normalized.mfaRequiredForAdmins ||
          before.mfaRequiredForEmployees !== normalized.mfaRequiredForEmployees,
        ssoEnabled: normalized.ssoEnabled,
        ssoMetadataConfigured: hasSsoMetadata(normalized),
      },
    });
    return record;
  });
  return readRecord(updated);
}

function updateDemoSettings(
  session: SessionLike,
  before: CompanySecuritySettings,
  normalized: CompanySecuritySettings,
) {
  getDemoState().settings = normalized;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "company_security_settings",
    entityId: "demo-company-security-settings",
    before,
    after: normalized,
    metadata: {
      changedFields: changedFields(before, normalized),
      mfaPolicyChanged: before.mfaRequiredForAdmins !== normalized.mfaRequiredForAdmins ||
        before.mfaRequiredForEmployees !== normalized.mfaRequiredForEmployees,
      ssoEnabled: normalized.ssoEnabled,
      ssoMetadataConfigured: hasSsoMetadata(normalized),
    },
  });
  return normalized;
}

function normalizeSettings(
  input: CompanySecuritySettingsInput,
  before: CompanySecuritySettings,
): CompanySecuritySettings {
  const passwordMinLength = clampInteger(input.passwordMinLength, before.passwordMinLength, 8, 128);
  const sessionTimeoutMinutes = clampInteger(input.sessionTimeoutMinutes, before.sessionTimeoutMinutes, 15, 10080);
  const idleTimeoutMinutes = clampInteger(input.idleTimeoutMinutes, before.idleTimeoutMinutes, 5, sessionTimeoutMinutes);
  return {
    mfaRequiredForAdmins: Boolean(input.mfaRequiredForAdmins),
    mfaRequiredForEmployees: Boolean(input.mfaRequiredForEmployees),
    ssoEnabled: Boolean(input.ssoEnabled),
    ssoProvider: cleanText(input.ssoProvider) || null,
    ssoIssuerUrl: cleanUrl(input.ssoIssuerUrl, before.ssoIssuerUrl),
    ssoClientId: cleanText(input.ssoClientId) || before.ssoClientId,
    ssoJwksUrl: cleanUrl(input.ssoJwksUrl, before.ssoJwksUrl),
    passwordMinLength,
    passwordRequiresNumber: Boolean(input.passwordRequiresNumber),
    passwordRequiresSymbol: Boolean(input.passwordRequiresSymbol),
    sessionTimeoutMinutes,
    idleTimeoutMinutes,
    allowedEmailDomains: normalizeDomains(input.allowedEmailDomains ?? before.allowedEmailDomains),
  };
}

function readRecord(record: {
  mfaRequiredForAdmins: boolean;
  mfaRequiredForEmployees: boolean;
  ssoEnabled: boolean;
  ssoProvider: string | null;
  ssoIssuerUrl: string | null;
  ssoClientId: string | null;
  ssoJwksUrl: string | null;
  passwordMinLength: number;
  passwordRequiresNumber: boolean;
  passwordRequiresSymbol: boolean;
  sessionTimeoutMinutes: number;
  idleTimeoutMinutes: number;
  allowedEmailDomainsJson: Prisma.JsonValue;
}): CompanySecuritySettings {
  return {
    mfaRequiredForAdmins: record.mfaRequiredForAdmins,
    mfaRequiredForEmployees: record.mfaRequiredForEmployees,
    ssoEnabled: record.ssoEnabled,
    ssoProvider: record.ssoProvider,
    ssoIssuerUrl: record.ssoIssuerUrl,
    ssoClientId: record.ssoClientId,
    ssoJwksUrl: record.ssoJwksUrl,
    passwordMinLength: record.passwordMinLength,
    passwordRequiresNumber: record.passwordRequiresNumber,
    passwordRequiresSymbol: record.passwordRequiresSymbol,
    sessionTimeoutMinutes: record.sessionTimeoutMinutes,
    idleTimeoutMinutes: record.idleTimeoutMinutes,
    allowedEmailDomains: Array.isArray(record.allowedEmailDomainsJson)
      ? record.allowedEmailDomainsJson.map(String)
      : [],
  };
}

function writeRecord(settings: CompanySecuritySettings) {
  return {
    mfaRequiredForAdmins: settings.mfaRequiredForAdmins,
    mfaRequiredForEmployees: settings.mfaRequiredForEmployees,
    ssoEnabled: settings.ssoEnabled,
    ssoProvider: settings.ssoProvider,
    ssoIssuerUrl: settings.ssoIssuerUrl,
    ssoClientId: settings.ssoClientId,
    ssoJwksUrl: settings.ssoJwksUrl,
    passwordMinLength: settings.passwordMinLength,
    passwordRequiresNumber: settings.passwordRequiresNumber,
    passwordRequiresSymbol: settings.passwordRequiresSymbol,
    sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
    idleTimeoutMinutes: settings.idleTimeoutMinutes,
    allowedEmailDomainsJson: settings.allowedEmailDomains as Prisma.InputJsonValue,
  };
}

function normalizeDomains(domains: string[]) {
  return [...new Set(
    domains
      .flatMap((item) => item.split(/[\s,]+/))
      .map((item) => item.trim().toLowerCase())
      .filter((item) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(item)),
  )];
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanUrl(value: unknown, fallback: string | null) {
  const text = cleanText(value);
  if (!text) return fallback;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function hasSsoMetadata(settings: Pick<
  CompanySecuritySettings,
  "ssoProvider" | "ssoIssuerUrl" | "ssoClientId" | "ssoJwksUrl"
>) {
  return Boolean(
    settings.ssoProvider &&
    settings.ssoIssuerUrl &&
    settings.ssoClientId &&
    settings.ssoJwksUrl,
  );
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function changedFields(before: CompanySecuritySettings, after: CompanySecuritySettings) {
  return (Object.keys(after) as Array<keyof CompanySecuritySettings>).filter((key) =>
    JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
