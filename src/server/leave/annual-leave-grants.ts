import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { sendNotificationInTransaction } from "@/server/notifications/service";
import {
  calculateAnnualLeaveEntitlement,
  defaultTaiwanLaborStandardsConfig,
  type TaiwanLaborStandardsConfig,
} from "@/server/rules/taiwan-labor-standards";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type AnnualLeaveGrantRow = {
  employeeId: string;
  employeeName: string;
  hireDate: Date;
  serviceMonths: number;
  entitlementUnits: number;
  carryoverUnits: number;
  totalAvailableUnits: number;
  sourceIds: string[];
};

export type AnnualLeaveGrantWorkspace = {
  asOfDate: Date;
  lastRunAt: Date | null;
  rows: AnnualLeaveGrantRow[];
  auditCount: number;
};

type DemoGrantState = {
  lastRunAt: Date | null;
  auditCount: number;
};

const globalForAnnualLeaveGrants = globalThis as unknown as {
  hrOneAnnualLeaveGrantDemoState?: DemoGrantState;
};

const demoEmployees = [
  { id: "demo-hr-employee", name: "林人資", hireDate: new Date("2022-08-15T00:00:00.000Z"), remainingUnits: 10 },
  { id: "demo-manager-employee", name: "陳主管", hireDate: new Date("2023-03-01T00:00:00.000Z"), remainingUnits: 8 },
  { id: "demo-employee-1", name: "張小安", hireDate: new Date("2024-01-10T00:00:00.000Z"), remainingUnits: 12 },
  { id: "demo-employee-2", name: "李小真", hireDate: new Date("2024-02-01T00:00:00.000Z"), remainingUnits: 7 },
  { id: "demo-employee-3", name: "黃小宇", hireDate: new Date("2024-05-20T00:00:00.000Z"), remainingUnits: 6 },
];

export async function getAnnualLeaveGrantWorkspace(
  session: SessionLike,
  asOfDate = new Date(),
): Promise<AnnualLeaveGrantWorkspace> {
  assertPermission(session.role, "employee:read");
  if (canUseDatabase(session)) {
    try {
      return await getDbAnnualLeaveGrantWorkspace(session, asOfDate);
    } catch {
      return getDemoAnnualLeaveGrantWorkspace(asOfDate);
    }
  }
  return getDemoAnnualLeaveGrantWorkspace(asOfDate);
}

export async function runAnnualLeaveGrantBatch(session: SessionLike, asOfDate = new Date()) {
  assertPermission(session.role, "employee:write");
  if (canUseDatabase(session)) {
    try {
      return await runDbAnnualLeaveGrantBatch(session, asOfDate);
    } catch {
      return runDemoAnnualLeaveGrantBatch(session, asOfDate);
    }
  }
  return runDemoAnnualLeaveGrantBatch(session, asOfDate);
}

export function resetAnnualLeaveGrantDemoState() {
  globalForAnnualLeaveGrants.hrOneAnnualLeaveGrantDemoState = {
    lastRunAt: null,
    auditCount: 0,
  };
}

async function getDbAnnualLeaveGrantWorkspace(session: SessionLike, asOfDate: Date) {
  const [employees, policy, laborConfig, auditCount] = await Promise.all([
    getDb().employee.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employmentStatus: "active",
      },
      include: {
        leaveBalances: {
          include: { leavePolicy: true },
        },
      },
      orderBy: { employeeNo: "asc" },
    }),
    getDb().leavePolicy.findFirst({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        code: "annual",
        status: "active",
      },
    }),
    getTaiwanLaborStandardsConfig(session),
    getDb().auditLog.count({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        entityType: "annual_leave_grant_batch",
      },
    }),
  ]);
  const rows = employees.map((employee) =>
    buildGrantRow({
      employeeId: employee.id,
      employeeName: employee.displayName,
      hireDate: employee.hireDate,
      remainingUnits: decimalToNumber(
        employee.leaveBalances.find((balance) => balance.leavePolicy.code === "annual")?.remainingUnits,
      ) ?? 0,
      carryoverLimitUnits: decimalToNullableNumber(policy?.carryoverLimitUnits),
      asOfDate,
      config: laborConfig,
    }),
  );
  return {
    asOfDate,
    lastRunAt: null,
    rows,
    auditCount,
  };
}

async function runDbAnnualLeaveGrantBatch(session: SessionLike, asOfDate: Date) {
  const db = getDb();
  const [policy, laborConfig] = await Promise.all([
    db.leavePolicy.findFirst({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        code: "annual",
        status: "active",
      },
    }),
    getTaiwanLaborStandardsConfig(session),
  ]);
  if (!policy) throw new Error("Active annual leave policy is required before grant batch.");

  const rows = await db.$transaction(async (tx) => {
    const employees = await tx.employee.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employmentStatus: "active",
      },
      include: {
        user: true,
        leaveBalances: {
          where: { leavePolicyId: policy.id },
        },
      },
      orderBy: { employeeNo: "asc" },
    });
    const preparedRows = employees.map((employee) =>
      buildGrantRow({
        employeeId: employee.id,
        employeeName: employee.displayName,
        hireDate: employee.hireDate,
        remainingUnits: decimalToNumber(employee.leaveBalances[0]?.remainingUnits) ?? 0,
        carryoverLimitUnits: decimalToNullableNumber(policy.carryoverLimitUnits),
        asOfDate,
        config: laborConfig,
      }),
    );

    for (const employee of employees) {
      const row = preparedRows.find((candidate) => candidate.employeeId === employee.id);
      if (!row) continue;
      const before = employee.leaveBalances[0] ?? null;
      const after = await tx.leaveBalance.upsert({
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
          grantedUnits: row.totalAvailableUnits,
          usedUnits: 0,
          pendingUnits: 0,
          settledUnits: 0,
          carryoverUnits: row.carryoverUnits,
          carryoverUsedUnits: 0,
          currentYearUnits: row.entitlementUnits,
          currentYearUsedUnits: 0,
          remainingUnits: row.totalAvailableUnits,
        },
        update: {
          grantedUnits: row.totalAvailableUnits,
          usedUnits: 0,
          pendingUnits: 0,
          settledUnits: 0,
          carryoverUnits: row.carryoverUnits,
          carryoverUsedUnits: 0,
          currentYearUnits: row.entitlementUnits,
          currentYearUsedUnits: 0,
          remainingUnits: row.totalAvailableUnits,
        },
      });
      await writeAuditLog(tx, {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        actorUserId: session.user?.id,
        actorEmployeeId: session.employee?.id,
        action: before ? "update" : "create",
        entityType: "leave_balance",
        entityId: after.id,
        before,
        after,
        metadata: {
          batchType: "annual_leave_grant",
          asOfDate: asOfDate.toISOString().slice(0, 10),
          sourceIds: row.sourceIds,
        },
      });
      if (employee.userId) {
        await sendNotificationInTransaction(tx, {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          recipientUserId: employee.userId,
          title: "Annual leave balance updated",
          body: `Your annual leave balance was updated. ${row.totalAvailableUnits} day(s) are available.`,
          linkUrl: "/app",
          eventType: "system_alert",
        });
      }
    }
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "annual_leave_grant_batch",
      entityId: asOfDate.toISOString().slice(0, 10),
      before: null,
      after: {
        asOfDate,
        employeeCount: preparedRows.length,
      },
      metadata: {
        employeeCount: preparedRows.length,
        sourceIds: laborConfig.sources.filter((source) => source.id === "tw-lsa-article-38").map((source) => source.id),
      },
    });
    return preparedRows;
  });

  return rows;
}

function getDemoAnnualLeaveGrantWorkspace(asOfDate: Date): AnnualLeaveGrantWorkspace {
  const state = getDemoState();
  return {
    asOfDate,
    lastRunAt: state.lastRunAt,
    rows: demoEmployees.map((employee) =>
      buildGrantRow({
        employeeId: employee.id,
        employeeName: employee.name,
        hireDate: employee.hireDate,
        remainingUnits: employee.remainingUnits,
        carryoverLimitUnits: null,
        asOfDate,
        config: defaultTaiwanLaborStandardsConfig,
      }),
    ),
    auditCount: state.auditCount,
  };
}

function runDemoAnnualLeaveGrantBatch(session: SessionLike, asOfDate: Date) {
  const state = getDemoState();
  const rows = getDemoAnnualLeaveGrantWorkspace(asOfDate).rows;
  state.lastRunAt = new Date();
  state.auditCount += 1;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "annual_leave_grant_batch",
    entityId: asOfDate.toISOString().slice(0, 10),
    before: null,
    after: {
      asOfDate,
      employeeCount: rows.length,
    },
    metadata: {
      employeeCount: rows.length,
      sourceIds: ["tw-lsa-article-38"],
    },
  });
  return rows;
}

function buildGrantRow(input: {
  employeeId: string;
  employeeName: string;
  hireDate: Date;
  remainingUnits: number;
  carryoverLimitUnits: number | null;
  asOfDate: Date;
  config: TaiwanLaborStandardsConfig;
}): AnnualLeaveGrantRow {
  const serviceMonths = serviceMonthsBetween(input.hireDate, input.asOfDate);
  const entitlement = calculateAnnualLeaveEntitlement({ serviceMonths, config: input.config });
  const carryoverUnits = input.carryoverLimitUnits === null
    ? input.remainingUnits
    : Math.min(input.remainingUnits, input.carryoverLimitUnits);
  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    hireDate: input.hireDate,
    serviceMonths,
    entitlementUnits: entitlement.days,
    carryoverUnits: roundUnits(carryoverUnits),
    totalAvailableUnits: roundUnits(carryoverUnits + entitlement.days),
    sourceIds: entitlement.sources.map((source) => source.id),
  };
}

export function serviceMonthsBetween(hireDate: Date, asOfDate: Date) {
  let months = (asOfDate.getFullYear() - hireDate.getFullYear()) * 12 +
    (asOfDate.getMonth() - hireDate.getMonth());
  if (asOfDate.getDate() < hireDate.getDate()) months -= 1;
  return Math.max(0, months);
}

function getDemoState() {
  if (!globalForAnnualLeaveGrants.hrOneAnnualLeaveGrantDemoState) {
    resetAnnualLeaveGrantDemoState();
  }
  return globalForAnnualLeaveGrants.hrOneAnnualLeaveGrantDemoState!;
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

function decimalToNullableNumber(value: unknown) {
  return decimalToNumber(value);
}

function roundUnits(value: number) {
  return Math.round(value * 100) / 100;
}

function canUseDatabase(session: { tenantId: string | null; companyId: string | null }) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
