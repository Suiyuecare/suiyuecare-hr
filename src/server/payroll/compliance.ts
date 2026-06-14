import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getTaiwanLaborStandardsConfig } from "@/server/rules/settings";
import {
  evaluatePayrollInsuranceGradeReadiness,
  type PayrollInsuranceGradeReadinessReport,
} from "./insurance-grade-readiness";
import type { PayrollComplianceProfileView } from "./types";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

type EmployeeComplianceRow = {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  jobTitle: string;
  salaryProfile: {
    baseSalary: number;
    recurringAllowances: Array<{ code: string; name: string; amount: number }>;
  } | null;
  profile: PayrollComplianceProfileView;
};

type ComplianceDemoState = {
  rows: EmployeeComplianceRow[];
};

const globalForCompliance = globalThis as unknown as {
  hrOnePayrollComplianceDemoState?: ComplianceDemoState;
};

export type PayrollComplianceUpdateInput = {
  employeeId: string;
  taxResidency: "resident" | "non_resident";
  dependentCount: number;
  laborInsuranceMonthlyWage?: number | null;
  healthInsuranceMonthlyWage?: number | null;
  laborPensionMonthlyWage?: number | null;
  incomeTaxWithholdingMethod: "annualized_progressive" | "non_resident_flat";
  nonResidentWithholdingRate?: number | null;
};

export async function listPayrollComplianceProfiles(session: SessionLike) {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    const employees = await getDb().employee.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employmentStatus: "active",
      },
      include: {
        salaryProfiles: {
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
        payrollComplianceProfiles: {
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
      orderBy: { employeeNo: "asc" },
    });

    return employees.map((employee) => {
      const profile = employee.payrollComplianceProfiles[0];
      return {
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        employeeName: employee.displayName,
        jobTitle: employee.jobTitle,
        salaryProfile: employee.salaryProfiles[0]
          ? {
              baseSalary: decimalToNumber(employee.salaryProfiles[0].baseSalary) ?? 0,
              recurringAllowances: readMoneyItems(employee.salaryProfiles[0].recurringAllowances),
            }
          : null,
        profile: profile
          ? mapDbProfile(profile)
          : defaultProfile(employee.id),
      };
    });
  }

  return getPayrollComplianceDemoRows();
}

export async function getPayrollInsuranceGradeReadiness(
  session: SessionLike,
  rows?: EmployeeComplianceRow[],
): Promise<PayrollInsuranceGradeReadinessReport> {
  const [workspaceRows, laborConfig] = await Promise.all([
    rows ? Promise.resolve(rows) : listPayrollComplianceProfiles(session),
    getTaiwanLaborStandardsConfig(session),
  ]);
  return evaluatePayrollInsuranceGradeReadiness(
    workspaceRows.flatMap((row) =>
      row.salaryProfile
        ? [
            {
              employeeId: row.employeeId,
              employeeNo: row.employeeNo,
              employeeName: row.employeeName,
              baseSalary: row.salaryProfile.baseSalary,
              recurringAllowances: row.salaryProfile.recurringAllowances,
              laborInsuranceMonthlyWage: row.profile.laborInsuranceMonthlyWage,
              healthInsuranceMonthlyWage: row.profile.healthInsuranceMonthlyWage,
              laborPensionMonthlyWage: row.profile.laborPensionMonthlyWage,
            },
          ]
        : [],
    ),
    laborConfig,
  );
}

export async function updatePayrollComplianceProfile(
  session: SessionLike,
  input: PayrollComplianceUpdateInput,
) {
  assertPermission(session.role, "payroll:manage");
  const normalized = normalizePayrollComplianceInput(input);
  if (canUseDatabase(session)) {
    return updateDbPayrollComplianceProfile(session, normalized);
  }

  const rows = getPayrollComplianceDemoRows();
  const row = rows.find((item) => item.employeeId === normalized.employeeId);
  if (!row) {
    throw new Error("Employee payroll compliance profile not found.");
  }
  const before = row.profile;
  row.profile = {
    ...before,
    ...normalized,
    effectiveFrom: new Date(),
  };
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "update",
    entityType: "payroll_compliance_profile",
    entityId: normalized.employeeId,
    before,
    after: row.profile,
    metadata: {
      employeeId: normalized.employeeId,
      changedFields: Object.keys(normalized).filter((key) => key !== "employeeId"),
      sensitivePayroll: true,
    },
  });
  return row.profile;
}

export function resetPayrollComplianceDemoState() {
  globalForCompliance.hrOnePayrollComplianceDemoState = undefined;
}

function getPayrollComplianceDemoRows() {
  if (!globalForCompliance.hrOnePayrollComplianceDemoState) {
    globalForCompliance.hrOnePayrollComplianceDemoState = {
      rows: [
        demoRow("demo-hr-employee", "E001", "林人資", "HR Admin", "resident", 0),
        demoRow("demo-manager-employee", "E002", "陳主管", "Engineering Manager", "resident", 2, {
          healthInsuranceMonthlyWage: 83900,
        }),
        demoRow("demo-employee-1", "E003", "張小安", "Frontend Engineer", "resident", 1),
        demoRow("demo-employee-2", "E004", "李小真", "Product Designer", "resident", 0),
        demoRow("demo-employee-3", "E005", "黃小宇", "Backend Engineer", "non_resident", 0, {
          nonResidentWithholdingRate: 0.18,
        }),
      ],
    };
  }
  return globalForCompliance.hrOnePayrollComplianceDemoState.rows;
}

async function updateDbPayrollComplianceProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizePayrollComplianceInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: {
        id: input.employeeId,
        tenantId: session.tenantId!,
        companyId: session.companyId!,
      },
      include: {
        payrollComplianceProfiles: {
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });
    if (!employee) {
      throw new Error("Employee payroll compliance profile not found.");
    }
    const before = employee.payrollComplianceProfiles[0]
      ? mapDbProfile(employee.payrollComplianceProfiles[0])
      : defaultProfile(employee.id);
    if (employee.payrollComplianceProfiles[0]) {
      await tx.payrollComplianceProfile.update({
        where: { id: employee.payrollComplianceProfiles[0].id },
        data: { effectiveTo: new Date() },
      });
    }
    const created = await tx.payrollComplianceProfile.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: input.employeeId,
        taxResidency: input.taxResidency,
        dependentCount: input.dependentCount,
        laborInsuranceMonthlyWage: input.laborInsuranceMonthlyWage,
        healthInsuranceMonthlyWage: input.healthInsuranceMonthlyWage,
        laborPensionMonthlyWage: input.laborPensionMonthlyWage,
        incomeTaxWithholdingMethod: input.incomeTaxWithholdingMethod,
        nonResidentWithholdingRate: input.nonResidentWithholdingRate,
        effectiveFrom: new Date(),
      },
    });
    const after = mapDbProfile(created);
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "payroll_compliance_profile",
      entityId: created.id,
      before,
      after,
      metadata: {
        employeeId: input.employeeId,
        previousProfileId: employee.payrollComplianceProfiles[0]?.id ?? null,
        changedFields: Object.keys(input).filter((key) => key !== "employeeId"),
        sensitivePayroll: true,
      },
    });
    return after;
  });
}

function normalizePayrollComplianceInput(input: PayrollComplianceUpdateInput) {
  return {
    employeeId: input.employeeId,
    taxResidency: input.taxResidency === "non_resident" ? "non_resident" as const : "resident" as const,
    dependentCount: Math.max(0, Math.trunc(input.dependentCount || 0)),
    laborInsuranceMonthlyWage: positiveOrNull(input.laborInsuranceMonthlyWage),
    healthInsuranceMonthlyWage: positiveOrNull(input.healthInsuranceMonthlyWage),
    laborPensionMonthlyWage: positiveOrNull(input.laborPensionMonthlyWage),
    incomeTaxWithholdingMethod:
      input.taxResidency === "non_resident" ? "non_resident_flat" as const : "annualized_progressive" as const,
    nonResidentWithholdingRate:
      input.taxResidency === "non_resident" ? boundedRateOrNull(input.nonResidentWithholdingRate) : null,
  };
}

function mapDbProfile(profile: {
  employeeId: string;
  taxResidency: string;
  dependentCount: number;
  laborInsuranceMonthlyWage: unknown;
  healthInsuranceMonthlyWage: unknown;
  laborPensionMonthlyWage: unknown;
  incomeTaxWithholdingMethod: string;
  nonResidentWithholdingRate: unknown;
  effectiveFrom: Date;
}) {
  return {
    employeeId: profile.employeeId,
    taxResidency: profile.taxResidency === "non_resident" ? "non_resident" as const : "resident" as const,
    dependentCount: profile.dependentCount,
    laborInsuranceMonthlyWage: decimalToNumber(profile.laborInsuranceMonthlyWage),
    healthInsuranceMonthlyWage: decimalToNumber(profile.healthInsuranceMonthlyWage),
    laborPensionMonthlyWage: decimalToNumber(profile.laborPensionMonthlyWage),
    incomeTaxWithholdingMethod:
      profile.incomeTaxWithholdingMethod === "non_resident_flat"
        ? "non_resident_flat" as const
        : "annualized_progressive" as const,
    nonResidentWithholdingRate: decimalToNumber(profile.nonResidentWithholdingRate),
    effectiveFrom: profile.effectiveFrom,
  };
}

function defaultProfile(employeeId: string): PayrollComplianceProfileView {
  return {
    employeeId,
    taxResidency: "resident",
    dependentCount: 0,
    incomeTaxWithholdingMethod: "annualized_progressive",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function demoRow(
  employeeId: string,
  employeeNo: string,
  employeeName: string,
  jobTitle: string,
  taxResidency: PayrollComplianceProfileView["taxResidency"],
  dependentCount: number,
  overrides: Partial<PayrollComplianceProfileView> = {},
): EmployeeComplianceRow {
  return {
    employeeId,
    employeeNo,
    employeeName,
    jobTitle,
    salaryProfile: demoSalaryProfile(employeeId),
    profile: {
      ...defaultProfile(employeeId),
      taxResidency,
      dependentCount,
      incomeTaxWithholdingMethod:
        taxResidency === "non_resident" ? "non_resident_flat" : "annualized_progressive",
      ...overrides,
    },
  };
}

function demoSalaryProfile(employeeId: string) {
  const profiles: Record<string, { baseSalary: number; recurringAllowances: Array<{ code: string; name: string; amount: number }> }> = {
    "demo-hr-employee": { baseSalary: 62000, recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: 2500 }] },
    "demo-manager-employee": { baseSalary: 78000, recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: 3000 }] },
    "demo-employee-1": { baseSalary: 56000, recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: 2000 }] },
    "demo-employee-2": { baseSalary: 54000, recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: 2000 }] },
    "demo-employee-3": { baseSalary: 58000, recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: 2000 }] },
  };
  return profiles[employeeId] ?? null;
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

function readMoneyItems(value: unknown): Array<{ code: string; name: string; amount: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const amount = Number(record.amount);
    if (!Number.isFinite(amount)) return [];
    return {
      code: String(record.code ?? "item"),
      name: String(record.name ?? "Item"),
      amount,
    };
  });
}

function positiveOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function boundedRateOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
