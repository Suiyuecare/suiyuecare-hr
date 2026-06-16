import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type EmployeeImportRow = {
  rowNumber: number;
  employeeNo: string;
  displayName: string;
  jobTitle: string;
  departmentCode: string;
  departmentId: string | null;
  departmentName: string | null;
  hireDate: Date | null;
  managerEmployeeNo: string | null;
  status: "valid" | "invalid";
  errors: string[];
};

export type EmployeeImportPreview = {
  id: string;
  rawCsv: string;
  createdAt: Date;
  rows: EmployeeImportRow[];
  validCount: number;
  invalidCount: number;
  pilotReadiness: EmployeeImportPilotReadiness;
};

export type EmployeeImportPilotReadiness = {
  status: "ready" | "action_required" | "blocked";
  targetMin: number;
  targetMax: number;
  existingEmployeeCount: number;
  projectedEmployeeCount: number;
  managerAssignmentCount: number;
  issues: string[];
};

export type EmployeeImportWorkspace = {
  preview: EmployeeImportPreview | null;
  departments: Array<{ id: string; code: string; name: string }>;
  employees: Array<{ id: string; employeeNo: string; displayName: string }>;
};

type ImportDemoState = {
  previews: EmployeeImportPreview[];
  importedEmployees: Array<{
    id: string;
    employeeNo: string;
    displayName: string;
    jobTitle: string;
    managerEmployeeNo: string | null;
  }>;
};

const requiredHeaders = ["employeeNo", "displayName", "jobTitle", "departmentCode", "hireDate"] as const;
const pilotTargetMinEmployees = 20;
const pilotTargetMaxEmployees = 50;

const globalForImports = globalThis as unknown as {
  hrOneEmployeeImportDemoState?: ImportDemoState;
};

export async function getEmployeeImportWorkspace(session: SessionLike): Promise<EmployeeImportWorkspace> {
  assertPermission(session.role, "employee:write");
  if (canUseDatabase(session)) {
    const [departments, employees] = await Promise.all([
      getDb().department.findMany({
        where: { tenantId: session.tenantId!, companyId: session.companyId! },
        orderBy: { code: "asc" },
      }),
      getDb().employee.findMany({
        where: { tenantId: session.tenantId!, companyId: session.companyId! },
        orderBy: { employeeNo: "asc" },
      }),
    ]);
    return {
      preview: latestPreview(),
      departments: departments.map((department) => ({
        id: department.id,
        code: department.code,
        name: department.name,
      })),
      employees: employees.map((employee) => ({
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
      })),
    };
  }
  return demoWorkspace();
}

export async function previewEmployeeImport(session: SessionLike, rawCsv: string) {
  assertPermission(session.role, "employee:write");
  const workspace = await getEmployeeImportWorkspace(session);
  const preview = buildPreview(rawCsv, workspace.departments, workspace.employees);
  getDemoState().previews.unshift(preview);
  return preview;
}

export async function confirmEmployeeImport(session: SessionLike, previewId: string) {
  assertPermission(session.role, "employee:write");
  const preview = getDemoState().previews.find((item) => item.id === previewId);
  if (!preview) throw new Error("Import preview expired. Preview the CSV again.");
  if (preview.invalidCount > 0) throw new Error("Fix invalid rows before importing employees.");
  if (preview.validCount === 0) throw new Error("No valid employee rows to import.");

  if (canUseDatabase(session)) {
    return importDbEmployees(session, preview);
  }
  return importDemoEmployees(session, preview);
}

export function resetEmployeeImportDemoState() {
  globalForImports.hrOneEmployeeImportDemoState = {
    previews: [],
    importedEmployees: [],
  };
}

async function importDbEmployees(session: SessionLike, preview: EmployeeImportPreview) {
  const db = getDb();
  const validRows = preview.rows.filter((row) => row.status === "valid");
  const imported = await db.$transaction(async (tx) => {
    const existingEmployees = await tx.employee.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      select: {
        id: true,
        employeeNo: true,
      },
    });
    const employeeIdByNo = new Map(existingEmployees.map((employee) => [employee.employeeNo.toLowerCase(), employee.id]));
    const createdEmployees: Array<{ id: string; employeeNo: string; displayName: string }> = [];
    for (const row of validRows) {
      const employee = await tx.employee.create({
        data: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employeeNo: row.employeeNo,
          displayName: row.displayName,
          jobTitle: row.jobTitle,
          departmentId: row.departmentId,
          hireDate: row.hireDate!,
        },
      });
      createdEmployees.push({
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
      });
      employeeIdByNo.set(employee.employeeNo.toLowerCase(), employee.id);
    }

    for (const row of validRows) {
      if (!row.managerEmployeeNo) continue;
      const employeeId = employeeIdByNo.get(row.employeeNo.toLowerCase());
      const managerId = employeeIdByNo.get(row.managerEmployeeNo.toLowerCase());
      if (!employeeId || !managerId) continue;
      await tx.employee.update({
        where: { id: employeeId },
        data: { managerId },
      });
    }

    for (const row of validRows) {
      const employee = await tx.employee.findUniqueOrThrow({
        where: {
          companyId_employeeNo: {
            companyId: session.companyId!,
            employeeNo: row.employeeNo,
          },
        },
      });
      await writeAuditLog(tx, {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        actorUserId: session.user?.id,
        actorEmployeeId: session.employee?.id,
        action: "create",
        entityType: "employee",
        entityId: employee.id,
        after: {
          id: employee.id,
          employeeNo: employee.employeeNo,
          displayName: employee.displayName,
          jobTitle: employee.jobTitle,
          departmentId: employee.departmentId,
          managerId: employee.managerId,
          hireDate: employee.hireDate,
        },
        metadata: {
          source: "employee_csv_import",
          previewId: preview.id,
          rowNumber: row.rowNumber,
          managerEmployeeNo: row.managerEmployeeNo,
        },
      });
    }
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "employee_import",
      entityId: preview.id,
      after: {
        importedCount: createdEmployees.length,
        previewId: preview.id,
      },
      metadata: {
        importedCount: createdEmployees.length,
        invalidCount: preview.invalidCount,
        projectedEmployeeCount: preview.pilotReadiness.projectedEmployeeCount,
        managerAssignmentCount: preview.pilotReadiness.managerAssignmentCount,
        pilotReadinessStatus: preview.pilotReadiness.status,
      },
    });
    return createdEmployees;
  });
  return { importedCount: imported.length };
}

function importDemoEmployees(session: SessionLike, preview: EmployeeImportPreview) {
  const state = getDemoState();
  const imported = preview.rows.filter((row) => row.status === "valid").map((row) => ({
    id: `demo-import-${row.employeeNo}`,
    employeeNo: row.employeeNo,
    displayName: row.displayName,
    jobTitle: row.jobTitle,
    managerEmployeeNo: row.managerEmployeeNo,
  }));
  state.importedEmployees.unshift(...imported);
  for (const employee of imported) {
    writeDemoAuditLog({
      tenantId: session.tenantId ?? "demo-tenant",
      companyId: session.companyId ?? "demo-company",
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      actorName: session.user?.displayName ?? session.employee?.displayName,
      action: "create",
      entityType: "employee",
      entityId: employee.id,
      after: employee,
      metadata: {
        source: "employee_csv_import",
        previewId: preview.id,
        managerEmployeeNo: employee.managerEmployeeNo,
      },
    });
  }
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "employee_import",
    entityId: preview.id,
    after: {
      importedCount: imported.length,
      previewId: preview.id,
    },
    metadata: {
      importedCount: imported.length,
      invalidCount: preview.invalidCount,
      projectedEmployeeCount: preview.pilotReadiness.projectedEmployeeCount,
      managerAssignmentCount: preview.pilotReadiness.managerAssignmentCount,
      pilotReadinessStatus: preview.pilotReadiness.status,
    },
  });
  return { importedCount: imported.length };
}

function buildPreview(
  rawCsv: string,
  departments: EmployeeImportWorkspace["departments"],
  employees: EmployeeImportWorkspace["employees"],
): EmployeeImportPreview {
  const trimmed = rawCsv.trim();
  if (!trimmed) throw new Error("CSV content is required.");
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required CSV header: ${header}`);
    }
  }
  const departmentByCode = new Map(departments.map((department) => [department.code.toLowerCase(), department]));
  const existingEmployeeNos = new Set(employees.map((employee) => employee.employeeNo.toLowerCase()));
  const records = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]?.trim() ?? ""]));
  });
  const csvEmployeeNos = new Set(
    records
      .map((record) => String(record.employeeNo ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const seenEmployeeNos = new Set<string>();
  const rows = records.map((record, index) => {
    const employeeNo = record.employeeNo ?? "";
    const normalizedEmployeeNo = employeeNo.toLowerCase();
    const managerEmployeeNo = record.managerEmployeeNo || null;
    const normalizedManagerEmployeeNo = managerEmployeeNo?.toLowerCase() ?? null;
    const department = departmentByCode.get((record.departmentCode ?? "").toLowerCase()) ?? null;
    const hireDate = parseDateOnly(record.hireDate ?? "");
    const errors: string[] = [];
    if (!employeeNo) errors.push("Employee number is required.");
    if (employeeNo && existingEmployeeNos.has(normalizedEmployeeNo)) errors.push("Employee number already exists.");
    if (employeeNo && seenEmployeeNos.has(normalizedEmployeeNo)) errors.push("Duplicate employee number in CSV.");
    if (!record.displayName) errors.push("Display name is required.");
    if (!record.jobTitle) errors.push("Job title is required.");
    if (!department) errors.push("Department code was not found.");
    if (!hireDate) errors.push("Hire date must be YYYY-MM-DD.");
    if (normalizedManagerEmployeeNo) {
      if (normalizedManagerEmployeeNo === normalizedEmployeeNo) errors.push("Manager cannot be the same employee.");
      if (!existingEmployeeNos.has(normalizedManagerEmployeeNo) && !csvEmployeeNos.has(normalizedManagerEmployeeNo)) {
        errors.push("Manager employee number was not found in existing employees or CSV.");
      }
    }
    seenEmployeeNos.add(normalizedEmployeeNo);
    return {
      rowNumber: index + 2,
      employeeNo,
      displayName: record.displayName ?? "",
      jobTitle: record.jobTitle ?? "",
      departmentCode: record.departmentCode ?? "",
      departmentId: department?.id ?? null,
      departmentName: department?.name ?? null,
      hireDate,
      managerEmployeeNo,
      status: errors.length === 0 ? "valid" : "invalid",
      errors,
    } satisfies EmployeeImportRow;
  });
  const rowByEmployeeNo = new Map(rows.map((row) => [row.employeeNo.toLowerCase(), row]));
  for (const row of rows) {
    const normalizedManagerEmployeeNo = row.managerEmployeeNo?.toLowerCase();
    if (
      row.status === "valid" &&
      normalizedManagerEmployeeNo &&
      !existingEmployeeNos.has(normalizedManagerEmployeeNo) &&
      rowByEmployeeNo.get(normalizedManagerEmployeeNo)?.status !== "valid"
    ) {
      row.errors.push("Manager employee number points to an invalid CSV row.");
      row.status = "invalid";
    }
  }
  const pilotReadiness = evaluateEmployeeImportPilotReadiness(rows, employees.length);
  return {
    id: crypto.randomUUID(),
    rawCsv,
    createdAt: new Date(),
    rows,
    validCount: rows.filter((row) => row.status === "valid").length,
    invalidCount: rows.filter((row) => row.status === "invalid").length,
    pilotReadiness,
  };
}

function evaluateEmployeeImportPilotReadiness(
  rows: EmployeeImportRow[],
  existingEmployeeCount: number,
): EmployeeImportPilotReadiness {
  const validRows = rows.filter((row) => row.status === "valid");
  const invalidCount = rows.length - validRows.length;
  const projectedEmployeeCount = existingEmployeeCount + validRows.length;
  const managerAssignmentCount = validRows.filter((row) => row.managerEmployeeNo).length;
  const issues: string[] = [];
  if (validRows.length === 0) issues.push("No valid employee rows are ready to import.");
  if (invalidCount > 0) issues.push(`${invalidCount} invalid row(s) must be fixed before this can support a pilot.`);
  if (projectedEmployeeCount < pilotTargetMinEmployees) {
    issues.push(`Projected employee count is ${projectedEmployeeCount}; import at least ${pilotTargetMinEmployees - projectedEmployeeCount} more employee(s) to reach a 20-person pilot.`);
  }
  if (projectedEmployeeCount > pilotTargetMaxEmployees) {
    issues.push(`Projected employee count is ${projectedEmployeeCount}; split the import so the pilot stays within 50 people.`);
  }
  if (managerAssignmentCount === 0) {
    issues.push("No managerEmployeeNo values were provided; manager approvals need at least one reporting line.");
  }
  return {
    status: issues.length === 0 ? "ready" : validRows.length === 0 ? "blocked" : "action_required",
    targetMin: pilotTargetMinEmployees,
    targetMax: pilotTargetMaxEmployees,
    existingEmployeeCount,
    projectedEmployeeCount,
    managerAssignmentCount,
    issues,
  };
}

function demoWorkspace(): EmployeeImportWorkspace {
  const overview = getFallbackCompanyOverview();
  const state = getDemoState();
  return {
    preview: latestPreview(),
    departments: overview.company.departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
    })),
    employees: [
      ...overview.company.employees.map((employee) => ({
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
      })),
      ...state.importedEmployees.map((employee) => ({
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
      })),
    ],
  };
}

function latestPreview() {
  return getDemoState().previews[0] ?? null;
}

function getDemoState() {
  if (!globalForImports.hrOneEmployeeImportDemoState) {
    resetEmployeeImportDemoState();
  }
  return globalForImports.hrOneEmployeeImportDemoState!;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
