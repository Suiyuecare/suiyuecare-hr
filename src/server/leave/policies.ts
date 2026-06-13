import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import {
  taiwanStatutoryLeaveRequirements,
  type StatutoryLeaveCategory,
} from "@/server/leave/statutory";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type LeavePolicyInput = {
  id?: string | null;
  code: string;
  name: string;
  annualUnits: number;
  unit: string;
  attachmentRequired: boolean;
  status: "active" | "inactive";
  statutoryCategory: StatutoryLeaveCategory;
  eligibilityRule: "all_employees" | "employee_self" | "caregiver" | "parent" | "pregnancy_related" | "manual_review";
  payRatePercent: number;
  annualLimitNote?: string | null;
  requiresLegalReview: boolean;
  accrualMethod: "annual_grant" | "monthly_accrual" | "manual";
  minNoticeDays: number;
  carryoverLimitUnits?: number | null;
  paid: boolean;
  syncBalancesOnUpdate: boolean;
};

export type LeavePolicyView = LeavePolicyInput & {
  id: string;
  balanceCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type LeavePolicyDemoState = {
  policies: LeavePolicyView[];
};

const globalForLeavePolicies = globalThis as unknown as {
  hrOneLeavePolicyDemoState?: LeavePolicyDemoState;
};

export async function getLeavePolicySettings(session: SessionLike) {
  assertPermission(session.role, "employee:read");
  if (canUseDatabase(session)) {
    try {
      const policies = await getDb().leavePolicy.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        include: {
          _count: {
            select: { leaveBalances: true },
          },
        },
        orderBy: [{ status: "asc" }, { code: "asc" }],
      });
      return policies.map((policy) => ({
        id: policy.id,
        code: policy.code,
        name: policy.name,
        annualUnits: decimalToNumber(policy.annualUnits),
        unit: policy.unit,
        attachmentRequired: policy.attachmentRequired,
        status: normalizeStatus(policy.status),
        statutoryCategory: normalizeStatutoryCategory(policy.statutoryCategory),
        eligibilityRule: normalizeEligibilityRule(policy.eligibilityRule),
        payRatePercent: decimalToNumber(policy.payRatePercent),
        annualLimitNote: policy.annualLimitNote,
        requiresLegalReview: policy.requiresLegalReview,
        accrualMethod: normalizeAccrualMethod(policy.accrualMethod),
        minNoticeDays: policy.minNoticeDays,
        carryoverLimitUnits: decimalToNullableNumber(policy.carryoverLimitUnits),
        paid: policy.paid,
        syncBalancesOnUpdate: policy.syncBalancesOnUpdate,
        balanceCount: policy._count.leaveBalances,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
      }));
    } catch {
      return getLeavePolicyDemoState().policies;
    }
  }
  return getLeavePolicyDemoState().policies;
}

export async function saveLeavePolicySettings(session: SessionLike, input: LeavePolicyInput) {
  assertPermission(session.role, "employee:write");
  const normalized = normalizeLeavePolicyInput(input);
  if (canUseDatabase(session)) {
    try {
      return await saveDbLeavePolicySettings(session, normalized);
    } catch {
      return saveDemoLeavePolicySettings(session, normalized);
    }
  }
  return saveDemoLeavePolicySettings(session, normalized);
}

export function resetLeavePolicyDemoState() {
  const now = new Date();
  globalForLeavePolicies.hrOneLeavePolicyDemoState = {
    policies: taiwanStatutoryLeaveRequirements.map((requirement) => ({
      id: `demo-leave-policy-${requirement.recommendedCode}`,
      code: requirement.recommendedCode,
      name: requirement.name,
      annualUnits: requirement.annualUnits,
      unit: requirement.unit,
      attachmentRequired: requirement.category === "sick_leave" || requirement.category === "occupational_injury",
      status: "active",
      statutoryCategory: requirement.category,
      eligibilityRule: requirement.eligibilityRule,
      payRatePercent: requirement.payRatePercent,
      annualLimitNote: requirement.note,
      requiresLegalReview: false,
      accrualMethod: requirement.accrualMethod,
      minNoticeDays: 0,
      carryoverLimitUnits: null,
      paid: requirement.paid,
      syncBalancesOnUpdate: requirement.category === "annual_leave",
      balanceCount: requirement.category === "annual_leave" ? 5 : 0,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

async function saveDbLeavePolicySettings(
  session: SessionLike,
  input: ReturnType<typeof normalizeLeavePolicyInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = input.id
      ? await tx.leavePolicy.findFirst({
          where: {
            id: input.id,
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
        })
      : await tx.leavePolicy.findFirst({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            code: input.code,
          },
        });

    const policy = before
      ? await tx.leavePolicy.update({
          where: { id: before.id },
          data: dbPolicyData(input),
        })
      : await tx.leavePolicy.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            ...dbPolicyData(input),
          },
        });

    let balanceCount = await tx.leaveBalance.count({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        leavePolicyId: policy.id,
      },
    });

    if (input.syncBalancesOnUpdate && policy.status === "active") {
      const employees = await tx.employee.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employmentStatus: "active",
        },
        select: { id: true },
      });
      for (const employee of employees) {
        await tx.leaveBalance.upsert({
          where: {
            employeeId_leavePolicyId: {
              employeeId: employee.id,
              leavePolicyId: policy.id,
            },
          },
          create: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            employeeId: employee.id,
            leavePolicyId: policy.id,
            grantedUnits: input.annualUnits,
            usedUnits: 0,
            pendingUnits: 0,
            currentYearUnits: input.annualUnits,
            remainingUnits: input.annualUnits,
          },
          update: {},
        });
      }
      balanceCount = employees.length;
    }

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "leave_policy",
      entityId: policy.id,
      before,
      after: policy,
      metadata: {
        code: policy.code,
        status: policy.status,
        syncBalancesOnUpdate: input.syncBalancesOnUpdate,
      },
    });

    return {
      id: policy.id,
      code: policy.code,
      name: policy.name,
      annualUnits: decimalToNumber(policy.annualUnits),
      unit: policy.unit,
      attachmentRequired: policy.attachmentRequired,
      status: normalizeStatus(policy.status),
      statutoryCategory: normalizeStatutoryCategory(policy.statutoryCategory),
      eligibilityRule: normalizeEligibilityRule(policy.eligibilityRule),
      payRatePercent: decimalToNumber(policy.payRatePercent),
      annualLimitNote: policy.annualLimitNote,
      requiresLegalReview: policy.requiresLegalReview,
      accrualMethod: normalizeAccrualMethod(policy.accrualMethod),
      minNoticeDays: policy.minNoticeDays,
      carryoverLimitUnits: decimalToNullableNumber(policy.carryoverLimitUnits),
      paid: policy.paid,
      syncBalancesOnUpdate: policy.syncBalancesOnUpdate,
      balanceCount,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  });
}

function saveDemoLeavePolicySettings(
  session: SessionLike,
  input: ReturnType<typeof normalizeLeavePolicyInput>,
) {
  const state = getLeavePolicyDemoState();
  const existingIndex = state.policies.findIndex((policy) => policy.id === input.id || policy.code === input.code);
  const now = new Date();
  const policy: LeavePolicyView = {
    id: existingIndex >= 0 ? state.policies[existingIndex].id : crypto.randomUUID(),
    code: input.code,
    name: input.name,
    annualUnits: input.annualUnits,
    unit: input.unit,
    attachmentRequired: input.attachmentRequired,
    status: input.status,
    statutoryCategory: input.statutoryCategory,
    eligibilityRule: input.eligibilityRule,
    payRatePercent: input.payRatePercent,
    annualLimitNote: input.annualLimitNote,
    requiresLegalReview: input.requiresLegalReview,
    accrualMethod: input.accrualMethod,
    minNoticeDays: input.minNoticeDays,
    carryoverLimitUnits: input.carryoverLimitUnits,
    paid: input.paid,
    syncBalancesOnUpdate: input.syncBalancesOnUpdate,
    balanceCount: input.syncBalancesOnUpdate ? 5 : existingIndex >= 0 ? state.policies[existingIndex].balanceCount : 0,
    createdAt: existingIndex >= 0 ? state.policies[existingIndex].createdAt : now,
    updatedAt: now,
  };
  if (existingIndex >= 0) {
    state.policies[existingIndex] = policy;
  } else {
    state.policies.unshift(policy);
  }
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: existingIndex >= 0 ? "update" : "create",
    entityType: "leave_policy",
    entityId: policy.id,
    after: policy,
    metadata: {
      code: policy.code,
      status: policy.status,
      statutoryCategory: policy.statutoryCategory,
      eligibilityRule: policy.eligibilityRule,
      payRatePercent: policy.payRatePercent,
      requiresLegalReview: policy.requiresLegalReview,
      syncBalancesOnUpdate: policy.syncBalancesOnUpdate,
    },
  });
  return policy;
}

function normalizeLeavePolicyInput(input: LeavePolicyInput) {
  const code = input.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const name = input.name.trim();
  const annualUnits = Number(input.annualUnits);
  const payRatePercent = Number(input.payRatePercent);
  const minNoticeDays = Math.max(0, Math.round(Number(input.minNoticeDays) || 0));
  const carryoverLimitUnits =
    input.carryoverLimitUnits === null || input.carryoverLimitUnits === undefined
      ? null
      : Number(input.carryoverLimitUnits);
  if (!code) throw new Error("Leave code is required.");
  if (!name) throw new Error("Leave name is required.");
  if (!Number.isFinite(annualUnits) || annualUnits < 0) {
    throw new Error("Annual units must be zero or greater.");
  }
  if (!Number.isFinite(payRatePercent) || payRatePercent < 0 || payRatePercent > 100) {
    throw new Error("Pay rate percent must be between 0 and 100.");
  }
  if (carryoverLimitUnits !== null && (!Number.isFinite(carryoverLimitUnits) || carryoverLimitUnits < 0)) {
    throw new Error("Carryover limit must be zero or greater.");
  }
  return {
    id: input.id || null,
    code,
    name,
    annualUnits: roundUnits(annualUnits),
    unit: input.unit === "hour" ? "hour" : "day",
    attachmentRequired: Boolean(input.attachmentRequired),
    status: normalizeStatus(input.status),
    statutoryCategory: normalizeStatutoryCategory(input.statutoryCategory),
    eligibilityRule: normalizeEligibilityRule(input.eligibilityRule),
    payRatePercent: roundUnits(payRatePercent),
    annualLimitNote: cleanOptionalText(input.annualLimitNote),
    requiresLegalReview: Boolean(input.requiresLegalReview),
    accrualMethod: normalizeAccrualMethod(input.accrualMethod),
    minNoticeDays,
    carryoverLimitUnits: carryoverLimitUnits === null ? null : roundUnits(carryoverLimitUnits),
    paid: Boolean(input.paid),
    syncBalancesOnUpdate: Boolean(input.syncBalancesOnUpdate),
  };
}

function dbPolicyData(input: ReturnType<typeof normalizeLeavePolicyInput>) {
  return {
    code: input.code,
    name: input.name,
    annualUnits: input.annualUnits,
    unit: input.unit,
    attachmentRequired: input.attachmentRequired,
    status: input.status,
    statutoryCategory: input.statutoryCategory,
    eligibilityRule: input.eligibilityRule,
    payRatePercent: input.payRatePercent,
    annualLimitNote: input.annualLimitNote,
    requiresLegalReview: input.requiresLegalReview,
    accrualMethod: input.accrualMethod,
    minNoticeDays: input.minNoticeDays,
    carryoverLimitUnits: input.carryoverLimitUnits,
    paid: input.paid,
    syncBalancesOnUpdate: input.syncBalancesOnUpdate,
  };
}

function getLeavePolicyDemoState() {
  if (!globalForLeavePolicies.hrOneLeavePolicyDemoState) {
    resetLeavePolicyDemoState();
  }
  return globalForLeavePolicies.hrOneLeavePolicyDemoState!;
}

function normalizeStatus(value: string): LeavePolicyView["status"] {
  return value === "inactive" ? "inactive" : "active";
}

function normalizeAccrualMethod(value: string): LeavePolicyView["accrualMethod"] {
  if (value === "monthly_accrual" || value === "manual") return value;
  return "annual_grant";
}

function normalizeStatutoryCategory(value: string): LeavePolicyView["statutoryCategory"] {
  if (
    value === "annual_leave" ||
    value === "sick_leave" ||
    value === "personal_leave" ||
    value === "family_care" ||
    value === "menstrual" ||
    value === "parental" ||
    value === "maternity" ||
    value === "paternity" ||
    value === "bereavement" ||
    value === "marriage" ||
    value === "official" ||
    value === "occupational_injury"
  ) {
    return value;
  }
  return "company";
}

function normalizeEligibilityRule(value: string): LeavePolicyView["eligibilityRule"] {
  if (
    value === "employee_self" ||
    value === "caregiver" ||
    value === "parent" ||
    value === "pregnancy_related" ||
    value === "manual_review"
  ) {
    return value;
  }
  return "all_employees";
}

function cleanOptionalText(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function decimalToNumber(value: unknown) {
  const parsed = decimalToNullableNumber(value);
  return parsed ?? 0;
}

function decimalToNullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundUnits(value: number) {
  return Math.round(value * 100) / 100;
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
