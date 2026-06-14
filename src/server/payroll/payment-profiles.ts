import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
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

export type PaymentProfileInput = {
  employeeId: string;
  bankCode: string;
  bankBranchCode?: string | null;
  accountName: string;
  accountNumber: string;
  effectiveFrom: Date;
};

export type PaymentProfileRow = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  paymentMethod: "bank_transfer";
  bankCode: string;
  bankBranchCode: string | null;
  accountName: string;
  accountNumberLast4: string;
  status: "active" | "inactive";
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type PaymentProfileWorkspace = {
  employees: Array<{
    id: string;
    employeeNo: string;
    displayName: string;
  }>;
  profiles: PaymentProfileRow[];
  activeCoverage: {
    totalEmployees: number;
    configuredEmployees: number;
    missingEmployees: Array<{ id: string; employeeNo: string; displayName: string }>;
  };
};

type PaymentProfileDemoState = {
  profiles: PaymentProfileRow[];
};

const globalForPaymentProfiles = globalThis as unknown as {
  hrOnePaymentProfileDemoState?: PaymentProfileDemoState;
};

export async function getPaymentProfileWorkspace(session: SessionLike): Promise<PaymentProfileWorkspace> {
  assertPermission(session.role, "payroll:manage");
  if (canUseDatabase(session)) {
    const [employees, profiles] = await Promise.all([
      getDb().employee.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employmentStatus: "active",
        },
        orderBy: { employeeNo: "asc" },
      }),
      getDb().employeePaymentProfile.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        include: { employee: true },
        orderBy: [{ employee: { employeeNo: "asc" } }, { effectiveFrom: "desc" }],
      }),
    ]);
    return buildWorkspace(
      employees.map((employee) => ({
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
      })),
      profiles.map((profile) => ({
        id: profile.id,
        employeeId: profile.employeeId,
        employeeNo: profile.employee.employeeNo,
        employeeName: profile.employee.displayName,
        paymentMethod: "bank_transfer",
        bankCode: profile.bankCode,
        bankBranchCode: profile.bankBranchCode,
        accountName: profile.accountName,
        accountNumberLast4: profile.accountNumberLast4,
        status: profile.status === "inactive" ? "inactive" : "active",
        effectiveFrom: profile.effectiveFrom,
        effectiveTo: profile.effectiveTo,
      })),
    );
  }
  return demoWorkspace();
}

export async function savePaymentProfile(session: SessionLike, input: PaymentProfileInput) {
  assertPermission(session.role, "payroll:manage");
  const normalized = normalizePaymentProfileInput(input);
  if (canUseDatabase(session)) {
    return saveDbPaymentProfile(session, normalized);
  }
  return saveDemoPaymentProfile(session, normalized);
}

export async function getPaymentProfileCoverage(session: SessionLike, employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return {
      configuredEmployeeIds: new Set<string>(),
      missingEmployeeIds: new Set<string>(),
    };
  }
  if (canUseDatabase(session)) {
    const profiles = await getDb().employeePaymentProfile.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: { in: employeeIds },
        status: "active",
        effectiveTo: null,
      },
      select: { employeeId: true },
    });
    const configuredEmployeeIds = new Set(profiles.map((profile) => profile.employeeId));
    return {
      configuredEmployeeIds,
      missingEmployeeIds: new Set(employeeIds.filter((employeeId) => !configuredEmployeeIds.has(employeeId))),
    };
  }
  return getDemoCoverage(employeeIds);
}

export function resetPaymentProfileDemoState() {
  globalForPaymentProfiles.hrOnePaymentProfileDemoState = {
    profiles: [],
  };
}

function getDemoState() {
  if (!globalForPaymentProfiles.hrOnePaymentProfileDemoState) {
    resetPaymentProfileDemoState();
  }
  return globalForPaymentProfiles.hrOnePaymentProfileDemoState!;
}

async function saveDbPaymentProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizePaymentProfileInput>,
) {
  const db = getDb();
  const employee = await db.employee.findFirst({
    where: {
      id: input.employeeId,
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
  });
  if (!employee) throw new Error("Employee not found for payment profile.");

  return db.$transaction(async (tx) => {
    const previous = await tx.employeePaymentProfile.findFirst({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: employee.id,
        effectiveTo: null,
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (previous && previous.effectiveFrom < input.effectiveFrom) {
      await tx.employeePaymentProfile.update({
        where: { id: previous.id },
        data: {
          effectiveTo: input.effectiveFrom,
          status: "inactive",
        },
      });
    }
    const created = await tx.employeePaymentProfile.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: employee.id,
        paymentMethod: "bank_transfer",
        bankCode: input.bankCode,
        bankBranchCode: input.bankBranchCode,
        accountName: input.accountName,
        accountNumberHash: input.accountNumberHash,
        accountNumberLast4: input.accountNumberLast4,
        effectiveFrom: input.effectiveFrom,
        createdByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "employee_payment_profile",
      entityId: created.id,
      before: previous,
      after: {
        id: created.id,
        employeeId: employee.id,
        paymentMethod: created.paymentMethod,
        bankCode: created.bankCode,
        bankBranchCode: created.bankBranchCode,
        accountName: created.accountName,
        accountNumberHash: created.accountNumberHash,
        accountNumberLast4: created.accountNumberLast4,
        effectiveFrom: created.effectiveFrom,
      },
      metadata: {
        employeeId: employee.id,
        effectiveFrom: input.effectiveFrom.toISOString().slice(0, 10),
        sensitiveValuesRedacted: true,
      },
    });
    return mapCreatedProfile(created.id, employee.employeeNo, employee.displayName, input);
  });
}

function saveDemoPaymentProfile(
  session: SessionLike,
  input: ReturnType<typeof normalizePaymentProfileInput>,
) {
  const state = getDemoState();
  const overview = getFallbackCompanyOverview();
  const employee = overview.company.employees.find((item) => item.id === input.employeeId);
  if (!employee) throw new Error("Employee not found for payment profile.");
  for (const existing of state.profiles) {
    if (existing.employeeId === employee.id && !existing.effectiveTo && existing.effectiveFrom < input.effectiveFrom) {
      existing.effectiveTo = input.effectiveFrom;
      existing.status = "inactive";
    }
  }
  const created = mapCreatedProfile(crypto.randomUUID(), employee.employeeNo, employee.displayName, input);
  state.profiles.unshift(created);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "employee_payment_profile",
    entityId: created.id,
    after: {
      employeeId: employee.id,
      paymentMethod: "bank_transfer",
      bankCode: input.bankCode,
      bankBranchCode: input.bankBranchCode,
      accountName: input.accountName,
      accountNumberHash: input.accountNumberHash,
      accountNumberLast4: input.accountNumberLast4,
      effectiveFrom: input.effectiveFrom,
    },
    metadata: {
      employeeId: employee.id,
      effectiveFrom: input.effectiveFrom.toISOString().slice(0, 10),
      sensitiveValuesRedacted: true,
    },
  });
  return created;
}

function demoWorkspace() {
  const overview = getFallbackCompanyOverview();
  const employees = overview.company.employees.map((employee) => ({
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
  }));
  return buildWorkspace(employees, getDemoState().profiles);
}

function buildWorkspace(
  employees: PaymentProfileWorkspace["employees"],
  profiles: PaymentProfileRow[],
): PaymentProfileWorkspace {
  const configured = new Set(
    profiles
      .filter((profile) => profile.status === "active" && !profile.effectiveTo)
      .map((profile) => profile.employeeId),
  );
  return {
    employees,
    profiles,
    activeCoverage: {
      totalEmployees: employees.length,
      configuredEmployees: configured.size,
      missingEmployees: employees.filter((employee) => !configured.has(employee.id)),
    },
  };
}

function getDemoCoverage(employeeIds: string[]) {
  const configuredEmployeeIds = new Set(
    getDemoState().profiles
      .filter((profile) => profile.status === "active" && !profile.effectiveTo)
      .map((profile) => profile.employeeId)
      .filter((employeeId) => employeeIds.includes(employeeId)),
  );
  return {
    configuredEmployeeIds,
    missingEmployeeIds: new Set(employeeIds.filter((employeeId) => !configuredEmployeeIds.has(employeeId))),
  };
}

function mapCreatedProfile(
  id: string,
  employeeNo: string,
  employeeName: string,
  input: ReturnType<typeof normalizePaymentProfileInput>,
): PaymentProfileRow {
  return {
    id,
    employeeId: input.employeeId,
    employeeNo,
    employeeName,
    paymentMethod: "bank_transfer",
    bankCode: input.bankCode,
    bankBranchCode: input.bankBranchCode,
    accountName: input.accountName,
    accountNumberLast4: input.accountNumberLast4,
    status: "active",
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
  };
}

function normalizePaymentProfileInput(input: PaymentProfileInput) {
  const bankCode = input.bankCode.trim();
  const bankBranchCode = input.bankBranchCode?.trim() || null;
  const accountName = input.accountName.trim();
  const accountNumber = input.accountNumber.replace(/\D/g, "");
  if (!input.employeeId) throw new Error("Employee is required.");
  if (!/^\d{3,7}$/.test(bankCode)) throw new Error("Bank code must be 3 to 7 digits.");
  if (bankBranchCode && !/^\d{3,7}$/.test(bankBranchCode)) {
    throw new Error("Branch code must be 3 to 7 digits.");
  }
  if (accountName.length < 2) throw new Error("Account name is required.");
  if (!/^\d{6,20}$/.test(accountNumber)) {
    throw new Error("Account number must be 6 to 20 digits.");
  }
  return {
    employeeId: input.employeeId,
    bankCode,
    bankBranchCode,
    accountName,
    accountNumberHash: stableHash({
      employeeId: input.employeeId,
      accountNumber,
    }),
    accountNumberLast4: accountNumber.slice(-4),
    effectiveFrom: startOfDate(input.effectiveFrom),
  };
}

function startOfDate(date: Date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
