import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import {
  calculateUnusedAnnualLeavePayout,
  defaultTaiwanLaborStandardsConfig,
} from "@/server/rules/taiwan-labor-standards";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";
import { getDemoPayrollRun } from "@/server/payroll/demo-store";
import type { AnnualLeaveSettlementInput } from "@/server/payroll/types";
import { getAnnualLeaveSettlementDemoState } from "./annual-leave-settlement-demo-store";

export { resetAnnualLeaveSettlementDemoState } from "./annual-leave-settlement-demo-store";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type AnnualLeaveSettlementView = {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  reason: "year_end" | "contract_termination";
  status: "draft" | "included" | "voided";
  unusedUnits: number;
  dailyRegularWage: number;
  amount: number;
  carriedFromPreviousYear: boolean;
  sourceIds: string[];
};

export type AnnualLeaveSettlementWorkspace = {
  payrollRun: {
    id: string;
    status: string;
    periodLabel: string;
  } | null;
  settlements: AnnualLeaveSettlementView[];
  auditCount: number;
};

export async function getAnnualLeaveSettlementWorkspace(
  session: SessionLike,
): Promise<AnnualLeaveSettlementWorkspace> {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      const run = await getDb().payrollRun.findFirst({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        orderBy: { periodStart: "desc" },
      });
      const settlements = run ? await listDbAnnualLeaveSettlements(session, run.id) : [];
      return {
        payrollRun: run
          ? {
              id: run.id,
              status: run.status,
              periodLabel: formatPeriod(run.periodStart),
            }
          : null,
        settlements,
        auditCount: await getDb().auditLog.count({
          where: { tenantId: session.tenantId!, companyId: session.companyId! },
        }),
      };
    } catch {
      return getDemoAnnualLeaveSettlementWorkspace();
    }
  }
  return getDemoAnnualLeaveSettlementWorkspace();
}

export async function prepareAnnualLeaveSettlements(
  session: SessionLike,
  input: { payrollRunId?: string | null; reason?: "year_end" | "contract_termination" },
) {
  assertPermission(session.role, "payroll:manage");
  const reason = input.reason ?? "year_end";
  if (canUseDatabase(session)) {
    try {
      return prepareDbAnnualLeaveSettlements(session, {
        payrollRunId: input.payrollRunId ?? null,
        reason,
      });
    } catch {
      return prepareDemoAnnualLeaveSettlements(session, reason);
    }
  }
  return prepareDemoAnnualLeaveSettlements(session, reason);
}

export async function getAnnualLeaveSettlementsForPayroll(
  session: Omit<SessionLike, "role">,
  payrollRunId: string,
) {
  if (!canUseDatabase(session)) return new Map<string, AnnualLeaveSettlementInput[]>();
  const rows = await getDb().annualLeaveSettlement.findMany({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      payrollRunId,
      status: { in: ["draft", "included"] },
      voidedAt: null,
    },
  });
  return groupSettlementInputs(
    rows.map((row) => ({
      employeeId: row.employeeId,
      unusedDays: decimalToNumber(row.unusedUnits) ?? 0,
      reason: normalizeReason(row.reason),
      carriedFromPreviousYear: row.carriedFromPreviousYear,
      dailyRegularWage: decimalToNumber(row.dailyRegularWage),
    })),
  );
}

export async function applyAnnualLeaveSettlementBalancesForPayrollLock(
  tx: Prisma.TransactionClient,
  session: Omit<SessionLike, "role">,
  payrollRunId: string,
) {
  const settlements = await tx.annualLeaveSettlement.findMany({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      payrollRunId,
      status: "included",
      leaveBalanceId: { not: null },
      voidedAt: null,
    },
    include: {
      leaveBalance: true,
    },
  });
  for (const settlement of settlements) {
    if (!settlement.leaveBalance) continue;
    const before = settlement.leaveBalance;
    const settledUnits = decimalToNumber(settlement.unusedUnits) ?? 0;
    const carryoverRemaining = Math.max(
      0,
      roundUnits((decimalToNumber(before.carryoverUnits) ?? 0) - (decimalToNumber(before.carryoverUsedUnits) ?? 0)),
    );
    const carryoverSettlementUnits = Math.min(carryoverRemaining, settledUnits);
    const currentYearSettlementUnits = roundUnits(settledUnits - carryoverSettlementUnits);
    const nextSettledUnits = roundUnits((decimalToNumber(before.settledUnits) ?? 0) + settledUnits);
    const nextRemainingUnits = Math.max(
      0,
      roundUnits((decimalToNumber(before.remainingUnits) ?? 0) - settledUnits),
    );
    const after = await tx.leaveBalance.update({
      where: { id: before.id },
      data: {
        settledUnits: nextSettledUnits,
        carryoverUsedUnits: roundUnits((decimalToNumber(before.carryoverUsedUnits) ?? 0) + carryoverSettlementUnits),
        currentYearUsedUnits: roundUnits((decimalToNumber(before.currentYearUsedUnits) ?? 0) + currentYearSettlementUnits),
        remainingUnits: nextRemainingUnits,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "leave_balance",
      entityId: before.id,
      before,
      after,
      metadata: {
        payrollRunId,
        annualLeaveSettlementId: settlement.id,
        reason: settlement.reason,
        settlementUnits: settledUnits,
        balanceCloseReason: "unused_annual_leave_payout",
      },
    });
  }
  return settlements.length;
}

async function prepareDbAnnualLeaveSettlements(
  session: SessionLike,
  input: { payrollRunId: string | null; reason: "year_end" | "contract_termination" },
) {
  const db = getDb();
  const run = input.payrollRunId
    ? await db.payrollRun.findFirst({
        where: {
          id: input.payrollRunId,
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
      })
    : await db.payrollRun.findFirst({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        orderBy: { periodStart: "desc" },
      });
  if (!run) throw new Error("Create a payroll run before preparing annual leave settlement.");
  if (run.status === "locked" || run.status === "released") {
    throw new Error("Annual leave settlement must be prepared before payroll lock.");
  }

  const [balances, laborConfig] = await Promise.all([
    db.leaveBalance.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        remainingUnits: { gt: 0 },
        leavePolicy: {
          code: "annual",
          paid: true,
          status: "active",
        },
      },
      include: {
        employee: {
          include: {
            salaryProfiles: {
              orderBy: { effectiveFrom: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { employeeId: "asc" },
    }),
    getTaiwanLaborStandardsConfig(session),
  ]);

  const sourceIds = laborConfig.sources
    .filter((source) => source.id === "tw-lsa-article-38" || source.id === "tw-lsa-enforcement-article-24-1")
    .map((source) => source.id);
  const rows = balances.flatMap((balance) => {
    const salaryProfile = balance.employee.salaryProfiles[0];
    if (!salaryProfile) return [];
    const carryoverRemaining = Math.max(
      0,
      roundUnits((decimalToNumber(balance.carryoverUnits) ?? 0) - (decimalToNumber(balance.carryoverUsedUnits) ?? 0)),
    );
    const unusedUnits = carryoverRemaining > 0 ? carryoverRemaining : decimalToNumber(balance.remainingUnits) ?? 0;
    const monthlyRegularWage = decimalToNumber(salaryProfile.baseSalary) ?? 0;
    if (unusedUnits <= 0 || monthlyRegularWage <= 0) return [];
    const payout = calculateUnusedAnnualLeavePayout({
      unusedDays: unusedUnits,
      monthlyRegularWage,
      reason: input.reason,
      carriedFromPreviousYear: false,
      config: laborConfig,
    });
    return {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      payrollRunId: run.id,
      employeeId: balance.employeeId,
      leaveBalanceId: balance.id,
      reason: input.reason,
      status: "draft",
      unusedUnits,
      dailyRegularWage: payout.dailyWage,
      amount: payout.amount,
      carriedFromPreviousYear: carryoverRemaining > 0,
      sourceYearStart: new Date(run.periodEnd.getFullYear(), 0, 1),
      sourceYearEnd: run.periodEnd,
      sourceRuleIdsJson: sourceIds,
      preparedByUserId: session.user?.id,
    };
  });

  const settlements = await db.$transaction(async (tx) => {
    await tx.annualLeaveSettlement.deleteMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        payrollRunId: run.id,
        reason: input.reason,
        status: "draft",
      },
    });
    if (rows.length > 0) {
      await tx.annualLeaveSettlement.createMany({
        data: rows.map((row) => ({
          ...row,
          sourceRuleIdsJson: row.sourceRuleIdsJson as Prisma.InputJsonValue,
        })),
      });
    }
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "annual_leave_settlement_batch",
      entityId: run.id,
      before: null,
      after: {
        payrollRunId: run.id,
        reason: input.reason,
        settlementCount: rows.length,
      },
      metadata: {
        payrollRunId: run.id,
        reason: input.reason,
        settlementCount: rows.length,
        sourceIds,
        payrollValuesRedacted: true,
      },
    });
    return tx.annualLeaveSettlement.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        payrollRunId: run.id,
      },
      include: { employee: true },
      orderBy: [{ status: "asc" }, { employeeId: "asc" }],
    });
  });

  return settlements.map(mapDbSettlement);
}

async function listDbAnnualLeaveSettlements(session: SessionLike, payrollRunId: string) {
  const rows = await getDb().annualLeaveSettlement.findMany({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      payrollRunId,
    },
    include: { employee: true },
    orderBy: [{ status: "asc" }, { employeeId: "asc" }],
  });
  return rows.map(mapDbSettlement);
}

function getDemoAnnualLeaveSettlementWorkspace(): AnnualLeaveSettlementWorkspace {
  const run = getDemoPayrollRun();
  const state = getAnnualLeaveSettlementDemoState();
  return {
    payrollRun: run
      ? {
          id: run.id,
          status: run.status,
          periodLabel: formatPeriod(run.periodStart),
        }
      : null,
    settlements: state.settlements,
    auditCount: state.auditCount,
  };
}

function prepareDemoAnnualLeaveSettlements(
  session: SessionLike,
  reason: "year_end" | "contract_termination",
) {
  const run = getDemoPayrollRun();
  if (!run) throw new Error("Create a payroll run before preparing annual leave settlement.");
  if (run.status === "locked" || run.status === "released") {
    throw new Error("Annual leave settlement must be prepared before payroll lock.");
  }
  const sourceIds = ["tw-lsa-article-38", "tw-lsa-enforcement-article-24-1"];
  const demoRows = [
    { employeeId: "demo-employee-1", employeeName: "張小安", unusedUnits: 2.5, monthlyRegularWage: 56000 },
    { employeeId: "demo-employee-2", employeeName: "李小真", unusedUnits: 1, monthlyRegularWage: 54000 },
  ];
  const state = getAnnualLeaveSettlementDemoState();
  state.settlements = demoRows.map((row) => {
    const payout = calculateUnusedAnnualLeavePayout({
      unusedDays: row.unusedUnits,
      monthlyRegularWage: row.monthlyRegularWage,
      reason,
      config: defaultTaiwanLaborStandardsConfig,
    });
    return {
      id: `demo-annual-leave-settlement-${row.employeeId}`,
      payrollRunId: run.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      reason,
      status: "draft",
      unusedUnits: row.unusedUnits,
      dailyRegularWage: payout.dailyWage,
      amount: payout.amount,
      carriedFromPreviousYear: false,
      sourceIds,
    };
  });
  state.auditCount += 1;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "annual_leave_settlement_batch",
    entityId: run.id,
    before: null,
    after: {
      payrollRunId: run.id,
      reason,
      settlementCount: state.settlements.length,
    },
    metadata: {
      reason,
      settlementCount: state.settlements.length,
      sourceIds,
      payrollValuesRedacted: true,
    },
  });
  return state.settlements;
}

function groupSettlementInputs(
  rows: Array<AnnualLeaveSettlementInput & { employeeId: string }>,
) {
  const map = new Map<string, AnnualLeaveSettlementInput[]>();
  for (const row of rows) {
    const { employeeId, ...settlement } = row;
    map.set(employeeId, [...(map.get(employeeId) ?? []), settlement]);
  }
  return map;
}

function mapDbSettlement(
  row: Prisma.AnnualLeaveSettlementGetPayload<{ include: { employee: true } }>,
): AnnualLeaveSettlementView {
  return {
    id: row.id,
    payrollRunId: row.payrollRunId,
    employeeId: row.employeeId,
    employeeName: row.employee.displayName,
    reason: normalizeReason(row.reason),
    status: normalizeStatus(row.status),
    unusedUnits: decimalToNumber(row.unusedUnits) ?? 0,
    dailyRegularWage: decimalToNumber(row.dailyRegularWage) ?? 0,
    amount: decimalToNumber(row.amount) ?? 0,
    carriedFromPreviousYear: row.carriedFromPreviousYear,
    sourceIds: Array.isArray(row.sourceRuleIdsJson)
      ? row.sourceRuleIdsJson.map((item) => String(item))
      : [],
  };
}

function normalizeReason(value: string): "year_end" | "contract_termination" {
  return value === "contract_termination" ? "contract_termination" : "year_end";
}

function normalizeStatus(value: string): "draft" | "included" | "voided" {
  if (value === "included" || value === "voided") return value;
  return "draft";
}

function formatPeriod(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function roundUnits(value: number) {
  return Math.round(value * 100) / 100;
}

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canUseDatabase(session: { tenantId: string | null; companyId: string | null }) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
