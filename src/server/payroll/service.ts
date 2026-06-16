import { assertPermission, hasPermission } from "@/server/auth/rbac";
import type { RoleKey } from "@/server/auth/rbac";
import { recordBetaPilotAutomatedEvidence } from "@/server/readiness/beta-pilot-checkpoints";
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
    return getDbPayrollDashboard(session);
  }
  return {
    run: getDemoPayrollRun(),
    checklist: getDemoPayrollChecklist(),
  };
}

export async function createPayrollRun(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    return createDbPayrollRun(session);
  }
  return createDemoPayrollRun();
}

export async function resolvePayrollBlockers(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    await resolveDbPayrollBlockers(session);
    return;
  }
  resolveDemoPayrollBlockers();
}

export async function recalculatePayrollRun(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    return recalculateDbPayrollRun(session);
  }
  return calculateDemoPayrollRun();
}

export async function confirmPayrollRun(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    return confirmDbPayrollRun(session);
  }
  confirmDemoPayrollRun();
}

export async function lockPayrollRun(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    return lockDbPayrollRun(session);
  }
  lockDemoPayrollRun();
}

export async function releasePayrollPayslips(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    const run = await releaseDbPayslips(session);
    await recordPayrollCheckpoint(session, "payroll_rehearsal", `payroll_release:${run?.id ?? "none"}`);
    return run;
  }
  releaseDemoPayslips();
  await recordPayrollCheckpoint(session, "payroll_rehearsal", "payroll_release:demo");
}

export async function getOwnPayslip(session: SessionLike): Promise<PayslipView | null> {
  if (!session.employee) return null;
  if (!canViewPayslip(session, session.employee.id)) {
    throw new Error("Unauthorized payslip access.");
  }
  if (canUseDatabase(session)) {
    const payslip = await getDbEmployeePayslip(session, session.employee.id);
    if (payslip) {
      await recordPayrollCheckpoint(session, "payslip_access", `payslip_access:${payslip.id}`);
    }
    return payslip;
  }
  const payslip = getDemoEmployeePayslip(session.employee.id);
  if (payslip) {
    await recordPayrollCheckpoint(session, "payslip_access", `payslip_access:${payslip.id}`);
  }
  return payslip;
}

async function recordPayrollCheckpoint(
  session: SessionLike,
  evidenceType: "payroll_rehearsal" | "payslip_access",
  evidenceRef: string,
) {
  try {
    await recordBetaPilotAutomatedEvidence(session, {
      checkpointId: "day_7",
      evidenceType,
      evidenceRef,
      requiredEvidenceTypes: ["payroll_rehearsal", "payslip_access"],
    });
  } catch {
    // Pilot evidence must never block payroll release or employee payslip reads.
  }
}

function canUseDatabase(session: SessionLike): session is DbPayrollSession {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
