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
};

export type EmployeeImportWorkspace = {
  preview: EmployeeImportPreview | null;
  departments: Array<{ id: string; code: string; name: string }>;
  employees: Array<{ id: string; employeeNo: string; displayName: string }>;
};

type ImportDemoState = {
  previews: EmployeeImportPreview[];
  importedEmployees: Array<{ id: string; employeeNo: string; displayName: string; jobTitle: string }>;
};

const requiredHeaders = ["employeeNo", "displayName", "jobTitle", "departmentCode", "hireDate"] as const;

const globalForImports = globalThis as unknown as {
  hrOneEmployeeImportDemoState?: ImportDemoState;
};

export async function getEmployeeImportWorkspace(session: SessionLike): Promise<EmployeeImportWorkspace> {
  assertPermission(session.role, "employee:write");
  if (canUseDatabase(session)) {
    try {
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
    } catch {
      return demoWorkspace();
    }
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
    try {
      return importDbEmployees(session, preview);
    } catch {
      return importDemoEmployees(session, preview);
    }
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
          hireDate: employee.hireDate,
        },
        metadata: {
          source: "employee_csv_import",
          previewId: preview.id,
          rowNumber: row.rowNumber,
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
  const seenEmployeeNos = new Set<string>();
  const rows = lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const record = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]?.trim() ?? ""]));
    const employeeNo = record.employeeNo ?? "";
    const department = departmentByCode.get((record.departmentCode ?? "").toLowerCase()) ?? null;
    const hireDate = parseDateOnly(record.hireDate ?? "");
    const errors: string[] = [];
    if (!employeeNo) errors.push("Employee number is required.");
    if (employeeNo && existingEmployeeNos.has(employeeNo.toLowerCase())) errors.push("Employee number already exists.");
    if (employeeNo && seenEmployeeNos.has(employeeNo.toLowerCase())) errors.push("Duplicate employee number in CSV.");
    if (!record.displayName) errors.push("Display name is required.");
    if (!record.jobTitle) errors.push("Job title is required.");
    if (!department) errors.push("Department code was not found.");
    if (!hireDate) errors.push("Hire date must be YYYY-MM-DD.");
    seenEmployeeNos.add(employeeNo.toLowerCase());
    return {
      rowNumber: index + 2,
      employeeNo,
      displayName: record.displayName ?? "",
      jobTitle: record.jobTitle ?? "",
      departmentCode: record.departmentCode ?? "",
      departmentId: department?.id ?? null,
      departmentName: department?.name ?? null,
      hireDate,
      managerEmployeeNo: record.managerEmployeeNo || null,
      status: errors.length === 0 ? "valid" : "invalid",
      errors,
    } satisfies EmployeeImportRow;
  });
  return {
    id: crypto.randomUUID(),
    rawCsv,
    createdAt: new Date(),
    rows,
    validCount: rows.filter((row) => row.status === "valid").length,
    invalidCount: rows.filter((row) => row.status === "invalid").length,
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
