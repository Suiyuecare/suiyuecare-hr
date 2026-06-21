import {
  calculateEmployeePayroll,
  canLockPayroll,
  closeChecklist,
  evaluatePayrollRuleReview,
  type PayrollRuleConfig,
} from "./calculation";
import {
  applyDemoAnnualLeaveSettlementBalancesForPayrollLock,
  getDemoAnnualLeaveSettlementsForPayroll,
  markDemoAnnualLeaveSettlementsIncluded,
} from "@/server/leave/annual-leave-settlement-demo-store";
import { getActiveTaiwanLaborStandardsConfig } from "@/server/rules/settings";
import type {
  PayrollComplianceProfileView,
  PayrollCloseChecklist,
  PayrollItemView,
  PayrollRunView,
  PayslipView,
  SalaryProfileView,
} from "./types";

type PayrollDemoState = {
  run: PayrollRunView | null;
  exceptionsReviewed: boolean;
  confirmed: boolean;
  auditCount: number;
};

const globalForPayroll = globalThis as unknown as {
  hrOnePayrollDemoState?: PayrollDemoState;
};

const salaryProfiles: SalaryProfileView[] = [
  profile("demo-hr-employee", "林人資", 62000, 2500, 1200),
  profile("demo-manager-employee", "陳主管", 78000, 3000, 1800),
  profile("demo-employee-1", "張小安", 56000, 2000, 1000),
  profile("demo-employee-2", "李小真", 54000, 2000, 1000),
  profile("demo-employee-3", "黃小宇", 58000, 2000, 1000),
];

const complianceProfiles: PayrollComplianceProfileView[] = [
  compliance("demo-hr-employee", "resident", 0),
  compliance("demo-manager-employee", "resident", 2, {
    healthInsuranceMonthlyWage: 80200,
  }),
  compliance("demo-employee-1", "resident", 1),
  compliance("demo-employee-2", "resident", 0),
  compliance("demo-employee-3", "non_resident", 0, {
    nonResidentWithholdingRate: 0.18,
  }),
];

export function getPayrollDemoState() {
  if (!globalForPayroll.hrOnePayrollDemoState) {
    globalForPayroll.hrOnePayrollDemoState = {
      run: null,
      exceptionsReviewed: false,
      confirmed: false,
      auditCount: 0,
    };
  }
  return globalForPayroll.hrOnePayrollDemoState;
}

export function resetPayrollDemoState() {
  globalForPayroll.hrOnePayrollDemoState = {
    run: null,
    exceptionsReviewed: false,
    confirmed: false,
    auditCount: 0,
  };
}

export function getDemoPayrollRun() {
  return getPayrollDemoState().run;
}

export function getDemoPayrollChecklist(): PayrollCloseChecklist {
  const state = getPayrollDemoState();
  const run = state.run;
  const base = {
    attendanceComplete: Boolean(run?.attendanceComplete),
    pendingApprovalCount: run?.pendingApprovalCount ?? 0,
    exceptionCount: run?.exceptionCount ?? 0,
    calculated: Boolean(run && run.items.length > 0),
    exceptionsReviewed: state.exceptionsReviewed,
    confirmed: state.confirmed,
    locked: run?.status === "locked" || run?.status === "released",
    released: run?.status === "released",
    ruleReview: evaluatePayrollRuleReview({
      payrollRuleVersionId: run?.ruleVersionId ?? null,
      laborConfig: getActiveTaiwanLaborStandardsConfig(),
    }),
  };
  const checklist = closeChecklist(base);
  return {
    attendanceComplete: base.attendanceComplete,
    pendingApprovalCount: base.pendingApprovalCount,
    exceptionCount: base.exceptionCount,
    canCalculate: checklist.canCalculate,
    canLock: checklist.canLock,
    ruleReview: checklist.ruleReview,
    legalGate: checklist.legalGate,
    steps: [...checklist.steps],
  };
}

export function createDemoPayrollRun() {
  const state = getPayrollDemoState();
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const payDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  state.run = {
    id: "demo-payroll-run",
    periodStart,
    periodEnd,
    payDate,
    status: "blocked",
    attendanceComplete: false,
    pendingApprovalCount: 1,
    exceptionCount: 1,
    ruleVersionId: getActiveTaiwanLaborStandardsConfig().version,
    grossTotal: 0,
    deductionTotal: 0,
    netTotal: 0,
    items: [],
    payslips: [],
    auditCount: state.auditCount + 1,
  };
  state.exceptionsReviewed = false;
  state.confirmed = false;
  state.auditCount += 1;
  return state.run;
}

export function resolveDemoPayrollBlockers() {
  const run = ensureRun();
  run.attendanceComplete = true;
  run.pendingApprovalCount = 0;
  run.exceptionCount = 0;
  run.status = "draft";
}

export function calculateDemoPayrollRun() {
  const run = ensureRun();
  if (!run.attendanceComplete || run.pendingApprovalCount > 0 || run.exceptionCount > 0) {
    run.status = "blocked";
    return run;
  }

  const laborConfig = getActiveTaiwanLaborStandardsConfig();
  const rule: PayrollRuleConfig = {
    overtimeMultiplier: 4 / 3,
    standardMonthlyHours: laborConfig.payrollStandardMonthlyHours,
    ruleVersionId: laborConfig.version,
    taiwanLaborStandards: laborConfig,
  };
  const results = salaryProfiles.map((profileItem) =>
    calculateEmployeePayroll({
      salaryProfile: profileItem,
      complianceProfile: complianceProfiles.find((item) => item.employeeId === profileItem.employeeId) ?? null,
      approvedOvertimeMinutes: profileItem.employeeId === "demo-employee-1" ? 90 : 0,
      annualLeaveSettlements: getDemoAnnualLeaveSettlementsForPayroll(run.id).get(profileItem.employeeId) ?? [],
      rule,
    }),
  );
  const items = results.flatMap((result) => result.items);
  run.items = items;
  run.grossTotal = sumBy(results, "grossPay");
  run.deductionTotal = sumBy(results, "deductionTotal");
  run.netTotal = sumBy(results, "netPay");
  run.employerContributionTotal = sumBy(results, "employerContributionTotal");
  run.ruleVersionId = laborConfig.version;
  run.status = "calculated";
  markDemoAnnualLeaveSettlementsIncluded(run.id);
  getPayrollDemoState().auditCount += 1;
  run.auditCount = getPayrollDemoState().auditCount;
  return run;
}

export function confirmDemoPayrollRun() {
  const state = getPayrollDemoState();
  const run = ensureRun();
  state.exceptionsReviewed = true;
  state.confirmed = true;
  run.status = "confirmed";
  state.auditCount += 1;
  run.auditCount = state.auditCount;
}

export function lockDemoPayrollRun() {
  const state = getPayrollDemoState();
  const run = ensureRun();
  if (
    !canLockPayroll({
      attendanceComplete: run.attendanceComplete,
      pendingApprovalCount: run.pendingApprovalCount,
      exceptionCount: run.exceptionCount,
      status: run.status,
      ruleReviewPassed: !evaluatePayrollRuleReview({
        payrollRuleVersionId: run.ruleVersionId,
        laborConfig: getActiveTaiwanLaborStandardsConfig(),
      }).blocksLock,
    }) ||
    !state.confirmed
  ) {
    throw new Error("Payroll cannot be locked until blockers are cleared and HR confirms.");
  }
  applyDemoAnnualLeaveSettlementBalancesForPayrollLock(run.id);
  run.status = "locked";
  state.auditCount += 1;
  run.auditCount = state.auditCount;
}

export function releaseDemoPayslips() {
  const state = getPayrollDemoState();
  const run = ensureRun();
  if (run.status !== "locked" && run.status !== "released") {
    throw new Error("Payslips can only be released after payroll lock.");
  }
  run.status = "released";
  run.payslips = salaryProfiles.map((salaryProfile) =>
    buildPayslip(run, salaryProfile, run.items.filter((item) => item.employeeId === salaryProfile.employeeId)),
  );
  state.auditCount += 1;
  run.auditCount = state.auditCount;
}

export function getDemoEmployeePayslip(employeeId: string | null | undefined) {
  const run = getPayrollDemoState().run;
  if (!run || run.status !== "released") {
    return null;
  }

  return run.payslips.find((payslip) => payslip.employeeId === employeeId) ?? null;
}

function ensureRun() {
  const state = getPayrollDemoState();
  if (!state.run) {
    return createDemoPayrollRun();
  }
  return state.run;
}

function buildPayslip(
  run: PayrollRunView,
  salaryProfile: SalaryProfileView,
  items: PayrollItemView[],
): PayslipView {
  const grossPay = items
    .filter((item) => item.kind === "earning" || item.kind === "allowance" || item.kind === "overtime")
    .reduce((total, item) => total + item.amount, 0);
  const deductions = items
    .filter((item) => item.kind === "deduction")
    .reduce((total, item) => total + item.amount, 0);
  return {
    id: `payslip-${salaryProfile.employeeId}`,
    employeeId: salaryProfile.employeeId,
    employeeName: salaryProfile.employeeName,
    periodLabel: `${run.periodStart.getFullYear()}-${String(run.periodStart.getMonth() + 1).padStart(2, "0")}`,
    grossPay,
    deductions,
    netPay: grossPay - deductions,
    status: "released",
    releasedAt: new Date(),
    items,
  };
}

function profile(
  employeeId: string,
  employeeName: string,
  baseSalary: number,
  allowance: number,
  deduction: number,
): SalaryProfileView {
  return {
    employeeId,
    employeeName,
    baseSalary,
    recurringAllowances: [{ code: "meal", name: "Meal allowance", amount: allowance }],
    recurringDeductions: [{ code: "welfare", name: "Welfare deduction", amount: deduction }],
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function compliance(
  employeeId: string,
  taxResidency: PayrollComplianceProfileView["taxResidency"],
  dependentCount: number,
  overrides: Partial<PayrollComplianceProfileView> = {},
): PayrollComplianceProfileView {
  return {
    employeeId,
    taxResidency,
    dependentCount,
    incomeTaxWithholdingMethod:
      taxResidency === "non_resident" ? "non_resident_flat" : "annualized_progressive",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function sumBy(
  results: Array<{
    grossPay: number;
    deductionTotal: number;
    netPay: number;
    employerContributionTotal: number;
  }>,
  key: "grossPay" | "deductionTotal" | "netPay" | "employerContributionTotal",
) {
  return results.reduce((total, result) => total + result[key], 0);
}
