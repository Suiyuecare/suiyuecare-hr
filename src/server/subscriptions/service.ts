import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type SubscriptionStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";
export type SubscriptionVerificationStatus = "unverified" | "verified" | "failed";

export type TenantSubscriptionView = {
  plan: string;
  status: SubscriptionStatus;
  seatLimit: number;
  activeSeatCount: number;
  trialEndsAt: Date | null;
  contractStartsAt: Date | null;
  contractEndsAt: Date | null;
  renewalNoticeDays: number;
  billingContactEmail: string | null;
  contractRef: string | null;
  contractHash: string | null;
  paymentCollectionMode: string;
  verificationStatus: SubscriptionVerificationStatus;
  lastReviewedAt: Date | null;
};

export type SubscriptionReadiness = {
  ready: boolean;
  seatUtilizationPercent: number;
  daysUntilTrialEnd: number | null;
  daysUntilContractEnd: number | null;
  missing: string[];
  detail: string;
};

export type SubscriptionWorkspace = {
  subscription: TenantSubscriptionView;
  readiness: SubscriptionReadiness;
};

const defaultSubscription: TenantSubscriptionView = {
  plan: "demo",
  status: "trial",
  seatLimit: 10,
  activeSeatCount: 6,
  trialEndsAt: addDays(new Date(), 14),
  contractStartsAt: null,
  contractEndsAt: null,
  renewalNoticeDays: 30,
  billingContactEmail: "owner@hrone.test",
  contractRef: null,
  contractHash: null,
  paymentCollectionMode: "manual_invoice",
  verificationStatus: "unverified",
  lastReviewedAt: null,
};

type SubscriptionDemoState = {
  subscription: TenantSubscriptionView;
};

const globalForSubscription = globalThis as unknown as {
  hrOneSubscriptionDemoState?: SubscriptionDemoState;
};

export async function getSubscriptionWorkspace(session: SessionLike): Promise<SubscriptionWorkspace> {
  assertPermission(session.role, "subscription:manage");
  if (canUseDatabase(session)) {
    try {
      return getDbSubscriptionWorkspace(session as SessionLike & { tenantId: string; companyId: string });
    } catch {
      return getDemoSubscriptionWorkspace();
    }
  }
  return getDemoSubscriptionWorkspace();
}

export async function getSubscriptionReadiness(session: SessionLike): Promise<SubscriptionReadiness> {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    try {
      return (await getDbSubscriptionWorkspace(session as SessionLike & { tenantId: string; companyId: string }))
        .readiness;
    } catch {
      return getDemoSubscriptionWorkspace().readiness;
    }
  }
  return getDemoSubscriptionWorkspace().readiness;
}

export async function updateTenantSubscription(session: SessionLike, input: Partial<TenantSubscriptionView>) {
  assertPermission(session.role, "subscription:manage");
  const before = (await getSubscriptionWorkspace(session)).subscription;
  const normalized = normalizeSubscription(input, before);
  if (canUseDatabase(session)) {
    try {
      return updateDbSubscription(session as SessionLike & { tenantId: string; companyId: string }, before, normalized);
    } catch {
      return updateDemoSubscription(session, before, normalized);
    }
  }
  return updateDemoSubscription(session, before, normalized);
}

export function evaluateSubscriptionReadiness(
  subscription: TenantSubscriptionView,
  now = new Date(),
): SubscriptionReadiness {
  const seatUtilizationPercent = subscription.seatLimit > 0
    ? Math.round((subscription.activeSeatCount / subscription.seatLimit) * 100)
    : 100;
  const daysUntilTrialEnd = subscription.trialEndsAt ? daysBetween(now, subscription.trialEndsAt) : null;
  const daysUntilContractEnd = subscription.contractEndsAt ? daysBetween(now, subscription.contractEndsAt) : null;
  const missing = [
    subscription.plan === "demo" ? "paid customer plan selected" : null,
    subscription.status !== "active" ? "active subscription status" : null,
    subscription.activeSeatCount > subscription.seatLimit ? "seat limit covers active users" : null,
    !subscription.billingContactEmail ? "billing contact email" : null,
    !subscription.contractRef || !subscription.contractHash ? "contract reference and hash" : null,
    !subscription.contractStartsAt || !subscription.contractEndsAt ? "contract term dates" : null,
    daysUntilContractEnd !== null && daysUntilContractEnd <= subscription.renewalNoticeDays
      ? "renewal review before contract end"
      : null,
    subscription.verificationStatus !== "verified" ? "commercial terms reviewed" : null,
  ].filter(Boolean) as string[];
  return {
    ready: missing.length === 0,
    seatUtilizationPercent,
    daysUntilTrialEnd,
    daysUntilContractEnd,
    missing,
    detail: `${subscription.plan} / ${subscription.status}; ${subscription.activeSeatCount}/${subscription.seatLimit} seat(s); trial ${daysUntilTrialEnd ?? "n/a"} day(s); contract ${daysUntilContractEnd ?? "n/a"} day(s); review ${subscription.verificationStatus}.`,
  };
}

export function resetSubscriptionDemoState() {
  globalForSubscription.hrOneSubscriptionDemoState = {
    subscription: cloneSubscription(defaultSubscription),
  };
}

async function getDbSubscriptionWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const db = getDb();
  const [record, activeSeatCount] = await Promise.all([
    db.tenantSubscription.findUnique({ where: { tenantId: session.tenantId } }),
    db.user.count({ where: { tenantId: session.tenantId, status: "active" } }),
  ]);
  const subscription = record
    ? readRecord({ ...record, activeSeatCount })
    : { ...defaultSubscription, activeSeatCount };
  return {
    subscription,
    readiness: evaluateSubscriptionReadiness(subscription),
  };
}

async function updateDbSubscription(
  session: SessionLike & { tenantId: string; companyId: string },
  before: TenantSubscriptionView,
  after: TenantSubscriptionView,
) {
  const db = getDb();
  const activeSeatCount = await db.user.count({ where: { tenantId: session.tenantId, status: "active" } });
  const normalized = { ...after, activeSeatCount };
  const record = await db.$transaction(async (tx) => {
    const updated = await tx.tenantSubscription.upsert({
      where: { tenantId: session.tenantId },
      create: {
        tenantId: session.tenantId,
        ...writeRecord(normalized),
        updatedByUserId: session.user?.id,
      },
      update: {
        ...writeRecord(normalized),
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "tenant_subscription",
      entityId: updated.id,
      before,
      after: normalized,
      metadata: subscriptionAuditMetadata(before, normalized),
    });
    return updated;
  });
  return readRecord(record);
}

function getDemoSubscriptionWorkspace(): SubscriptionWorkspace {
  const subscription = getDemoState().subscription;
  return {
    subscription,
    readiness: evaluateSubscriptionReadiness(subscription),
  };
}

function updateDemoSubscription(
  session: SessionLike,
  before: TenantSubscriptionView,
  after: TenantSubscriptionView,
) {
  getDemoState().subscription = cloneSubscription(after);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "tenant_subscription",
    entityId: "demo-tenant-subscription",
    before,
    after,
    metadata: subscriptionAuditMetadata(before, after),
  });
  return after;
}

function normalizeSubscription(
  input: Partial<TenantSubscriptionView>,
  before: TenantSubscriptionView,
): TenantSubscriptionView {
  const contractRef = cleanText(input.contractRef, 240) || before.contractRef;
  const contractHash = cleanText(input.contractHash, 128) ||
    (contractRef ? stableHash(contractRef) : before.contractHash);
  const verificationStatus = normalizeVerificationStatus(input.verificationStatus, before.verificationStatus);
  return {
    plan: cleanText(input.plan, 40) || before.plan,
    status: normalizeStatus(input.status, before.status),
    seatLimit: clampInteger(input.seatLimit, before.seatLimit, 1, 100000),
    activeSeatCount: clampInteger(input.activeSeatCount, before.activeSeatCount, 0, 100000),
    trialEndsAt: input.trialEndsAt === undefined ? before.trialEndsAt : normalizeDate(input.trialEndsAt),
    contractStartsAt: input.contractStartsAt === undefined ? before.contractStartsAt : normalizeDate(input.contractStartsAt),
    contractEndsAt: input.contractEndsAt === undefined ? before.contractEndsAt : normalizeDate(input.contractEndsAt),
    renewalNoticeDays: clampInteger(input.renewalNoticeDays, before.renewalNoticeDays, 1, 180),
    billingContactEmail: cleanEmail(input.billingContactEmail) || before.billingContactEmail,
    contractRef,
    contractHash,
    paymentCollectionMode: cleanText(input.paymentCollectionMode, 80) || before.paymentCollectionMode,
    verificationStatus,
    lastReviewedAt: verificationStatus === "verified" ? input.lastReviewedAt ?? before.lastReviewedAt ?? new Date() : null,
  };
}

function readRecord(record: {
  plan: string;
  status: string;
  seatLimit: number;
  activeSeatCount: number;
  trialEndsAt: Date | null;
  contractStartsAt: Date | null;
  contractEndsAt: Date | null;
  renewalNoticeDays: number;
  billingContactEmail: string | null;
  contractRef: string | null;
  contractHash: string | null;
  paymentCollectionMode: string;
  verificationStatus: string;
  lastReviewedAt: Date | null;
}): TenantSubscriptionView {
  return {
    plan: record.plan,
    status: normalizeStatus(record.status, "trial"),
    seatLimit: record.seatLimit,
    activeSeatCount: record.activeSeatCount,
    trialEndsAt: record.trialEndsAt,
    contractStartsAt: record.contractStartsAt,
    contractEndsAt: record.contractEndsAt,
    renewalNoticeDays: record.renewalNoticeDays,
    billingContactEmail: record.billingContactEmail,
    contractRef: record.contractRef,
    contractHash: record.contractHash,
    paymentCollectionMode: record.paymentCollectionMode,
    verificationStatus: normalizeVerificationStatus(record.verificationStatus, "unverified"),
    lastReviewedAt: record.lastReviewedAt,
  };
}

function writeRecord(subscription: TenantSubscriptionView) {
  return {
    plan: subscription.plan,
    status: subscription.status,
    seatLimit: subscription.seatLimit,
    activeSeatCount: subscription.activeSeatCount,
    trialEndsAt: subscription.trialEndsAt,
    contractStartsAt: subscription.contractStartsAt,
    contractEndsAt: subscription.contractEndsAt,
    renewalNoticeDays: subscription.renewalNoticeDays,
    billingContactEmail: subscription.billingContactEmail,
    contractRef: subscription.contractRef,
    contractHash: subscription.contractHash,
    paymentCollectionMode: subscription.paymentCollectionMode,
    verificationStatus: subscription.verificationStatus,
    lastReviewedAt: subscription.lastReviewedAt,
  };
}

function subscriptionAuditMetadata(before: TenantSubscriptionView, after: TenantSubscriptionView) {
  return {
    changedFields: changedFields(before, after),
    plan: after.plan,
    status: after.status,
    seatLimit: after.seatLimit,
    activeSeatCount: after.activeSeatCount,
    contractHash: after.contractHash,
    contractRefHash: after.contractRef ? stableHash(after.contractRef) : null,
    billingContactConfigured: Boolean(after.billingContactEmail),
    collectionMode: after.paymentCollectionMode,
    verificationStatus: after.verificationStatus,
    rawContractIncluded: false,
    rawFinancialDataIncluded: false,
  };
}

function getDemoState() {
  if (!globalForSubscription.hrOneSubscriptionDemoState) resetSubscriptionDemoState();
  return globalForSubscription.hrOneSubscriptionDemoState!;
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}

function normalizeStatus(value: unknown, fallback: SubscriptionStatus): SubscriptionStatus {
  if (value === "trial" || value === "active" || value === "past_due" || value === "suspended" || value === "cancelled") {
    return value;
  }
  return fallback;
}

function normalizeVerificationStatus(value: unknown, fallback: SubscriptionVerificationStatus): SubscriptionVerificationStatus {
  return value === "verified" || value === "failed" || value === "unverified" ? value : fallback;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function cloneSubscription(subscription: TenantSubscriptionView): TenantSubscriptionView {
  return {
    ...subscription,
    trialEndsAt: subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null,
    contractStartsAt: subscription.contractStartsAt ? new Date(subscription.contractStartsAt) : null,
    contractEndsAt: subscription.contractEndsAt ? new Date(subscription.contractEndsAt) : null,
    lastReviewedAt: subscription.lastReviewedAt ? new Date(subscription.lastReviewedAt) : null,
  };
}

function changedFields(before: TenantSubscriptionView, after: TenantSubscriptionView) {
  return Object.keys(after).filter((key) => {
    const typedKey = key as keyof TenantSubscriptionView;
    return JSON.stringify(before[typedKey]) !== JSON.stringify(after[typedKey]);
  });
}
