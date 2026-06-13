import { assertPermission, hasPermission } from "@/server/auth/rbac";
import type { RoleKey } from "@/server/auth/rbac";
import {
  confirmDbPayrollRun,
  createDbPayrollRun,
  getDbEmployeePayslip,
  getDbPayrollDashboard,
  lockDbPayrollRun,
  recalculateDbPayrollRun,
  releaseDbPayslips,
  resolveDbPayrollBlockers,
} from "./db-store";
import {
  calculateDemoPayrollRun,
  confirmDemoPayrollRun,
  createDemoPayrollRun,
  getDemoEmployeePayslip,
  getDemoPayrollChecklist,
  getDemoPayrollRun,
  lockDemoPayrollRun,
  releaseDemoPayslips,
  resolveDemoPayrollBlockers,
} from "./demo-store";
import type { PayrollCloseChecklist, PayrollRunView, PayslipView } from "./types";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee: { id: string; displayName: string } | null;
};

type DbPayrollSession = SessionLike & {
  tenantId: string;
  companyId: string;
};

export function canViewPayrollRun(role: RoleKey) {
  return hasPermission(role, "payroll:manage");
}

export function canViewPayslip(session: SessionLike, employeeId: string) {
  return (
    hasPermission(session.role, "payroll:manage") ||
    (hasPermission(session.role, "payslip:self") && session.employee?.id === employeeId)
  );
}

export async function getPayrollDashboard(session: SessionLike): Promise<{
  run: PayrollRunView | null;
  checklist: PayrollCloseChecklist;
}> {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      return await getDbPayrollDashboard(session);
    } catch {
      return {
        run: getDemoPayrollRun(),
        checklist: getDemoPayrollChecklist(),
      };
    }
  }
  return {
    run: getDemoPayrollRun(),
    checklist: getDemoPayrollChecklist(),
  };
}

export async function createPayrollRun(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      return await createDbPayrollRun(session);
    } catch {
      return createDemoPayrollRun();
    }
  }
  return createDemoPayrollRun();
}

export async function resolvePayrollBlockers(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      await resolveDbPayrollBlockers(session);
      return;
    } catch {
      resolveDemoPayrollBlockers();
      return;
    }
  }
  resolveDemoPayrollBlockers();
}

export async function recalculatePayrollRun(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      return await recalculateDbPayrollRun(session);
    } catch {
      return calculateDemoPayrollRun();
    }
  }
  return calculateDemoPayrollRun();
}

export async function confirmPayrollRun(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      return await confirmDbPayrollRun(session);
    } catch {
      confirmDemoPayrollRun();
      return;
    }
  }
  confirmDemoPayrollRun();
}

export async function lockPayrollRun(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      return await lockDbPayrollRun(session);
    } catch {
      lockDemoPayrollRun();
      return;
    }
  }
  lockDemoPayrollRun();
}

export async function releasePayrollPayslips(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      return await releaseDbPayslips(session);
    } catch {
      releaseDemoPayslips();
      return;
    }
  }
  releaseDemoPayslips();
}

export async function getOwnPayslip(session: SessionLike): Promise<PayslipView | null> {
  if (!session.employee) return null;
  if (!canViewPayslip(session, session.employee.id)) {
    throw new Error("Unauthorized payslip access.");
  }
  if (canUseDatabase(session)) {
    try {
      return await getDbEmployeePayslip(session, session.employee.id);
    } catch {
      return getDemoEmployeePayslip(session.employee.id);
    }
  }
  return getDemoEmployeePayslip(session.employee.id);
}

function canUseDatabase(session: SessionLike): session is DbPayrollSession {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
