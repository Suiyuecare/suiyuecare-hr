import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPayrollAccountingSettings } from "./accounting-settings";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";
import type { PayrollRunView } from "./types";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

const lockedRun: PayrollRunView = {
  id: "payroll-run-1",
  periodStart: new Date("2026-06-01T00:00:00.000Z"),
  periodEnd: new Date("2026-06-30T00:00:00.000Z"),
  payDate: new Date("2026-07-05T00:00:00.000Z"),
  status: "locked",
  attendanceComplete: true,
  pendingApprovalCount: 0,
  exceptionCount: 0,
  grossTotal: 60_000,
  deductionTotal: 3_000,
  netTotal: 57_000,
  employerContributionTotal: 3_600,
  items: [
    {
      employeeId: "employee-1",
      employeeName: "Employee One",
      kind: "earning",
      code: "base_salary",
      name: "Base salary",
      amount: 60_000,
      ruleVersionId: "2026.01-official-v1",
    },
  ],
  payslips: [],
  auditCount: 0,
};

describe("payroll export persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
    vi.doUnmock("./service");
    vi.doUnmock("./payment-profiles");
    vi.doUnmock("./payment-security");
    vi.doUnmock("./accounting-settings");
    vi.doUnmock("@/server/rules/settings");
  });

  it("does not fall back to demo exports when database mode fails", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";

    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database export write failed");
        }),
      }),
    }));
    vi.doMock("./service", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./service")>()),
      getPayrollDashboard: vi.fn(async () => ({
        run: lockedRun,
        checklist: {
          attendanceComplete: true,
          pendingApprovalCount: 0,
          exceptionCount: 0,
          ruleReview: {
            activeRuleVersion: "2026.01-official-v1",
            payrollRuleVersionId: "2026.01-official-v1",
            reviewStatus: "approved",
            requiresPayrollRecalculation: false,
            needsRecalculation: false,
            blocksLock: false,
            detail: "ready",
          },
          canCalculate: true,
          canLock: true,
          steps: [],
        },
      })),
    }));
    vi.doMock("./payment-profiles", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./payment-profiles")>()),
      getPaymentProfileCoverage: vi.fn(async () => ({
        configuredEmployeeIds: new Set(["employee-1"]),
        missingEmployeeIds: new Set<string>(),
      })),
    }));
    vi.doMock("./payment-security", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./payment-security")>()),
      getPayrollPaymentSecurityReadiness: vi.fn(async () => ({
        ready: true,
        detail: "verified",
        settings: {
          tokenVaultProvider: "aws_secrets_manager",
          tokenVaultRef: "vault://customer/payroll-payment",
          kmsKeyRef: "alias/customer-payroll-payment",
          bankFileFormat: "customer_bank_csv",
          bankFormatVersion: "v2",
          bankFileColumnOrder: ["employee_no", "account_token_ref", "amount"],
          bankFormatVerified: true,
          verificationStatus: "verified",
          lastVerifiedAt: new Date("2026-06-14T00:00:00.000Z"),
          verificationNote: null,
        },
      })),
    }));
    vi.doMock("./accounting-settings", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./accounting-settings")>()),
      getPayrollAccountingSettings: vi.fn(async () => defaultPayrollAccountingSettings),
    }));
    vi.doMock("@/server/rules/settings", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/server/rules/settings")>()),
      getTaiwanLaborStandardsConfig: vi.fn(async () => defaultTaiwanLaborStandardsConfig),
    }));

    const { generatePayrollExport, getPayrollExportWorkspace } = await import("./exports");

    await expect(generatePayrollExport(hrSession, "bank_transfer")).rejects.toThrow(
      "database export write failed",
    );
    await expect(getPayrollExportWorkspace(hrSession)).rejects.toThrow();
  });
});
