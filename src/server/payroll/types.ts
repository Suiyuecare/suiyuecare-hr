export type MoneyItem = {
  code: string;
  name: string;
  amount: number;
};

export type SalaryProfileView = {
  employeeId: string;
  employeeName: string;
  baseSalary: number;
  hourlyWage?: number | null;
  recurringAllowances: MoneyItem[];
  recurringDeductions: MoneyItem[];
  effectiveFrom: Date;
};

export type PayrollComplianceProfileView = {
  employeeId: string;
  taxResidency: "resident" | "non_resident";
  dependentCount: number;
  laborInsuranceMonthlyWage?: number | null;
  healthInsuranceMonthlyWage?: number | null;
  laborPensionMonthlyWage?: number | null;
  incomeTaxWithholdingMethod: "annualized_progressive" | "non_resident_flat";
  nonResidentWithholdingRate?: number | null;
  effectiveFrom: Date;
};

export type AnnualLeaveSettlementInput = {
  unusedDays: number;
  reason: "year_end" | "contract_termination";
  carriedFromPreviousYear?: boolean;
  dailyRegularWage?: number | null;
};

export type PayrollItemView = {
  employeeId: string;
  employeeName: string;
  kind: "earning" | "allowance" | "overtime" | "deduction" | "employer_contribution";
  code: string;
  name: string;
  amount: number;
  quantity?: number;
  ruleVersionId?: string | null;
  metadata?: Record<string, unknown>;
};

export type PayslipView = {
  id: string;
  employeeId: string;
  employeeName: string;
  periodLabel: string;
  grossPay: number;
  deductions: number;
  netPay: number;
  status: "draft" | "released";
  releasedAt?: Date | null;
  items: PayrollItemView[];
};

export type PayrollRunView = {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  status: "draft" | "calculated" | "blocked" | "confirmed" | "locked" | "released";
  attendanceComplete: boolean;
  pendingApprovalCount: number;
  exceptionCount: number;
  ruleVersionId?: string | null;
  grossTotal: number;
  deductionTotal: number;
  netTotal: number;
  employerContributionTotal?: number;
  items: PayrollItemView[];
  payslips: PayslipView[];
  auditCount: number;
};

export type PayrollCloseChecklist = {
  attendanceComplete: boolean;
  pendingApprovalCount: number;
  exceptionCount: number;
  ruleReview: {
    activeRuleVersion: string;
    payrollRuleVersionId: string | null;
    reviewStatus: "pending_legal_review" | "approved";
    requiresPayrollRecalculation: boolean;
    sourceAuthorityPassed: boolean;
    untrustedLegalSourceCount: number;
    invalidLegalSourceUrlCount: number;
    needsRecalculation: boolean;
    blocksLock: boolean;
    detail: string;
  };
  legalGate: {
    status: "ready" | "blocked";
    headline: string;
    readyCount: number;
    blockedCount: number;
    totalCount: number;
    nextAction: string;
    steps: Array<{
      id: string;
      step: string;
      title: string;
      status: "done" | "blocked" | "ready";
      metric: string;
      detail: string;
      evidence: string;
      actionLabel: string;
      actionHref: string;
    }>;
  };
  canCalculate: boolean;
  canLock: boolean;
  steps: Array<{
    step: number;
    title: string;
    status: "done" | "blocked" | "ready";
    detail: string;
  }>;
};
