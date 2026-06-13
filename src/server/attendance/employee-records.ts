import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getActiveAttendancePolicy } from "./policies";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  employee?: { id: string; displayName: string } | null;
};

export type EmployeeAttendanceRecordView = {
  id: string;
  workDate: Date;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  clockInSource: string | null;
  clockOutSource: string | null;
  status: string;
};

export async function getEmployeeAttendanceRecordWorkspace(session: SessionLike) {
  assertPermission(session.role, "attendance:read:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  const policy = await getActiveAttendancePolicy(session);
  if (canUseDatabase(session)) {
    try {
      const records = await getDb().attendanceRecord.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employeeId: session.employee.id,
        },
        orderBy: { workDate: "desc" },
        take: 31,
      });
      return {
        policy,
        records: records.map((record) => ({
          id: record.id,
          workDate: record.workDate,
          clockInAt: record.clockInAt,
          clockOutAt: record.clockOutAt,
          clockInSource: record.clockInSource,
          clockOutSource: record.clockOutSource,
          status: record.status,
        })),
      };
    } catch {
      return demoWorkspace(policy);
    }
  }
  return demoWorkspace(policy);
}

function demoWorkspace(policy: Awaited<ReturnType<typeof getActiveAttendancePolicy>>) {
  const today = new Date();
  const workDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return {
    policy,
    records: [
      {
        id: "demo-attendance-record-today",
        workDate,
        clockInAt: new Date(`${workDate.toISOString().slice(0, 10)}T09:02:00+08:00`),
        clockOutAt: new Date(`${workDate.toISOString().slice(0, 10)}T18:04:00+08:00`),
        clockInSource: "mobile",
        clockOutSource: "mobile",
        status: "complete",
      },
      {
        id: "demo-attendance-record-yesterday",
        workDate: new Date(workDate.getTime() - 86_400_000),
        clockInAt: new Date(`${new Date(workDate.getTime() - 86_400_000).toISOString().slice(0, 10)}T09:00:00+08:00`),
        clockOutAt: new Date(`${new Date(workDate.getTime() - 86_400_000).toISOString().slice(0, 10)}T18:00:00+08:00`),
        clockInSource: "web",
        clockOutSource: "web",
        status: "complete",
      },
    ] satisfies EmployeeAttendanceRecordView[],
  };
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
