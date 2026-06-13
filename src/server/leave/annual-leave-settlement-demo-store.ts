import type { AnnualLeaveSettlementInput } from "@/server/payroll/types";
import { settleDemoAnnualLeaveBalance } from "@/server/workflows/demo-store";
import type { AnnualLeaveSettlementView } from "./annual-leave-settlements";

type AnnualLeaveSettlementDemoState = {
  settlements: AnnualLeaveSettlementView[];
  auditCount: number;
};

const globalForAnnualLeaveSettlements = globalThis as unknown as {
  hrOneAnnualLeaveSettlementDemoState?: AnnualLeaveSettlementDemoState;
};

export function resetAnnualLeaveSettlementDemoState() {
  globalForAnnualLeaveSettlements.hrOneAnnualLeaveSettlementDemoState = {
    settlements: [],
    auditCount: 0,
  };
}

export function getAnnualLeaveSettlementDemoState() {
  if (!globalForAnnualLeaveSettlements.hrOneAnnualLeaveSettlementDemoState) {
    resetAnnualLeaveSettlementDemoState();
  }
  return globalForAnnualLeaveSettlements.hrOneAnnualLeaveSettlementDemoState!;
}

export function getDemoAnnualLeaveSettlementsForPayroll(payrollRunId: string) {
  return groupSettlementInputs(
    getAnnualLeaveSettlementDemoState().settlements
      .filter((settlement) => settlement.payrollRunId === payrollRunId && settlement.status !== "voided")
      .map((settlement) => ({
        employeeId: settlement.employeeId,
        unusedDays: settlement.unusedUnits,
        reason: settlement.reason,
        carriedFromPreviousYear: settlement.carriedFromPreviousYear,
        dailyRegularWage: settlement.dailyRegularWage,
      })),
  );
}

export function markDemoAnnualLeaveSettlementsIncluded(payrollRunId: string) {
  const state = getAnnualLeaveSettlementDemoState();
  state.settlements = state.settlements.map((settlement) =>
    settlement.payrollRunId === payrollRunId && settlement.status === "draft"
      ? { ...settlement, status: "included" }
      : settlement,
  );
}

export function applyDemoAnnualLeaveSettlementBalancesForPayrollLock(payrollRunId: string) {
  const state = getAnnualLeaveSettlementDemoState();
  const employeeAnnualSettlementUnits = state.settlements
    .filter(
      (settlement) =>
        settlement.payrollRunId === payrollRunId &&
        settlement.status === "included" &&
        settlement.employeeId === "demo-employee-1",
    )
    .reduce((total, settlement) => total + settlement.unusedUnits, 0);
  if (employeeAnnualSettlementUnits > 0) {
    settleDemoAnnualLeaveBalance(employeeAnnualSettlementUnits);
  }
}

function groupSettlementInputs(
  rows: Array<AnnualLeaveSettlementInput & { employeeId: string }>,
) {
  const map = new Map<string, AnnualLeaveSettlementInput[]>();
  for (const row of rows) {
    const { employeeId, ...settlement } = row;
    map.set(employeeId, [...(map.get(employeeId) ?? []), settlement]);
  }
  return map;
}
