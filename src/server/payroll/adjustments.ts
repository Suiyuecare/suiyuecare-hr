import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type PayrollAdjustmentInput = {
  payrollRunId?: string | null;
  employeeId: string;
  kind: "allowance" | "deduction";
  amount: number;
  reason: string;
};

export type PayrollAdjustmentView = {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  kind: "allowance" | "deduction";
  amount: number;
  reason: string;
  status: "pending" | "applied" | "rejected";
  appliedAt: Date | null;
  decidedAt: Date | null;
  decisionComment: string | null;
};

export type PayrollAdjustmentWorkspace = {
  payrollRun: {
    id: string;
    status: string;
    periodLabel: string;
  } | null;
  employees: Array<{
    id: string;
    employeeNo: string;
    displayName: string;
  }>;
  adjustments: PayrollAdjustmentView[];
};

type AdjustmentDemoState = {
  adjustments: PayrollAdjustmentView[];
};

const globalForAdjustments = globalThis as unknown as {
  hrOnePayrollAdjustmentDemoState?: AdjustmentDemoState;
};

export async function listPayrollAdjustments(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      const rows = await getDb().payrollAdjustment.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        include: { employee: true },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((row) => ({
        id: row.id,
        payrollRunId: row.payrollRunId,
        employeeId: row.employeeId,
        employeeName: row.employee.displayName,
        kind: row.kind === "deduction" ? "deduction" as const : "allowance" as const,
        amount: decimalToNumber(row.amount) ?? 0,
        reason: row.reason,
        status: normalizeAdjustmentStatus(row.status),
        appliedAt: row.appliedAt,
        decidedAt: row.decidedAt,
        decisionComment: row.decisionComment,
      }));
    } catch {
      return getAdjustmentDemoState().adjustments;
    }
  }
  return getAdjustmentDemoState().adjustments;
}

export async function getPayrollAdjustmentWorkspace(session: SessionLike): Promise<PayrollAdjustmentWorkspace> {
  assertPermission(session.role, "payroll:manage");
  const adjustments = await listPayrollAdjustments(session);
  if (canUseDatabase(session)) {
    try {
      const [run, employees] = await Promise.all([
        getDb().payrollRun.findFirst({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
          orderBy: { periodStart: "desc" },
        }),
        getDb().employee.findMany({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            employmentStatus: "active",
          },
          orderBy: { employeeNo: "asc" },
        }),
      ]);
      return {
        payrollRun: run
          ? {
              id: run.id,
              status: run.status,
              periodLabel: `${run.periodStart.getFullYear()}-${String(run.periodStart.getMonth() + 1).padStart(2, "0")}`,
            }
          : null,
        employees: employees.map((employee) => ({
          id: employee.id,
          employeeNo: employee.employeeNo,
          displayName: employee.displayName,
        })),
        adjustments,
      };
    } catch {
      return getDemoAdjustmentWorkspace(adjustments);
    }
  }
  return getDemoAdjustmentWorkspace(adjustments);
}

export async function applyPayrollAdjustment(session: SessionLike, input: PayrollAdjustmentInput) {
  return requestPayrollAdjustment(session, input);
}

export async function requestPayrollAdjustment(session: SessionLike, input: PayrollAdjustmentInput) {
  assertPermission(session.role, "payroll:manage");
  const normalized = normalizeAdjustmentInput(input);
  if (canUseDatabase(session)) {
    try {
      return requestDbPayrollAdjustment(session, normalized);
    } catch {
      return requestDemoPayrollAdjustment(session, normalized);
    }
  }
  return requestDemoPayrollAdjustment(session, normalized);
}

export async function decidePayrollAdjustment(
  session: SessionLike,
  input: { adjustmentId: string; decision: "approve" | "reject"; comment?: string },
) {
  assertPermission(session.role, "payroll_adjustment:approve");
  const adjustmentId = input.adjustmentId.trim();
  if (!adjustmentId) throw new Error("Adjustment is required.");
  const comment = input.comment?.trim() || null;
  if (canUseDatabase(session)) {
    try {
      return decideDbPayrollAdjustment(session, {
        adjustmentId,
        decision: input.decision,
        comment,
      });
    } catch {
      return decideDemoPayrollAdjustment(session, {
        adjustmentId,
        decision: input.decision,
        comment,
      });
    }
  }
  return decideDemoPayrollAdjustment(session, {
    adjustmentId,
    decision: input.decision,
    comment,
  });
}

export function resetPayrollAdjustmentDemoState() {
  globalForAdjustments.hrOnePayrollAdjustmentDemoState = { adjustments: [] };
}

async function requestDbPayrollAdjustment(
  session: SessionLike,
  input: ReturnType<typeof normalizeAdjustmentInput>,
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
  if (!run) throw new Error("Payroll run not found.");
  if (run.status !== "locked" && run.status !== "released") {
    throw new Error("Adjustments are only allowed after payroll is locked.");
  }
  const employee = await db.employee.findFirst({
    where: {
      id: input.employeeId,
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
  });
  if (!employee) throw new Error("Employee not found for payroll adjustment.");

  return db.$transaction(async (tx) => {
    const descriptor = getAdjustmentDescriptor(input.kind);
    const adjustment = await tx.payrollAdjustment.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        payrollRunId: run.id,
        employeeId: employee.id,
        kind: input.kind,
        code: descriptor.code,
        name: descriptor.name,
        amount: input.amount,
        reason: input.reason,
        status: "pending",
        createdByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "payroll_adjustment",
      entityId: adjustment.id,
      after: {
        payrollRunId: run.id,
        employeeId: employee.id,
        kind: input.kind,
        status: "pending",
      },
      metadata: {
        explicitAdjustmentFlow: true,
        approvalRequired: true,
        payrollRunId: run.id,
        employeeId: employee.id,
        payrollValuesRedacted: true,
      },
    });
    return {
      id: adjustment.id,
      payrollRunId: run.id,
      employeeId: employee.id,
      employeeName: employee.displayName,
      kind: input.kind,
      amount: input.amount,
      reason: input.reason,
      status: "pending" as const,
      appliedAt: null,
      decidedAt: null,
      decisionComment: null,
    };
  });
}

async function decideDbPayrollAdjustment(
  session: SessionLike,
  input: { adjustmentId: string; decision: "approve" | "reject"; comment: string | null },
) {
  const db = getDb();
  const existing = await db.payrollAdjustment.findFirst({
    where: {
      id: input.adjustmentId,
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
    include: {
      employee: true,
      payrollRun: true,
    },
  });
  if (!existing) throw new Error("Payroll adjustment not found.");
  if (existing.status !== "pending") {
    throw new Error("Only pending payroll adjustments can be decided.");
  }
  if (existing.payrollRun.status !== "locked" && existing.payrollRun.status !== "released") {
    throw new Error("Payroll adjustment target run is no longer locked.");
  }

  return db.$transaction(async (tx) => {
    const decidedAt = new Date();
    if (input.decision === "reject") {
      const rejected = await tx.payrollAdjustment.update({
        where: { id: existing.id },
        data: {
          status: "rejected",
          decidedByUserId: session.user?.id,
          decidedAt,
          decisionComment: input.comment,
        },
      });
      await writeAuditLog(tx, {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        actorUserId: session.user?.id,
        actorEmployeeId: session.employee?.id,
        action: "reject",
        entityType: "payroll_adjustment",
        entityId: rejected.id,
        after: {
          payrollRunId: rejected.payrollRunId,
          employeeId: rejected.employeeId,
          status: "rejected",
        },
        metadata: {
          explicitAdjustmentFlow: true,
          payrollValuesRedacted: true,
        },
      });
      return mapAdjustmentView(rejected, existing.employee.displayName);
    }

    const amount = decimalToNumber(existing.amount) ?? 0;
    const kind = existing.kind === "deduction" ? "deduction" as const : "allowance" as const;
    const item = await tx.payrollItem.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        payrollRunId: existing.payrollRunId,
        employeeId: existing.employeeId,
        kind,
        code: existing.code,
        name: existing.name,
        amount,
        metadataJson: {
          adjustmentId: existing.id,
          explicitAdjustmentFlow: true,
          approvedByUserId: session.user?.id,
        },
      },
    });
    const deltaGross = kind === "allowance" ? amount : 0;
    const deltaDeduction = kind === "deduction" ? amount : 0;
    await tx.payrollRun.update({
      where: { id: existing.payrollRunId },
      data: {
        grossTotal: { increment: deltaGross },
        deductionTotal: { increment: deltaDeduction },
        netTotal: { increment: deltaGross - deltaDeduction },
      },
    });
    const payslip = await tx.payslip.findUnique({
      where: {
        payrollRunId_employeeId: {
          payrollRunId: existing.payrollRunId,
          employeeId: existing.employeeId,
        },
      },
    });
    if (payslip) {
      await tx.payslip.update({
        where: { id: payslip.id },
        data: {
          grossPay: { increment: deltaGross },
          deductions: { increment: deltaDeduction },
          netPay: { increment: deltaGross - deltaDeduction },
        },
      });
    }
    const approved = await tx.payrollAdjustment.update({
      where: { id: existing.id },
      data: {
        status: "applied",
        appliedItemId: item.id,
        appliedAt: decidedAt,
        decidedByUserId: session.user?.id,
        decidedAt,
        decisionComment: input.comment,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "approve",
      entityType: "payroll_adjustment",
      entityId: approved.id,
      after: {
        payrollRunId: approved.payrollRunId,
        employeeId: approved.employeeId,
        status: "applied",
      },
      metadata: {
        explicitAdjustmentFlow: true,
        appliedItemId: item.id,
        payrollValuesRedacted: true,
      },
    });
    return mapAdjustmentView(approved, existing.employee.displayName);
  });
}

function requestDemoPayrollAdjustment(
  session: SessionLike,
  input: ReturnType<typeof normalizeAdjustmentInput>,
) {
  const descriptor = getAdjustmentDescriptor(input.kind);
  const employee = getFallbackCompanyOverview().company.employees.find((item) => item.id === input.employeeId);
  const adjustment = {
    id: crypto.randomUUID(),
    payrollRunId: input.payrollRunId ?? "demo-payroll-run",
    employeeId: input.employeeId,
    employeeName: employee?.displayName ?? input.employeeId,
    kind: input.kind,
    code: descriptor.code,
    name: descriptor.name,
    amount: input.amount,
    reason: input.reason,
    status: "pending" as const,
    appliedAt: null,
    decidedAt: null,
    decisionComment: null,
  };
  getAdjustmentDemoState().adjustments.unshift(adjustment);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "payroll_adjustment",
    entityId: adjustment.id,
    after: adjustment,
    metadata: {
      explicitAdjustmentFlow: true,
      approvalRequired: true,
      payrollValuesRedacted: true,
    },
  });
  return adjustment;
}

function decideDemoPayrollAdjustment(
  session: SessionLike,
  input: { adjustmentId: string; decision: "approve" | "reject"; comment: string | null },
) {
  const state = getAdjustmentDemoState();
  const adjustment = state.adjustments.find((item) => item.id === input.adjustmentId);
  if (!adjustment) throw new Error("Payroll adjustment not found.");
  if (adjustment.status !== "pending") {
    throw new Error("Only pending payroll adjustments can be decided.");
  }
  adjustment.status = input.decision === "approve" ? "applied" : "rejected";
  adjustment.appliedAt = input.decision === "approve" ? new Date() : null;
  adjustment.decidedAt = new Date();
  adjustment.decisionComment = input.comment;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: input.decision === "approve" ? "approve" : "reject",
    entityType: "payroll_adjustment",
    entityId: adjustment.id,
    after: {
      id: adjustment.id,
      payrollRunId: adjustment.payrollRunId,
      employeeId: adjustment.employeeId,
      status: adjustment.status,
    },
    metadata: {
      explicitAdjustmentFlow: true,
      payrollValuesRedacted: true,
    },
  });
  return adjustment;
}

function normalizeAdjustmentInput(input: PayrollAdjustmentInput) {
  const amount = Number(input.amount);
  if (!input.employeeId) throw new Error("Employee is required.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Adjustment amount must be greater than zero.");
  }
  const reason = input.reason.trim();
  if (reason.length < 4) throw new Error("Adjustment reason is required.");
  return {
    payrollRunId: input.payrollRunId || null,
    employeeId: input.employeeId,
    kind: input.kind === "deduction" ? "deduction" as const : "allowance" as const,
    amount: Math.round(amount),
    reason,
  };
}

function getAdjustmentDemoState() {
  if (!globalForAdjustments.hrOnePayrollAdjustmentDemoState) {
    resetPayrollAdjustmentDemoState();
  }
  return globalForAdjustments.hrOnePayrollAdjustmentDemoState!;
}

function getDemoAdjustmentWorkspace(adjustments: PayrollAdjustmentView[]): PayrollAdjustmentWorkspace {
  const overview = getFallbackCompanyOverview();
  return {
    payrollRun: {
      id: "demo-payroll-run",
      status: "released",
      periodLabel: currentPeriodLabel(),
    },
    employees: overview.company.employees.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
    })),
    adjustments,
  };
}

function currentPeriodLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

function getAdjustmentDescriptor(kind: "allowance" | "deduction") {
  return kind === "deduction"
    ? {
        code: "manual_adjustment_deduction",
        name: "Payroll adjustment deduction",
      }
    : {
        code: "manual_adjustment_allowance",
        name: "Payroll adjustment allowance",
      };
}

function normalizeAdjustmentStatus(value: string): PayrollAdjustmentView["status"] {
  if (value === "pending" || value === "rejected") return value;
  return "applied";
}

function mapAdjustmentView(
  adjustment: {
    id: string;
    payrollRunId: string;
    employeeId: string;
    kind: string;
    amount: unknown;
    reason: string;
    status: string;
    appliedAt: Date | null;
    decidedAt: Date | null;
    decisionComment: string | null;
  },
  employeeName: string,
): PayrollAdjustmentView {
  return {
    id: adjustment.id,
    payrollRunId: adjustment.payrollRunId,
    employeeId: adjustment.employeeId,
    employeeName,
    kind: adjustment.kind === "deduction" ? "deduction" : "allowance",
    amount: decimalToNumber(adjustment.amount) ?? 0,
    reason: adjustment.reason,
    status: normalizeAdjustmentStatus(adjustment.status),
    appliedAt: adjustment.appliedAt,
    decidedAt: adjustment.decidedAt,
    decisionComment: adjustment.decisionComment,
  };
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
