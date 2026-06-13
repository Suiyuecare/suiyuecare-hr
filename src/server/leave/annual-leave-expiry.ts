import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { sendNotificationInTransaction } from "@/server/notifications/service";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type AnnualLeaveExpiryRisk = {
  employeeId: string;
  employeeName: string;
  remainingUnits: number;
  carryoverRemainingUnits: number;
  expiryDate: Date;
  daysUntilExpiry: number;
  severity: "normal" | "warning" | "overdue";
};

export type AnnualLeaveExpiryWorkspace = {
  asOfDate: Date;
  warningDays: number;
  risks: AnnualLeaveExpiryRisk[];
  auditCount: number;
};

type DemoExpiryState = {
  auditCount: number;
};

const globalForAnnualLeaveExpiry = globalThis as unknown as {
  hrOneAnnualLeaveExpiryDemoState?: DemoExpiryState;
};

const demoRisks = [
  {
    employeeId: "demo-employee-1",
    employeeName: "張小安",
    remainingUnits: 12,
    carryoverRemainingUnits: 2.5,
  },
  {
    employeeId: "demo-employee-2",
    employeeName: "李小真",
    remainingUnits: 7,
    carryoverRemainingUnits: 1,
  },
];

export async function getAnnualLeaveExpiryWorkspace(
  session: SessionLike,
  input?: { asOfDate?: Date; warningDays?: number },
): Promise<AnnualLeaveExpiryWorkspace> {
  assertPermission(session.role, "employee:read");
  const asOfDate = input?.asOfDate ?? new Date();
  const warningDays = input?.warningDays ?? 60;
  if (canUseDatabase(session)) {
    try {
      const [risks, auditCount] = await Promise.all([
        scanDbAnnualLeaveExpiryRisks(session, asOfDate, warningDays),
        getDb().auditLog.count({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            entityType: "annual_leave_expiry_reminder_batch",
          },
        }),
      ]);
      return { asOfDate, warningDays, risks, auditCount };
    } catch {
      return getDemoAnnualLeaveExpiryWorkspace(asOfDate, warningDays);
    }
  }
  return getDemoAnnualLeaveExpiryWorkspace(asOfDate, warningDays);
}

export async function sendAnnualLeaveExpiryReminders(
  session: SessionLike,
  input?: { asOfDate?: Date; warningDays?: number },
) {
  assertPermission(session.role, "employee:write");
  const asOfDate = input?.asOfDate ?? new Date();
  const warningDays = input?.warningDays ?? 60;
  if (canUseDatabase(session)) {
    try {
      return sendDbAnnualLeaveExpiryReminders(session, asOfDate, warningDays);
    } catch {
      return sendDemoAnnualLeaveExpiryReminders(session, asOfDate, warningDays);
    }
  }
  return sendDemoAnnualLeaveExpiryReminders(session, asOfDate, warningDays);
}

export function resetAnnualLeaveExpiryDemoState() {
  globalForAnnualLeaveExpiry.hrOneAnnualLeaveExpiryDemoState = { auditCount: 0 };
}

async function scanDbAnnualLeaveExpiryRisks(
  session: SessionLike,
  asOfDate: Date,
  warningDays: number,
) {
  const balances = await getDb().leaveBalance.findMany({
    where: {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      remainingUnits: { gt: 0 },
      leavePolicy: {
        code: "annual",
        status: "active",
      },
    },
    include: {
      employee: true,
    },
    orderBy: { employeeId: "asc" },
  });
  return balances
    .map((balance) => {
      const remainingUnits = decimalToNumber(balance.remainingUnits) ?? 0;
      const carryoverRemainingUnits = Math.max(
        0,
        roundUnits((decimalToNumber(balance.carryoverUnits) ?? 0) - (decimalToNumber(balance.carryoverUsedUnits) ?? 0)),
      );
      return buildRisk({
        employeeId: balance.employeeId,
        employeeName: balance.employee.displayName,
        remainingUnits,
        carryoverRemainingUnits,
        asOfDate,
        warningDays,
      });
    })
    .filter((risk) => risk.severity !== "normal" || risk.carryoverRemainingUnits > 0);
}

async function sendDbAnnualLeaveExpiryReminders(
  session: SessionLike,
  asOfDate: Date,
  warningDays: number,
) {
  const db = getDb();
  const risks = await scanDbAnnualLeaveExpiryRisks(session, asOfDate, warningDays);
  const actionableRisks = risks.filter((risk) => risk.severity !== "normal");
  await db.$transaction(async (tx) => {
    const employees = await tx.employee.findMany({
      where: {
        id: { in: actionableRisks.map((risk) => risk.employeeId) },
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      select: { id: true, userId: true },
    });
    const userIdByEmployee = new Map(employees.map((employee) => [employee.id, employee.userId]));
    for (const risk of actionableRisks) {
      const userId = userIdByEmployee.get(risk.employeeId);
      if (!userId) continue;
      await sendNotificationInTransaction(tx, {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        recipientUserId: userId,
        title: "Annual leave expiry reminder",
        body: `${risk.remainingUnits} annual leave day(s) remain before ${formatDate(risk.expiryDate)}.`,
        linkUrl: "/app",
        eventType: "system_alert",
      });
    }
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "annual_leave_expiry_reminder_batch",
      entityId: formatDate(asOfDate),
      before: null,
      after: {
        asOfDate,
        warningDays,
        riskCount: risks.length,
        reminderCount: actionableRisks.length,
      },
      metadata: {
        asOfDate: formatDate(asOfDate),
        warningDays,
        riskCount: risks.length,
        reminderCount: actionableRisks.length,
        sourceIds: ["tw-lsa-article-38", "tw-lsa-enforcement-article-24-1"],
      },
    });
  });
  return actionableRisks;
}

function getDemoAnnualLeaveExpiryWorkspace(asOfDate: Date, warningDays: number): AnnualLeaveExpiryWorkspace {
  return {
    asOfDate,
    warningDays,
    risks: demoRisks.map((risk) => buildRisk({ ...risk, asOfDate, warningDays })),
    auditCount: getDemoState().auditCount,
  };
}

function sendDemoAnnualLeaveExpiryReminders(
  session: SessionLike,
  asOfDate: Date,
  warningDays: number,
) {
  const risks = getDemoAnnualLeaveExpiryWorkspace(asOfDate, warningDays).risks;
  const actionableRisks = risks.filter((risk) => risk.severity !== "normal");
  const state = getDemoState();
  state.auditCount += 1;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "annual_leave_expiry_reminder_batch",
    entityId: formatDate(asOfDate),
    before: null,
    after: {
      asOfDate,
      warningDays,
      riskCount: risks.length,
      reminderCount: actionableRisks.length,
    },
    metadata: {
      asOfDate: formatDate(asOfDate),
      warningDays,
      riskCount: risks.length,
      reminderCount: actionableRisks.length,
      sourceIds: ["tw-lsa-article-38", "tw-lsa-enforcement-article-24-1"],
    },
  });
  return actionableRisks;
}

function buildRisk(input: {
  employeeId: string;
  employeeName: string;
  remainingUnits: number;
  carryoverRemainingUnits: number;
  asOfDate: Date;
  warningDays: number;
}): AnnualLeaveExpiryRisk {
  const expiryDate = new Date(input.asOfDate.getFullYear(), 11, 31);
  const daysUntilExpiry = Math.ceil((startOfDate(expiryDate).getTime() - startOfDate(input.asOfDate).getTime()) / 86_400_000);
  const severity = daysUntilExpiry < 0
    ? "overdue"
    : daysUntilExpiry <= input.warningDays
      ? "warning"
      : "normal";
  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    remainingUnits: input.remainingUnits,
    carryoverRemainingUnits: input.carryoverRemainingUnits,
    expiryDate,
    daysUntilExpiry,
    severity,
  };
}

function getDemoState() {
  if (!globalForAnnualLeaveExpiry.hrOneAnnualLeaveExpiryDemoState) {
    resetAnnualLeaveExpiryDemoState();
  }
  return globalForAnnualLeaveExpiry.hrOneAnnualLeaveExpiryDemoState!;
}

function startOfDate(date: Date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
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

function roundUnits(value: number) {
  return Math.round(value * 100) / 100;
}

function canUseDatabase(session: { tenantId: string | null; companyId: string | null }) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
