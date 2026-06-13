import { getDb } from "@/server/db/client";
import { writeAuditLog } from "@/server/audit/audit";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";

type CreateEmployeeInput = {
  tenantId: string;
  companyId: string;
  actorUserId: string;
  actorEmployeeId?: string | null;
  actorRole: RoleKey;
  employeeNo: string;
  displayName: string;
  jobTitle: string;
  departmentId?: string | null;
  hireDate: Date;
};

export async function createEmployeeWithAudit(input: CreateEmployeeInput) {
  assertPermission(input.actorRole, "employee:write");
  const db = getDb();

  return db.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        employeeNo: input.employeeNo,
        displayName: input.displayName,
        jobTitle: input.jobTitle,
        departmentId: input.departmentId,
        hireDate: input.hireDate,
      },
    });

    await writeAuditLog(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      actorEmployeeId: input.actorEmployeeId,
      action: "create",
      entityType: "employee",
      entityId: employee.id,
      after: employee,
      metadata: {
        source: "createEmployeeWithAudit",
        sensitiveFields: "redacted",
      },
    });

    return employee;
  });
}

