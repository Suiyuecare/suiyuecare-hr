import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, normalizeRole, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import {
  getDemoHrExceptions,
  resolveDemoHrException,
  resolveDemoSafeHrExceptions,
} from "@/server/workflows/demo-store";
import type { HrExceptionView } from "@/server/workflows/types";

type SessionLike = {
  role: string;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type AttendanceExceptionResolutionSummary = {
  pendingCount: number;
  resolvedCount: number;
  autoResolvableCount: number;
  highRiskCount: number;
  resolutionRate: number;
  kpiReady: boolean;
  detail: string;
};

const safeResolutionTypes = new Set(["missing_clock_in", "missing_clock_out", "duplicate_punch"]);

export async function listAttendanceExceptions(session: SessionLike) {
  assertPermission(role(session.role), "employee:read");
  if (canUseDatabase(session)) {
    try {
      const exceptions = await getDb().attendanceException.findMany({
        where: {
          tenantId: session.tenantId,
          companyId: session.companyId,
        },
        include: {
          employee: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      return exceptions.map(
        (exception): HrExceptionView => ({
          id: exception.id,
          employeeName: exception.employee.displayName,
          exceptionType: exception.exceptionType,
          severity: exception.severity,
          status: exception.status,
          suggestedResolution: suggestedResolution(exception.exceptionType),
          autoResolvable: isSafeAutoResolvable(exception.exceptionType, exception.severity, exception.status),
          resolutionCode: exception.resolutionCode,
          resolvedAt: exception.resolvedAt,
          createdAt: exception.createdAt,
        }),
      );
    } catch {
      return getDemoHrExceptions();
    }
  }
  return getDemoHrExceptions();
}

export async function resolveAttendanceException(
  session: SessionLike,
  input: { exceptionId: string; resolutionCode: string; evidenceRef?: string | null; comment?: string | null },
) {
  assertPermission(role(session.role), "employee:write");
  const resolutionCode = normalizeResolutionCode(input.resolutionCode);
  const evidenceHash = resolutionEvidenceHash({
    resolutionCode,
    evidenceRef: input.evidenceRef,
    comment: input.comment,
  });
  if (canUseDatabase(session)) {
    try {
      return resolveDbAttendanceException(session, {
        exceptionId: input.exceptionId,
        resolutionCode,
        evidenceHash,
      });
    } catch {
      return resolveDemoAttendanceException(session, input.exceptionId, resolutionCode, evidenceHash);
    }
  }
  return resolveDemoAttendanceException(session, input.exceptionId, resolutionCode, evidenceHash);
}

export async function resolveSafeAttendanceExceptions(session: SessionLike) {
  assertPermission(role(session.role), "employee:write");
  if (canUseDatabase(session)) {
    try {
      return resolveDbSafeAttendanceExceptions(session);
    } catch {
      return resolveDemoSafeAttendanceExceptionBatch(session);
    }
  }
  return resolveDemoSafeAttendanceExceptionBatch(session);
}

export function summarizeAttendanceExceptionResolution(
  exceptions: HrExceptionView[],
): AttendanceExceptionResolutionSummary {
  const pending = exceptions.filter((exception) => exception.status === "pending");
  const resolved = exceptions.filter((exception) => exception.status !== "pending");
  const autoResolvable = pending.filter((exception) => exception.autoResolvable);
  const highRisk = pending.filter((exception) => exception.severity === "danger" || !exception.autoResolvable);
  const total = pending.length + resolved.length;
  const resolutionRate = total === 0 ? 100 : Math.round((resolved.length / total) * 100);
  return {
    pendingCount: pending.length,
    resolvedCount: resolved.length,
    autoResolvableCount: autoResolvable.length,
    highRiskCount: highRisk.length,
    resolutionRate,
    kpiReady: resolutionRate >= 90 && highRisk.length === 0,
    detail: `${resolved.length}/${total} exception(s) resolved; ${autoResolvable.length} safe suggestion(s); ${highRisk.length} high-risk item(s) need HR review.`,
  };
}

function suggestedResolution(exceptionType: string) {
  if (exceptionType === "missing_clock_in" || exceptionType === "missing_clock_out") {
    return "Request employee punch correction before payroll close.";
  }
  if (exceptionType === "duplicate_punch") {
    return "Keep earliest valid punch and mark duplicate as reviewed.";
  }
  if (exceptionType.startsWith("worktime_")) {
    return "HR must review legal working-time risk before payroll lock.";
  }
  return "Review source attendance, leave, overtime, and shift records before payroll close.";
}

function isSafeAutoResolvable(exceptionType: string, severity: string, status: string) {
  return status === "pending" && severity === "warning" && safeResolutionTypes.has(exceptionType);
}

async function resolveDbAttendanceException(
  session: SessionLike & { tenantId: string; companyId: string },
  input: { exceptionId: string; resolutionCode: string; evidenceHash: string },
) {
  const resolved = await getDb().$transaction(async (tx) => {
    const before = await tx.attendanceException.findFirstOrThrow({
      where: {
        id: input.exceptionId,
        tenantId: session.tenantId,
        companyId: session.companyId,
      },
      include: { employee: true },
    });
    const updated = await tx.attendanceException.update({
      where: { id: before.id },
      data: {
        status: "approved",
        resolutionCode: input.resolutionCode,
        resolutionEvidenceHash: input.evidenceHash,
        resolvedByUserId: session.user?.id,
        resolvedAt: new Date(),
      },
      include: { employee: true },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "attendance_exception",
      entityId: updated.id,
      before: {
        status: before.status,
        resolutionCode: before.resolutionCode,
      },
      after: {
        status: updated.status,
        resolutionCode: updated.resolutionCode,
        resolutionEvidenceHash: updated.resolutionEvidenceHash,
        resolvedAt: updated.resolvedAt,
      },
      metadata: {
        exceptionType: updated.exceptionType,
        severity: updated.severity,
        resolutionCode: updated.resolutionCode,
        resolutionEvidenceHash: updated.resolutionEvidenceHash,
        autoResolutionApplied: isSafeAutoResolvable(before.exceptionType, before.severity, before.status),
        rawEvidenceIncluded: false,
      },
    });
    return updated;
  });
  return {
    id: resolved.id,
    employeeName: resolved.employee.displayName,
    exceptionType: resolved.exceptionType,
    severity: resolved.severity,
    status: resolved.status,
    suggestedResolution: suggestedResolution(resolved.exceptionType),
    autoResolvable: false,
    resolutionCode: resolved.resolutionCode,
    resolvedAt: resolved.resolvedAt,
    createdAt: resolved.createdAt,
  } satisfies HrExceptionView;
}

async function resolveDbSafeAttendanceExceptions(session: SessionLike & { tenantId: string; companyId: string }) {
  const candidates = await getDb().attendanceException.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
      status: "pending",
      severity: "warning",
      exceptionType: { in: [...safeResolutionTypes] },
    },
  });
  for (const exception of candidates) {
    await resolveDbAttendanceException(session, {
      exceptionId: exception.id,
      resolutionCode: "employee_self_correction_requested",
      evidenceHash: resolutionEvidenceHash({
        resolutionCode: "employee_self_correction_requested",
        evidenceRef: exception.attendanceRecordId,
        comment: "Safe suggestion applied by HR.",
      }),
    });
  }
  return { resolvedCount: candidates.length };
}

function resolveDemoAttendanceException(
  session: SessionLike,
  exceptionId: string,
  resolutionCode: string,
  evidenceHash: string,
) {
  const exception = resolveDemoHrException({ exceptionId, resolutionCode });
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "attendance_exception",
    entityId: exception.id,
    after: {
      status: exception.status,
      resolutionCode,
      resolutionEvidenceHash: evidenceHash,
      resolvedAt: exception.resolvedAt,
    },
    metadata: {
      exceptionType: exception.exceptionType,
      severity: exception.severity,
      resolutionCode,
      resolutionEvidenceHash: evidenceHash,
      autoResolutionApplied: Boolean(exception.autoResolvable),
      rawEvidenceIncluded: false,
    },
  });
  return exception;
}

function resolveDemoSafeAttendanceExceptionBatch(session: SessionLike) {
  const result = resolveDemoSafeHrExceptions();
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "attendance_exception_resolution_batch",
    entityId: `demo-attendance-exception-resolution-${Date.now()}`,
    after: result,
    metadata: {
      resolvedCount: result.resolvedCount,
      resolutionCode: "employee_self_correction_requested",
      rawEvidenceIncluded: false,
    },
  });
  return result;
}

function resolutionEvidenceHash(input: {
  resolutionCode: string;
  evidenceRef?: string | null;
  comment?: string | null;
}) {
  return stableHash({
    resolutionCode: input.resolutionCode,
    evidenceProvided: Boolean(input.evidenceRef),
    commentProvided: Boolean(input.comment),
    evidenceRefHash: input.evidenceRef ? stableHash(input.evidenceRef) : null,
    commentHash: input.comment ? stableHash(input.comment) : null,
  });
}

function normalizeResolutionCode(value: string) {
  const normalized = value.trim().replace(/\s+/g, "_").toLowerCase();
  return normalized || "hr_reviewed_for_payroll";
}

function role(value: string): RoleKey {
  return normalizeRole(value);
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
