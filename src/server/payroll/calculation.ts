import type {
  AnnualLeaveSettlementInput,
  MoneyItem,
  PayrollComplianceProfileView,
  PayrollItemView,
  SalaryProfileView,
} from "./types";
import {
  calculateTaiwanStatutoryPayroll,
  calculateRegularDayOvertimePay,
  calculateUnusedAnnualLeavePayout,
  defaultTaiwanLaborStandardsConfig,
  validateMinimumWage,
  type TaiwanLaborStandardsConfig,
} from "@/server/rules/taiwan-labor-standards";
import type { PayrollCloseChecklist } from "./types";

export type PayrollRuleConfig = {
  overtimeMultiplier: number;
  standardMonthlyHours: number;
  ruleVersionId?: string | null;
  taiwanLaborStandards?: TaiwanLaborStandardsConfig;
};

export type EmployeePayrollInput = {
  salaryProfile: SalaryProfileView;
  complianceProfile?: PayrollComplianceProfileView | null;
  approvedOvertimeMinutes: number;
  annualLeaveSettlements?: AnnualLeaveSettlementInput[];
  dependentCount?: number;
  rule: PayrollRuleConfig;
};

export function calculateEmployeePayroll(input: EmployeePayrollInput) {
  const profile = input.salaryProfile;
  const laborConfig = input.rule.taiwanLaborStandards ?? defaultTaiwanLaborStandardsConfig;
  const minimumWage = validateMinimumWage({
    monthlyWage: profile.baseSalary,
    hourlyWage: profile.hourlyWage,
    config: laborConfig,
  });
  if (!minimumWage.passed) {
    throw new Error(`Salary profile failed TW minimum wage validation: ${minimumWage.issues.join(" ")}`);
  }
  const hourlyWage =
    profile.hourlyWage ??
    roundMoney(profile.baseSalary / (input.rule.standardMonthlyHours || laborConfig.payrollStandardMonthlyHours));
  const overtime = calculateRegularDayOvertimePay({
    hourlyWage,
    overtimeMinutes: input.approvedOvertimeMinutes,
    config: laborConfig,
  });
  const overtimePay = overtime.total;
  const allowanceTotal = sumItems(profile.recurringAllowances);
  const annualLeavePayouts = (input.annualLeaveSettlements ?? []).map((settlement) =>
    calculateUnusedAnnualLeavePayout({
      ...settlement,
      monthlyRegularWage: profile.baseSalary,
      config: laborConfig,
    }),
  );
  const annualLeavePayoutTotal = roundMoney(
    annualLeavePayouts.reduce((total, payout) => total + payout.amount, 0),
  );
  const statutory = calculateTaiwanStatutoryPayroll({
    monthlyWage: profile.baseSalary + allowanceTotal + annualLeavePayoutTotal,
    dependents: input.complianceProfile?.dependentCount ?? input.dependentCount,
    taxResidency: input.complianceProfile?.taxResidency,
    laborInsuranceMonthlyWage: input.complianceProfile?.laborInsuranceMonthlyWage,
    healthInsuranceMonthlyWage: input.complianceProfile?.healthInsuranceMonthlyWage,
    laborPensionMonthlyWage: input.complianceProfile?.laborPensionMonthlyWage,
    nonResidentWithholdingRate: input.complianceProfile?.nonResidentWithholdingRate,
    config: laborConfig,
  });
  const recurringDeductionTotal = sumItems(profile.recurringDeductions);
  const statutoryDeductionTotal = sumItems(statutory.employeeDeductions);
  const employerContributionTotal = sumItems(statutory.employerContributions);
  const deductionTotal = roundMoney(recurringDeductionTotal + statutoryDeductionTotal);
  const grossPay = roundMoney(profile.baseSalary + allowanceTotal + overtimePay + annualLeavePayoutTotal);
  const netPay = roundMoney(grossPay - deductionTotal);

  const items: PayrollItemView[] = [
    {
      employeeId: profile.employeeId,
      employeeName: profile.employeeName,
      kind: "earning",
      code: "base_salary",
      name: "Base salary",
      amount: profile.baseSalary,
      ruleVersionId: input.rule.ruleVersionId,
    },
    ...profile.recurringAllowances.map((item) => ({
      employeeId: profile.employeeId,
      employeeName: profile.employeeName,
      kind: "allowance" as const,
      code: item.code,
      name: item.name,
      amount: roundMoney(item.amount),
      ruleVersionId: input.rule.ruleVersionId,
    })),
    {
      employeeId: profile.employeeId,
      employeeName: profile.employeeName,
      kind: "overtime",
      code: "approved_overtime",
      name: "Approved overtime",
      amount: overtimePay,
      quantity: input.approvedOvertimeMinutes,
      ruleVersionId: input.rule.ruleVersionId,
      metadata: {
        buckets: overtime.buckets,
        sources: overtime.sources,
      },
    },
    ...annualLeavePayouts.map((payout) => ({
      employeeId: profile.employeeId,
      employeeName: profile.employeeName,
      kind: "allowance" as const,
      code: "unused_annual_leave_payout",
      name: payout.reason === "contract_termination"
        ? "Unused annual leave payout at termination"
        : "Unused annual leave payout at year end",
      amount: payout.amount,
      quantity: payout.unusedDays,
      ruleVersionId: input.rule.ruleVersionId,
      metadata: {
        dailyWage: payout.dailyWage,
        reason: payout.reason,
        carriedFromPreviousYear: payout.carriedFromPreviousYear,
        sources: payout.sources,
      },
    })),
    ...profile.recurringDeductions.map((item) => ({
      employeeId: profile.employeeId,
      employeeName: profile.employeeName,
      kind: "deduction" as const,
      code: item.code,
      name: item.name,
      amount: roundMoney(item.amount),
      ruleVersionId: input.rule.ruleVersionId,
    })),
    ...statutory.employeeDeductions.map((item) => ({
      employeeId: profile.employeeId,
      employeeName: profile.employeeName,
      kind: "deduction" as const,
      code: item.code,
      name: item.name,
      amount: roundMoney(item.amount),
      ruleVersionId: input.rule.ruleVersionId,
      metadata: {
        ...(item.metadata ?? {}),
        sources: statutory.sources,
      },
    })),
    ...statutory.employerContributions.map((item) => ({
      employeeId: profile.employeeId,
      employeeName: profile.employeeName,
      kind: "employer_contribution" as const,
      code: item.code,
      name: item.name,
      amount: roundMoney(item.amount),
      ruleVersionId: input.rule.ruleVersionId,
      metadata: {
        ...(item.metadata ?? {}),
        affectsNetPay: false,
        sources: statutory.sources,
      },
    })),
  ];

  return {
    grossPay,
    deductionTotal,
    netPay,
    employerContributionTotal,
    items,
  };
}

export function canLockPayroll(input: {
  attendanceComplete: boolean;
  pendingApprovalCount: number;
  exceptionCount: number;
  status: string;
  ruleReviewPassed?: boolean;
}) {
  return (
    input.attendanceComplete &&
    input.pendingApprovalCount === 0 &&
    input.exceptionCount === 0 &&
    input.ruleReviewPassed !== false &&
    (input.status === "calculated" || input.status === "confirmed")
  );
}

export function evaluatePayrollRuleReview(input: {
  payrollRuleVersionId?: string | null;
  laborConfig: TaiwanLaborStandardsConfig;
}): PayrollCloseChecklist["ruleReview"] {
  const activeRuleVersion = input.laborConfig.version;
  const payrollRuleVersionId = input.payrollRuleVersionId ?? null;
  const requiresPayrollRecalculation = input.laborConfig.changeControl.requiresPayrollRecalculation;
  const needsRecalculation =
    requiresPayrollRecalculation &&
    Boolean(payrollRuleVersionId) &&
    payrollRuleVersionId !== activeRuleVersion;
  const pendingLegalReview = input.laborConfig.changeControl.reviewStatus !== "approved";
  const blocksLock = needsRecalculation || pendingLegalReview;
  const detail = pendingLegalReview
    ? "Active law rule version is still pending legal review."
    : needsRecalculation
      ? "Active law rule version changed after this payroll draft. Recalculate before lock."
      : payrollRuleVersionId
        ? "Payroll draft uses the active reviewed rule version."
        : "No payroll calculation has selected a rule version yet.";

  return {
    activeRuleVersion,
    payrollRuleVersionId,
    reviewStatus: input.laborConfig.changeControl.reviewStatus,
    requiresPayrollRecalculation,
    needsRecalculation,
    blocksLock,
    detail,
  };
}

export function closeChecklist(input: {
  attendanceComplete: boolean;
  pendingApprovalCount: number;
  exceptionCount: number;
  calculated: boolean;
  exceptionsReviewed: boolean;
  confirmed: boolean;
  locked: boolean;
  released: boolean;
  ruleReview?: PayrollCloseChecklist["ruleReview"];
}) {
  const ruleReview = input.ruleReview ?? evaluatePayrollRuleReview({
    payrollRuleVersionId: null,
    laborConfig: defaultTaiwanLaborStandardsConfig,
  });
  const operationalBlockerCount =
    (input.attendanceComplete ? 0 : 1) +
    input.pendingApprovalCount +
    input.exceptionCount;
  const lockBlockerCount = operationalBlockerCount + (ruleReview.blocksLock ? 1 : 0);
  return {
    ruleReview,
    canCalculate:
      input.attendanceComplete &&
      input.pendingApprovalCount === 0 &&
      input.exceptionCount === 0,
    canLock:
      lockBlockerCount === 0 &&
      input.calculated &&
      input.exceptionsReviewed &&
      input.confirmed,
    steps: [
      {
        step: 1,
        title: "Attendance completeness check",
        status: input.attendanceComplete ? "done" : "blocked",
        detail: input.attendanceComplete ? "Attendance is complete." : "Missing punches must be resolved.",
      },
      {
        step: 2,
        title: "Pending approvals check",
        status: input.pendingApprovalCount === 0 ? "done" : "blocked",
        detail: `${input.pendingApprovalCount} pending approval(s).`,
      },
      {
        step: 3,
        title: "Payroll calculation draft",
        status: input.calculated && !ruleReview.needsRecalculation
          ? "done"
          : operationalBlockerCount === 0 ? "ready" : "blocked",
        detail: ruleReview.needsRecalculation
          ? ruleReview.detail
          : input.calculated ? "Draft calculated." : "Calculate after blockers are clear.",
      },
      {
        step: 4,
        title: "Exception review",
        status: input.exceptionsReviewed ? "done" : input.exceptionCount === 0 ? "ready" : "blocked",
        detail: `${input.exceptionCount} payroll exception(s).`,
      },
      {
        step: 5,
        title: "HR confirmation",
        status: input.confirmed && !ruleReview.blocksLock ? "done" : input.calculated && !ruleReview.blocksLock ? "ready" : "blocked",
        detail: ruleReview.blocksLock ? ruleReview.detail : input.confirmed ? "HR confirmed payroll draft." : "HR confirmation required.",
      },
      {
        step: 6,
        title: "Payroll lock",
        status: input.locked ? "done" : ruleReview.blocksLock ? "blocked" : "ready",
        detail: input.locked ? "Payroll is locked." : ruleReview.blocksLock ? ruleReview.detail : "Lock prevents silent mutation.",
      },
      {
        step: 7,
        title: "Payslip generation",
        status: input.released ? "done" : input.locked ? "ready" : "blocked",
        detail: input.released ? "Payslips released." : "Release after lock.",
      },
    ] as const,
  };
}

function sumItems(items: MoneyItem[]) {
  return roundMoney(items.reduce((total, item) => total + item.amount, 0));
}

export function roundMoney(value: number) {
  return Math.round(value);
}
