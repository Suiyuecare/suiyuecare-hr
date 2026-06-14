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

export type PayrollPaymentSecuritySettings = {
  tokenVaultProvider: string;
  tokenVaultRef: string | null;
  kmsKeyRef: string | null;
  bankFileFormat: string;
  bankFormatVersion: string;
  bankFileColumnOrder: BankTransferColumnKey[];
  bankFormatVerified: boolean;
  verificationStatus: "unverified" | "verified" | "failed";
  lastVerifiedAt: Date | null;
  verificationNote: string | null;
};

export type PayrollPaymentSecuritySettingsInput = Partial<PayrollPaymentSecuritySettings>;

export type BankTransferColumnKey =
  | "employee_no"
  | "employee_name"
  | "bank_code"
  | "branch_code"
  | "account_token_ref"
  | "amount"
  | "currency"
  | "memo";

export const defaultBankTransferColumnOrder: BankTransferColumnKey[] = [
  "employee_no",
  "bank_code",
  "branch_code",
  "account_token_ref",
  "amount",
  "currency",
];

const allowedBankTransferColumns = new Set<BankTransferColumnKey>([
  "employee_no",
  "employee_name",
  "bank_code",
  "branch_code",
  "account_token_ref",
  "amount",
  "currency",
  "memo",
]);

type PaymentSecurityDemoState = {
  settings: PayrollPaymentSecuritySettings;
};

const defaultPaymentSecuritySettings: PayrollPaymentSecuritySettings = {
  tokenVaultProvider: "not_configured",
  tokenVaultRef: null,
  kmsKeyRef: null,
  bankFileFormat: "tw_bank_csv_placeholder",
  bankFormatVersion: "v1",
  bankFileColumnOrder: defaultBankTransferColumnOrder,
  bankFormatVerified: false,
  verificationStatus: "unverified",
  lastVerifiedAt: null,
  verificationNote: null,
};

const globalForPaymentSecurity = globalThis as unknown as {
  hrOnePayrollPaymentSecurityDemoState?: PaymentSecurityDemoState;
};

export async function getPayrollPaymentSecuritySettings(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  return readPayrollPaymentSecuritySettings(session);
}

export async function getPayrollPaymentSecurityReadiness(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  const settings = await readPayrollPaymentSecuritySettings(session);
  return {
    settings,
    ready: isPayrollPaymentSecurityReady(settings),
    detail: paymentSecurityReadinessDetail(settings),
  };
}

export async function updatePayrollPaymentSecuritySettings(
  session: SessionLike,
  input: PayrollPaymentSecuritySettingsInput,
) {
  assertPermission(session.role, "payroll:manage");
  const before = await readPayrollPaymentSecuritySettings(session);
  const normalized = normalizeSettings(input, before);

  if (canUseDatabase(session)) {
    return updateDbSettings(session, before, normalized);
  }
  return updateDemoSettings(session, before, normalized);
}

export function isPayrollPaymentSecurityReady(settings: PayrollPaymentSecuritySettings) {
  return Boolean(
    settings.tokenVaultProvider !== "not_configured" &&
      settings.tokenVaultRef &&
      settings.kmsKeyRef &&
      settings.bankFileFormat !== "tw_bank_csv_placeholder" &&
      hasRequiredBankColumns(settings.bankFileColumnOrder) &&
      settings.bankFormatVerified &&
      settings.verificationStatus === "verified" &&
      settings.lastVerifiedAt,
  );
}

export function resetPayrollPaymentSecurityDemoState() {
  globalForPaymentSecurity.hrOnePayrollPaymentSecurityDemoState = {
    settings: { ...defaultPaymentSecuritySettings },
  };
}

async function readPayrollPaymentSecuritySettings(session: SessionLike) {
  if (canUseDatabase(session)) {
    const record = await getDb().companyPayrollPaymentSecuritySetting.findUnique({
      where: { companyId: session.companyId! },
    });
    return record ? readRecord(record) : defaultPaymentSecuritySettings;
  }
  return getDemoState().settings;
}

async function updateDbSettings(
  session: SessionLike,
  before: PayrollPaymentSecuritySettings,
  normalized: PayrollPaymentSecuritySettings,
) {
  const db = getDb();
  const updated = await db.$transaction(async (tx) => {
    const record = await tx.companyPayrollPaymentSecuritySetting.upsert({
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
      entityType: "payroll_payment_security_settings",
      entityId: record.id,
      before,
      after: normalized,
      metadata: auditMetadata(before, normalized),
    });
    return record;
  });
  return readRecord(updated);
}

function updateDemoSettings(
  session: SessionLike,
  before: PayrollPaymentSecuritySettings,
  normalized: PayrollPaymentSecuritySettings,
) {
  getDemoState().settings = normalized;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "payroll_payment_security_settings",
    entityId: "demo-payroll-payment-security-settings",
    before,
    after: normalized,
    metadata: auditMetadata(before, normalized),
  });
  return normalized;
}

function normalizeSettings(
  input: PayrollPaymentSecuritySettingsInput,
  before: PayrollPaymentSecuritySettings,
): PayrollPaymentSecuritySettings {
  const verificationStatus = normalizeVerificationStatus(input.verificationStatus ?? before.verificationStatus);
  return {
    tokenVaultProvider: cleanText(input.tokenVaultProvider) ?? before.tokenVaultProvider,
    tokenVaultRef: input.tokenVaultRef === undefined ? before.tokenVaultRef : cleanOptional(input.tokenVaultRef),
    kmsKeyRef: input.kmsKeyRef === undefined ? before.kmsKeyRef : cleanOptional(input.kmsKeyRef),
    bankFileFormat: cleanText(input.bankFileFormat) ?? before.bankFileFormat,
    bankFormatVersion: cleanText(input.bankFormatVersion) ?? before.bankFormatVersion,
    bankFileColumnOrder: normalizeColumnOrder(input.bankFileColumnOrder, before.bankFileColumnOrder),
    bankFormatVerified: input.bankFormatVerified ?? before.bankFormatVerified,
    verificationStatus,
    lastVerifiedAt: verificationStatus === "verified" ? input.lastVerifiedAt ?? before.lastVerifiedAt ?? new Date() : null,
    verificationNote: input.verificationNote === undefined ? before.verificationNote : cleanOptional(input.verificationNote),
  };
}

function paymentSecurityReadinessDetail(settings: PayrollPaymentSecuritySettings) {
  if (isPayrollPaymentSecurityReady(settings)) {
    return `${settings.tokenVaultProvider} vault configured; ${settings.bankFileFormat} ${settings.bankFormatVersion} verified.`;
  }
  const missing = [
    settings.tokenVaultProvider === "not_configured" ? "token vault provider" : null,
    settings.tokenVaultRef ? null : "token vault reference",
    settings.kmsKeyRef ? null : "KMS key reference",
    settings.bankFileFormat === "tw_bank_csv_placeholder" ? "production bank file format" : null,
    hasRequiredBankColumns(settings.bankFileColumnOrder) ? null : "bank file amount and account token columns",
    settings.bankFormatVerified ? null : "bank format verification",
    settings.verificationStatus === "verified" && settings.lastVerifiedAt ? null : "verification evidence",
  ].filter(Boolean);
  return `Missing ${missing.join(", ")}.`;
}

function auditMetadata(before: PayrollPaymentSecuritySettings, after: PayrollPaymentSecuritySettings) {
  return {
    changedFields: Object.keys(after).filter((key) =>
      !sameAuditValue(
        before[key as keyof PayrollPaymentSecuritySettings],
        after[key as keyof PayrollPaymentSecuritySettings],
      )
    ),
    tokenVaultProvider: after.tokenVaultProvider,
    bankFileFormat: after.bankFileFormat,
    bankFormatVersion: after.bankFormatVersion,
    bankFileColumnOrder: after.bankFileColumnOrder,
    bankFormatVerified: after.bankFormatVerified,
    verificationStatus: after.verificationStatus,
    tokenVaultRefStoredAsReferenceOnly: Boolean(after.tokenVaultRef),
    kmsKeyRefStoredAsReferenceOnly: Boolean(after.kmsKeyRef),
  };
}

function sameAuditValue(before: unknown, after: unknown) {
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.length === after.length && before.every((item, index) => item === after[index]);
  }
  return before === after;
}

function readRecord(record: {
  tokenVaultProvider: string;
  tokenVaultRef: string | null;
  kmsKeyRef: string | null;
  bankFileFormat: string;
  bankFormatVersion: string;
  bankFileColumnOrder?: string | null;
  bankFormatVerified: boolean;
  verificationStatus: string;
  lastVerifiedAt: Date | null;
  verificationNote: string | null;
}): PayrollPaymentSecuritySettings {
  return {
    tokenVaultProvider: record.tokenVaultProvider,
    tokenVaultRef: record.tokenVaultRef,
    kmsKeyRef: record.kmsKeyRef,
    bankFileFormat: record.bankFileFormat,
    bankFormatVersion: record.bankFormatVersion,
    bankFileColumnOrder: parseColumnOrder(record.bankFileColumnOrder),
    bankFormatVerified: record.bankFormatVerified,
    verificationStatus: normalizeVerificationStatus(record.verificationStatus),
    lastVerifiedAt: record.lastVerifiedAt,
    verificationNote: record.verificationNote,
  };
}

function writeRecord(settings: PayrollPaymentSecuritySettings) {
  return {
    tokenVaultProvider: settings.tokenVaultProvider,
    tokenVaultRef: settings.tokenVaultRef,
    kmsKeyRef: settings.kmsKeyRef,
    bankFileFormat: settings.bankFileFormat,
    bankFormatVersion: settings.bankFormatVersion,
    bankFileColumnOrder: settings.bankFileColumnOrder.join(","),
    bankFormatVerified: settings.bankFormatVerified,
    verificationStatus: settings.verificationStatus,
    lastVerifiedAt: settings.lastVerifiedAt,
    verificationNote: settings.verificationNote,
  };
}

function normalizeVerificationStatus(value: string): PayrollPaymentSecuritySettings["verificationStatus"] {
  if (value === "verified" || value === "failed") return value;
  return "unverified";
}

function normalizeColumnOrder(
  value: BankTransferColumnKey[] | undefined,
  fallback: BankTransferColumnKey[],
) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const seen = new Set<BankTransferColumnKey>();
  const columns = value.filter((column): column is BankTransferColumnKey => {
    if (!allowedBankTransferColumns.has(column) || seen.has(column)) return false;
    seen.add(column);
    return true;
  });
  return columns.length > 0 ? columns : fallback;
}

function parseColumnOrder(value: string | null | undefined) {
  if (!value) return defaultBankTransferColumnOrder;
  return normalizeColumnOrder(
    value.split(",").map((column) => column.trim()) as BankTransferColumnKey[],
    defaultBankTransferColumnOrder,
  );
}

function hasRequiredBankColumns(columns: BankTransferColumnKey[]) {
  return columns.includes("account_token_ref") && columns.includes("amount");
}

function cleanText(value: string | null | undefined) {
  const text = value?.trim();
  return text || null;
}

function cleanOptional(value: string | null | undefined) {
  const text = cleanText(value);
  return text || null;
}

function getDemoState() {
  if (!globalForPaymentSecurity.hrOnePayrollPaymentSecurityDemoState) {
    resetPayrollPaymentSecurityDemoState();
  }
  return globalForPaymentSecurity.hrOnePayrollPaymentSecurityDemoState!;
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
