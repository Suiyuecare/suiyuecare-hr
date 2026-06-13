import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import type { MoneyItem } from "./types";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type SalaryProfileInput = {
  employeeId: string;
  baseSalary: number;
  hourlyWage?: number | null;
  allowanceCode?: string | null;
  allowanceName?: string | null;
  allowanceAmount?: number | null;
  deductionCode?: string | null;
  deductionName?: string | null;
  deductionAmount?: number | null;
  effectiveFrom: Date;
};

export type SalaryProfileRow = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  baseSalary: number;
  hourlyWage: number | null;
  recurringAllowances: MoneyItem[];
  recurringDeductions: MoneyItem[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type SalaryProfileWorkspace = {
  employees: Array<{
    id: string;
    employeeNo: string;
    displayName: string;
  }>;
  profiles: SalaryProfileRow[];
};

type SalaryProfileDemoState = {
  profiles: SalaryProfileRow[];
};

const globalForSalaryProfiles = globalThis as unknown as {
  hrOneSalaryProfileDemoState?: SalaryProfileDemoState;
};

export async function getSalaryProfileWorkspace(session: SessionLike): Promise<SalaryProfileWorkspace> {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    try {
      const [employees, profiles] = await Promise.all([
        getDb().employee.findMany({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            employmentStatus: "active",
          },
          orderBy: { employeeNo: "asc" },
        }),
        getDb().salaryProfile.findMany({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
          include: { employee: true },
          orderBy: [{ employee: { employeeNo: "asc" } }, { effectiveFrom: "desc" }],
        }),
      ]);
      return {
        employees: employees.map((employee) => ({
          id: employee.id,
          employeeNo: employee.employeeNo,
          displayName: employee.displayName,
        })),
        profiles: profiles.map((profile) => ({
          id: profile.id,
          employeeId: profile.employeeId,
          employeeNo: profile.employee.employeeNo,
          employeeName: profile.employee.displayName,
          baseSalary: decimalToNumber(profile.baseSalary),
          hourlyWage: decimalToNullableNumber(profile.hourlyWage),
          recurringAllowances: readMoneyItems(profile.recurringAllowances),
          recurringDeductions: readMoneyItems(profile.recurringDeductions),
          effectiveFrom: profile.effectiveFrom,
          effectiveTo: profile.effectiveTo,
        })),
      };
    } catch {
      return demoWorkspace();
    }
  }
  return demoWorkspace();
}

export async function saveSalaryProfile(session: SessionLike, input: SalaryProfileInput) {
  assertPermission(session.role, "payroll:manage");
  const normalized = normalizeSalaryProfileInput(input);
  if (canUseDatabase(session)) {
    try {
      return saveDbSalaryProfile(session, normalized);
    } catch {
      return saveDemoSalaryProfile(session, normalized);
    }
  }
  return saveDemoSalaryProfile(session, normalized);
}

export function resetSalaryProfileDemoState() {
  globalForSalaryProfiles.hrOneSalaryProfileDemoState = {
    profiles: [
      profile("demo-hr-employee", "E001", "林人資", 62000, 2500, 1200),
      profile("demo-manager-employee", "E002", "陳主管", 78000, 3000, 1800),
      profile("demo-employee-1", "E003", "張小安", 56000, 2000, 1000),
      profile("demo-employee-2", "E004", "李小真", 54000, 2000, 1000),
      profile("demo-employee-3", "E005", "黃小宇", 58000, 2000, 1000),
    ],
  };
}

async function saveDbSalaryProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizeSalaryProfileInput>,
) {
  const db = getDb();
  const employee = await db.employee.findFirst({
    where: {
      id: input.employeeId,
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
  });
  if (!employee) throw new Error("Employee not found for salary profile.");

  return db.$transaction(async (tx) => {
    const previous = await tx.salaryProfile.findFirst({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: employee.id,
        effectiveTo: null,
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (previous && previous.effectiveFrom < input.effectiveFrom) {
      await tx.salaryProfile.update({
        where: { id: previous.id },
        data: { effectiveTo: input.effectiveFrom },
      });
    }
    const created = await tx.salaryProfile.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: employee.id,
        baseSalary: input.baseSalary,
        hourlyWage: input.hourlyWage,
        recurringAllowances: input.recurringAllowances as Prisma.InputJsonValue,
        recurringDeductions: input.recurringDeductions as Prisma.InputJsonValue,
        effectiveFrom: input.effectiveFrom,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "salary_profile",
      entityId: created.id,
      before: previous,
      after: created,
      metadata: {
        employeeId: employee.id,
        effectiveFrom: input.effectiveFrom.toISOString().slice(0, 10),
        sensitiveValuesRedacted: true,
      },
    });
    return {
      id: created.id,
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      employeeName: employee.displayName,
      baseSalary: input.baseSalary,
      hourlyWage: input.hourlyWage,
      recurringAllowances: input.recurringAllowances,
      recurringDeductions: input.recurringDeductions,
      effectiveFrom: created.effectiveFrom,
      effectiveTo: created.effectiveTo,
    };
  });
}

function saveDemoSalaryProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizeSalaryProfileInput>,
) {
  const state = getSalaryProfileDemoState();
  const overview = getFallbackCompanyOverview();
  const employee = overview.company.employees.find((item) => item.id === input.employeeId);
  if (!employee) throw new Error("Employee not found for salary profile.");
  for (const existing of state.profiles) {
    if (existing.employeeId === employee.id && !existing.effectiveTo && existing.effectiveFrom < input.effectiveFrom) {
      existing.effectiveTo = input.effectiveFrom;
    }
  }
  const created: SalaryProfileRow = {
    id: crypto.randomUUID(),
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.displayName,
    baseSalary: input.baseSalary,
    hourlyWage: input.hourlyWage,
    recurringAllowances: input.recurringAllowances,
    recurringDeductions: input.recurringDeductions,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
  };
  state.profiles.unshift(created);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "salary_profile",
    entityId: created.id,
    after: created,
    metadata: {
      employeeId: employee.id,
      effectiveFrom: input.effectiveFrom.toISOString().slice(0, 10),
      sensitiveValuesRedacted: true,
    },
  });
  return created;
}

function normalizeSalaryProfileInput(input: SalaryProfileInput) {
  const baseSalary = normalizeMoney(input.baseSalary, "Base salary");
  const hourlyWage =
    input.hourlyWage === null || input.hourlyWage === undefined || Number(input.hourlyWage) === 0
      ? null
      : normalizeMoney(input.hourlyWage, "Hourly wage");
  const effectiveFrom = startOfDate(input.effectiveFrom);
  if (!input.employeeId) throw new Error("Employee is required.");
  if (Number.isNaN(effectiveFrom.getTime())) throw new Error("Effective date is required.");
  return {
    employeeId: input.employeeId,
    baseSalary,
    hourlyWage,
    recurringAllowances: moneyItem(input.allowanceCode, input.allowanceName, input.allowanceAmount),
    recurringDeductions: moneyItem(input.deductionCode, input.deductionName, input.deductionAmount),
    effectiveFrom,
  };
}

function moneyItem(code?: string | null, name?: string | null, amount?: number | null): MoneyItem[] {
  const parsed = Number(amount ?? 0);
  const normalizedAmount = Number.isFinite(parsed) ? Math.round(parsed) : 0;
  if (normalizedAmount <= 0) return [];
  return [
    {
      code: (code?.trim() || "item").toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
      name: name?.trim() || "Recurring item",
      amount: normalizedAmount,
    },
  ];
}

function demoWorkspace(): SalaryProfileWorkspace {
  const overview = getFallbackCompanyOverview();
  return {
    employees: overview.company.employees.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
    })),
    profiles: getSalaryProfileDemoState().profiles,
  };
}

function getSalaryProfileDemoState() {
  if (!globalForSalaryProfiles.hrOneSalaryProfileDemoState) resetSalaryProfileDemoState();
  return globalForSalaryProfiles.hrOneSalaryProfileDemoState!;
}

function profile(employeeId: string, employeeNo: string, employeeName: string, baseSalary: number, allowance: number, deduction: number): SalaryProfileRow {
  return {
    id: `demo-salary-profile-${employeeId}`,
    employeeId,
    employeeNo,
    employeeName,
    baseSalary,
    hourlyWage: null,
    recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: allowance }],
    recurringDeductions: [{ code: "welfare", name: "Welfare deduction", amount: deduction }],
    effectiveFrom: new Date("2026-01-01T00:00:00+08:00"),
    effectiveTo: null,
  };
}

function normalizeMoney(value: number, label: string) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

function readMoneyItems(value: unknown): MoneyItem[] {
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

function decimalToNumber(value: unknown) {
  return decimalToNullableNumber(value) ?? 0;
}

function decimalToNullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function startOfDate(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
