import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { getDb } from "@/server/db/client";
import {
  applyAnnualLeaveSettlementBalancesForPayrollLock,
  getAnnualLeaveSettlementsForPayroll,
} from "@/server/leave/annual-leave-settlements";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";
import {
  calculateEmployeePayroll,
  canLockPayroll,
  closeChecklist,
  evaluatePayrollRuleReview,
  type PayrollRuleConfig,
} from "./calculation";
import type {
  MoneyItem,
  PayrollComplianceProfileView,
  PayrollRunView,
  PayslipView,
  SalaryProfileView,
} from "./types";

type SessionLike = {
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export async function getDbPayrollDashboard(session: SessionLike) {
  const run = await getLatestDbPayrollRun(session);
  const laborConfig = await getTaiwanLaborStandardsConfig(session as Parameters<typeof getTaiwanLaborStandardsConfig>[0]);
  const ruleReview = evaluatePayrollRuleReview({
    payrollRuleVersionId: run?.ruleVersionId ?? null,
    laborConfig,
  });
  const checklist = closeChecklist({
    attendanceComplete: Boolean(run?.attendanceComplete),
    pendingApprovalCount: run?.pendingApprovalCount ?? 0,
    exceptionCount: run?.exceptionCount ?? 0,
    calculated: Boolean(run && run.items.length > 0),
    exceptionsReviewed: run?.status === "confirmed" || run?.status === "locked" || run?.status === "released",
    confirmed: run?.status === "confirmed" || run?.status === "locked" || run?.status === "released",
    locked: run?.status === "locked" || run?.status === "released",
    released: run?.status === "released",
    ruleReview,
  });
  return {
    run,
    checklist: {
      attendanceComplete: Boolean(run?.attendanceComplete),
      pendingApprovalCount: run?.pendingApprovalCount ?? 0,
      exceptionCount: run?.exceptionCount ?? 0,
      ruleReview: checklist.ruleReview,
      legalGate: checklist.legalGate,
      canCalculate: checklist.canCalculate,
      canLock: checklist.canLock,
      steps: [...checklist.steps],
    },
  };
}

export async function createDbPayrollRun(session: SessionLike) {
  const db = getDb();
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const payDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  const [blockers, laborConfig] = await Promise.all([
    getPayrollBlockers(session),
    getTaiwanLaborStandardsConfig(session as Parameters<typeof getTaiwanLaborStandardsConfig>[0]),
  ]);

  const run = await db.$transaction(async (tx) => {
    const created = await tx.payrollRun.upsert({
      where: {
        companyId_periodStart_periodEnd: {
          companyId: session.companyId!,
          periodStart,
          periodEnd,
        },
      },
      create: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        periodStart,
        periodEnd,
        payDate,
        status: blockers.attendanceComplete && blockers.pendingApprovalCount === 0 ? "draft" : "blocked",
        attendanceComplete: blockers.attendanceComplete,
        pendingApprovalCount: blockers.pendingApprovalCount,
        exceptionCount: blockers.exceptionCount,
        ruleVersionId: laborConfig.version,
        createdByUserId: session.user?.id,
      },
      update: {
        payDate,
        status: blockers.attendanceComplete && blockers.pendingApprovalCount === 0 ? "draft" : "blocked",
        attendanceComplete: blockers.attendanceComplete,
        pendingApprovalCount: blockers.pendingApprovalCount,
        exceptionCount: blockers.exceptionCount,
      },
      include: payrollRunInclude,
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "payroll_run",
      entityId: created.id,
      after: {
        id: created.id,
        periodStart,
        periodEnd,
        status: created.status,
      },
      metadata: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        attendanceComplete: blockers.attendanceComplete,
        pendingApprovalCount: blockers.pendingApprovalCount,
        exceptionCount: blockers.exceptionCount,
      },
    });
    return created;
  });

  return mapPayrollRun(run, await auditCount(session));
}

export async function resolveDbPayrollBlockers(session: SessionLike) {
  const run = await getLatestDbPayrollRunRecord(session);
  if (!run) return null;
  await getDb().payrollRun.update({
    where: { id: run.id },
    data: {
      attendanceComplete: true,
      pendingApprovalCount: 0,
      exceptionCount: 0,
      status: "draft",
    },
  });
  return getLatestDbPayrollRun(session);
}

export async function recalculateDbPayrollRun(session: SessionLike) {
  const db = getDb();
  const existingRun = await getLatestDbPayrollRunRecord(session);
  if (!existingRun) {
    return createDbPayrollRun(session);
  }
  if (!existingRun.attendanceComplete || existingRun.pendingApprovalCount > 0 || existingRun.exceptionCount > 0) {
    const blocked = await db.payrollRun.update({
      where: { id: existingRun.id },
      data: { status: "blocked" },
      include: payrollRunInclude,
    });
    return mapPayrollRun(blocked, await auditCount(session));
  }

  const [salaryProfiles, complianceProfiles, laborConfig, annualLeaveSettlements] = await Promise.all([
    getActiveSalaryProfiles(session),
    getActiveComplianceProfiles(session),
    getTaiwanLaborStandardsConfig(session as Parameters<typeof getTaiwanLaborStandardsConfig>[0]),
    getAnnualLeaveSettlementsForPayroll(session, existingRun.id),
  ]);
  const rule: PayrollRuleConfig = {
    overtimeMultiplier: 4 / 3,
    standardMonthlyHours: laborConfig.payrollStandardMonthlyHours,
    ruleVersionId: laborConfig.version,
    taiwanLaborStandards: laborConfig,
  };
  const results = salaryProfiles.map((profile) =>
    calculateEmployeePayroll({
      salaryProfile: profile,
      complianceProfile: complianceProfiles.get(profile.employeeId) ?? null,
      approvedOvertimeMinutes: 0,
      annualLeaveSettlements: annualLeaveSettlements.get(profile.employeeId) ?? [],
      rule,
    }),
  );
  const payrollItems = results.flatMap((result) => result.items);
  const grossTotal = sumBy(results, "grossPay");
  const deductionTotal = sumBy(results, "deductionTotal");
  const netTotal = sumBy(results, "netPay");

  const run = await db.$transaction(async (tx) => {
    await tx.payrollItem.deleteMany({ where: { payrollRunId: existingRun.id } });
    await tx.payrollItem.createMany({
      data: payrollItems.map((item) => ({
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        payrollRunId: existingRun.id,
        employeeId: item.employeeId,
        kind: item.kind,
        code: item.code,
        name: item.name,
        amount: item.amount,
        quantity: item.quantity,
        ruleVersionId: item.ruleVersionId,
        metadataJson: (item.metadata ?? {}) as Prisma.InputJsonValue,
      })),
    });
    await tx.annualLeaveSettlement.updateMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        payrollRunId: existingRun.id,
        status: "draft",
      },
      data: {
        status: "included",
        includedAt: new Date(),
      },
    });
    const updated = await tx.payrollRun.update({
      where: { id: existingRun.id },
      data: {
        status: "calculated",
        ruleVersionId: laborConfig.version,
        grossTotal,
        deductionTotal,
        netTotal,
      },
      include: payrollRunInclude,
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "payroll_run",
      entityId: existingRun.id,
      before: {
        status: existingRun.status,
        grossTotal: existingRun.grossTotal,
        deductionTotal: existingRun.deductionTotal,
        netTotal: existingRun.netTotal,
      },
      after: { status: "calculated", grossTotal, deductionTotal, netTotal },
      metadata: {
        employeeCount: salaryProfiles.length,
        itemCount: payrollItems.length,
        ruleVersionId: laborConfig.version,
        ruleChangeControl: laborConfig.changeControl,
        payrollValuesRedacted: true,
      },
    });
    return updated;
  });

  return mapPayrollRun(run, await auditCount(session));
}

export async function confirmDbPayrollRun(session: SessionLike) {
  const run = await getLatestDbPayrollRunRecord(session);
  if (!run) return null;
  if (run.status !== "calculated" && run.status !== "confirmed") {
    throw new Error("Payroll must be calculated before HR confirmation.");
  }

  const updated = await getDb().$transaction(async (tx) => {
    const confirmed = await tx.payrollRun.update({
      where: { id: run.id },
      data: { status: "confirmed" },
      include: payrollRunInclude,
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "payroll_run",
      entityId: run.id,
      before: { status: run.status },
      after: { status: "confirmed" },
      metadata: {
        step: "hr_confirmation",
        payrollValuesRedacted: true,
      },
    });
    return confirmed;
  });

  return mapPayrollRun(updated, await auditCount(session));
}

export async function lockDbPayrollRun(session: SessionLike) {
  const run = await getLatestDbPayrollRunRecord(session);
  if (!run) return null;
  if (run.status !== "confirmed") {
    throw new Error("Payroll must be HR confirmed before lock.");
  }
  if (
    evaluatePayrollRuleReview({
      payrollRuleVersionId: run.ruleVersionId,
      laborConfig: await getTaiwanLaborStandardsConfig(session as Parameters<typeof getTaiwanLaborStandardsConfig>[0]),
    }).blocksLock ||
    !canLockPayroll({
      attendanceComplete: run.attendanceComplete,
      pendingApprovalCount: run.pendingApprovalCount,
      exceptionCount: run.exceptionCount,
      status: run.status,
    })
  ) {
    throw new Error("Payroll cannot be locked until blockers are cleared.");
  }

  const updated = await getDb().$transaction(async (tx) => {
    const settlementBalanceCount = await applyAnnualLeaveSettlementBalancesForPayrollLock(tx, session, run.id);
    const locked = await tx.payrollRun.update({
      where: { id: run.id },
      data: {
        status: "locked",
        lockedAt: new Date(),
      },
      include: payrollRunInclude,
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "payroll_run",
      entityId: run.id,
      before: { status: run.status, lockedAt: run.lockedAt },
      after: { status: "locked", lockedAt: locked.lockedAt },
      metadata: {
        step: "payroll_lock",
        mutationGuard: "locked_payroll_requires_adjustment_flow",
        annualLeaveSettlementBalanceCount: settlementBalanceCount,
        payrollValuesRedacted: true,
      },
    });
    return locked;
  });

  return mapPayrollRun(updated, await auditCount(session));
}

export async function releaseDbPayslips(session: SessionLike) {
  const run = await getDb().payrollRun.findFirst({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
    orderBy: { periodStart: "desc" },
    include: payrollRunInclude,
  });
  if (!run) return null;
  if (run.status !== "locked" && run.status !== "released") {
    throw new Error("Payslips can only be released after payroll lock.");
  }

  const itemsByEmployee = groupItemsByEmployee(run.items.map((item) => ({
    employeeId: item.employeeId,
    employeeName: item.employee.displayName,
    kind: item.kind,
    code: item.code,
    name: item.name,
    amount: decimalToNumber(item.amount) ?? 0,
    quantity: decimalToNumber(item.quantity) ?? undefined,
    ruleVersionId: item.ruleVersionId,
    metadata: item.metadataJson && typeof item.metadataJson === "object" && !Array.isArray(item.metadataJson)
      ? item.metadataJson as Record<string, unknown>
      : {},
  })));

  const updated = await getDb().$transaction(async (tx) => {
    for (const [employeeId, items] of itemsByEmployee.entries()) {
      const grossPay = items
        .filter((item) => item.kind === "earning" || item.kind === "allowance" || item.kind === "overtime")
        .reduce((total, item) => total + item.amount, 0);
      const deductions = items
        .filter((item) => item.kind === "deduction")
        .reduce((total, item) => total + item.amount, 0);
      await tx.payslip.upsert({
        where: {
          payrollRunId_employeeId: {
            payrollRunId: run.id,
            employeeId,
          },
        },
        create: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          payrollRunId: run.id,
          employeeId,
          grossPay,
          deductions,
          netPay: grossPay - deductions,
          status: "released",
          releasedAt: new Date(),
        },
        update: {
          grossPay,
          deductions,
          netPay: grossPay - deductions,
          status: "released",
          releasedAt: new Date(),
        },
      });
    }
    const released = await tx.payrollRun.update({
      where: { id: run.id },
      data: {
        status: "released",
        releasedAt: new Date(),
      },
      include: payrollRunInclude,
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "publish",
      entityType: "payslip",
      entityId: run.id,
      before: { status: run.status, payslipCount: run.payslips.length },
      after: { status: "released", payslipCount: itemsByEmployee.size },
      metadata: {
        step: "payslip_release",
        payrollRunId: run.id,
        payslipCount: itemsByEmployee.size,
        payrollValuesRedacted: true,
      },
    });
    return released;
  });

  return mapPayrollRun(updated, await auditCount(session));
}

export async function getDbEmployeePayslip(session: SessionLike, employeeId: string) {
  const payslip = await getDb().payslip.findFirst({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      employeeId,
      status: "released",
    },
    orderBy: { releasedAt: "desc" },
    include: {
      employee: true,
      payrollRun: true,
    },
  });
  if (!payslip) return null;

  const items = await getDb().payrollItem.findMany({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      payrollRunId: payslip.payrollRunId,
      employeeId,
    },
    include: { employee: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    id: payslip.id,
    employeeId: payslip.employeeId,
    employeeName: payslip.employee.displayName,
    periodLabel: `${payslip.payrollRun.periodStart.getFullYear()}-${String(payslip.payrollRun.periodStart.getMonth() + 1).padStart(2, "0")}`,
    grossPay: decimalToNumber(payslip.grossPay) ?? 0,
    deductions: decimalToNumber(payslip.deductions) ?? 0,
    netPay: decimalToNumber(payslip.netPay) ?? 0,
    status: "released" as const,
    releasedAt: payslip.releasedAt,
    items: items.map((item) => ({
      employeeId: item.employeeId,
      employeeName: item.employee.displayName,
      kind: item.kind,
      code: item.code,
      name: item.name,
      amount: decimalToNumber(item.amount) ?? 0,
      quantity: decimalToNumber(item.quantity) ?? undefined,
      ruleVersionId: item.ruleVersionId,
      metadata: item.metadataJson && typeof item.metadataJson === "object" && !Array.isArray(item.metadataJson)
        ? item.metadataJson as Record<string, unknown>
        : {},
    })),
  } satisfies PayslipView;
}

async function getLatestDbPayrollRun(session: SessionLike) {
  const run = await getDb().payrollRun.findFirst({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
    orderBy: { periodStart: "desc" },
    include: payrollRunInclude,
  });
  return run ? mapPayrollRun(run, await auditCount(session)) : null;
}

async function getLatestDbPayrollRunRecord(session: SessionLike) {
  return getDb().payrollRun.findFirst({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
    orderBy: { periodStart: "desc" },
  });
}

async function getPayrollBlockers(session: SessionLike) {
  const [exceptionCount, pendingApprovalCount] = await Promise.all([
    getDb().attendanceException.count({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        status: "pending",
      },
    }),
    getDb().approvalTask.count({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        status: "pending",
      },
    }),
  ]);
  return {
    exceptionCount,
    pendingApprovalCount,
    attendanceComplete: exceptionCount === 0,
  };
}

async function getActiveSalaryProfiles(session: SessionLike): Promise<SalaryProfileView[]> {
  const employees = await getDb().employee.findMany({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      employmentStatus: "active",
    },
    include: {
      salaryProfiles: {
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
    },
    orderBy: { employeeNo: "asc" },
  });
  return employees.flatMap((employee) => {
    const profile = employee.salaryProfiles[0];
    if (!profile) return [];
    return {
      employeeId: employee.id,
      employeeName: employee.displayName,
      baseSalary: decimalToNumber(profile.baseSalary) ?? 0,
      hourlyWage: decimalToNumber(profile.hourlyWage),
      recurringAllowances: readMoneyItems(profile.recurringAllowances),
      recurringDeductions: readMoneyItems(profile.recurringDeductions),
      effectiveFrom: profile.effectiveFrom,
    };
  });
}

async function getActiveComplianceProfiles(session: SessionLike) {
  const profiles = await getDb().payrollComplianceProfile.findMany({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      effectiveTo: null,
    },
  });
  return new Map(
    profiles.map((profile) => [
      profile.employeeId,
      {
        employeeId: profile.employeeId,
        taxResidency: profile.taxResidency === "non_resident" ? "non_resident" as const : "resident" as const,
        dependentCount: profile.dependentCount,
        laborInsuranceMonthlyWage: decimalToNumber(profile.laborInsuranceMonthlyWage),
        healthInsuranceMonthlyWage: decimalToNumber(profile.healthInsuranceMonthlyWage),
        laborPensionMonthlyWage: decimalToNumber(profile.laborPensionMonthlyWage),
        incomeTaxWithholdingMethod:
          profile.incomeTaxWithholdingMethod === "non_resident_flat"
            ? "non_resident_flat" as const
            : "annualized_progressive" as const,
        nonResidentWithholdingRate: decimalToNumber(profile.nonResidentWithholdingRate),
        effectiveFrom: profile.effectiveFrom,
      } satisfies PayrollComplianceProfileView,
    ]),
  );
}

function mapPayrollRun(run: PayrollRunRecord, auditCountValue: number): PayrollRunView {
  const items = run.items.map((item) => ({
    employeeId: item.employeeId,
    employeeName: item.employee.displayName,
    kind: item.kind,
    code: item.code,
    name: item.name,
    amount: decimalToNumber(item.amount) ?? 0,
    quantity: decimalToNumber(item.quantity) ?? undefined,
    ruleVersionId: item.ruleVersionId,
    metadata: item.metadataJson && typeof item.metadataJson === "object" && !Array.isArray(item.metadataJson)
      ? item.metadataJson as Record<string, unknown>
      : {},
  }));
  return {
    id: run.id,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    payDate: run.payDate,
    status: run.status,
    attendanceComplete: run.attendanceComplete,
    pendingApprovalCount: run.pendingApprovalCount,
    exceptionCount: run.exceptionCount,
    ruleVersionId: run.ruleVersionId,
    grossTotal: decimalToNumber(run.grossTotal) ?? 0,
    deductionTotal: decimalToNumber(run.deductionTotal) ?? 0,
    netTotal: decimalToNumber(run.netTotal) ?? 0,
    employerContributionTotal: items
      .filter((item) => item.kind === "employer_contribution")
      .reduce((total, item) => total + item.amount, 0),
    items,
    payslips: run.payslips.map((payslip) => ({
      id: payslip.id,
      employeeId: payslip.employeeId,
      employeeName: payslip.employee.displayName,
      periodLabel: `${run.periodStart.getFullYear()}-${String(run.periodStart.getMonth() + 1).padStart(2, "0")}`,
      grossPay: decimalToNumber(payslip.grossPay) ?? 0,
      deductions: decimalToNumber(payslip.deductions) ?? 0,
      netPay: decimalToNumber(payslip.netPay) ?? 0,
      status: payslip.status === "released" ? "released" : "draft",
      releasedAt: payslip.releasedAt,
      items: items.filter((item) => item.employeeId === payslip.employeeId),
    })),
    auditCount: auditCountValue,
  };
}

async function auditCount(session: SessionLike) {
  return getDb().auditLog.count({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
  });
}

function readMoneyItems(value: Prisma.JsonValue): MoneyItem[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        return {
          code: String(record.code ?? "item"),
          name: String(record.name ?? "Item"),
          amount: Number(record.amount ?? 0),
        };
      })
    : [];
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

function sumBy(
  results: Array<{
    grossPay: number;
    deductionTotal: number;
    netPay: number;
  }>,
  key: "grossPay" | "deductionTotal" | "netPay",
) {
  return results.reduce((total, result) => total + result[key], 0);
}

function groupItemsByEmployee(items: PayrollRunView["items"]) {
  const groups = new Map<string, PayrollRunView["items"]>();
  for (const item of items) {
    groups.set(item.employeeId, [...(groups.get(item.employeeId) ?? []), item]);
  }
  return groups;
}

const payrollRunInclude = {
  items: {
    include: {
      employee: true,
    },
    orderBy: [
      { employeeId: "asc" as const },
      { createdAt: "asc" as const },
    ],
  },
  payslips: {
    include: {
      employee: true,
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
};

type PayrollRunRecord = Prisma.PayrollRunGetPayload<{
  include: typeof payrollRunInclude;
}>;
