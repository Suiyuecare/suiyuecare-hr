export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ApprovalAction = "approve" | "reject";
type LeaveBalanceCore = {
  grantedUnits: number;
  usedUnits: number;
  pendingUnits: number;
  settledUnits?: number;
};

type LeaveBalanceWithRemaining = LeaveBalanceCore & {
  remainingUnits: number;
};

export function calculateRemainingLeave(balance: {
  grantedUnits: number;
  usedUnits: number;
  pendingUnits: number;
  settledUnits?: number;
}) {
  return roundUnits(balance.grantedUnits - balance.usedUnits - (balance.settledUnits ?? 0) - balance.pendingUnits);
}

export function reserveLeaveUnits(
  balance: LeaveBalanceCore,
  requestUnits: number,
):
  | { ok: false; reason: string; balance: LeaveBalanceCore }
  | { ok: true; reason: null; balance: LeaveBalanceWithRemaining } {
  const remaining = calculateRemainingLeave(balance);
  if (requestUnits <= 0) {
    return {
      ok: false,
      reason: "Leave units must be greater than zero.",
      balance,
    };
  }

  if (requestUnits > remaining) {
    return {
      ok: false,
      reason: "Requested leave exceeds remaining balance.",
      balance,
    };
  }

  const next = {
    ...balance,
    pendingUnits: roundUnits(balance.pendingUnits + requestUnits),
  };

  return {
    ok: true,
    reason: null,
    balance: {
      ...next,
      remainingUnits: calculateRemainingLeave(next),
    },
  };
}

export function settleLeaveUnits(
  balance: {
    grantedUnits: number;
    usedUnits: number;
    pendingUnits: number;
    settledUnits?: number;
    carryoverUnits?: number;
    carryoverUsedUnits?: number;
    currentYearUnits?: number;
    currentYearUsedUnits?: number;
  },
  requestUnits: number,
  action: ApprovalAction,
) {
  const pendingUnits = Math.max(0, balance.pendingUnits - requestUnits);
  const allocation = action === "approve" ? allocateLeaveUsage(balance, requestUnits) : {
    carryoverUsedUnits: balance.carryoverUsedUnits ?? 0,
    currentYearUsedUnits: balance.currentYearUsedUnits ?? balance.usedUnits,
    carryoverAppliedUnits: 0,
    currentYearAppliedUnits: 0,
  };
  const usedUnits =
    action === "approve"
      ? roundUnits(balance.usedUnits + requestUnits)
      : balance.usedUnits;
  const next = {
    grantedUnits: balance.grantedUnits,
    usedUnits,
    pendingUnits: roundUnits(pendingUnits),
    settledUnits: balance.settledUnits ?? 0,
  };

  return {
    ...next,
    carryoverUsedUnits: allocation.carryoverUsedUnits,
    currentYearUsedUnits: allocation.currentYearUsedUnits,
    carryoverAppliedUnits: allocation.carryoverAppliedUnits,
    currentYearAppliedUnits: allocation.currentYearAppliedUnits,
    remainingUnits: calculateRemainingLeave(next),
  };
}

export function allocateLeaveUsage(
  balance: {
    usedUnits: number;
    carryoverUnits?: number;
    carryoverUsedUnits?: number;
    currentYearUnits?: number;
    currentYearUsedUnits?: number;
  },
  requestUnits: number,
) {
  const carryoverAvailable = Math.max(
    0,
    roundUnits((balance.carryoverUnits ?? 0) - (balance.carryoverUsedUnits ?? 0)),
  );
  const carryoverAppliedUnits = Math.min(carryoverAvailable, requestUnits);
  const currentYearAppliedUnits = roundUnits(requestUnits - carryoverAppliedUnits);
  return {
    carryoverAppliedUnits: roundUnits(carryoverAppliedUnits),
    currentYearAppliedUnits,
    carryoverUsedUnits: roundUnits((balance.carryoverUsedUnits ?? 0) + carryoverAppliedUnits),
    currentYearUsedUnits: roundUnits((balance.currentYearUsedUnits ?? balance.usedUnits) + currentYearAppliedUnits),
  };
}

export function hasShiftConflict(
  requestStart: Date,
  requestEnd: Date,
  schedule?: { scheduledStart: Date; scheduledEnd: Date } | null,
) {
  if (!schedule) {
    return "No shift is assigned for the selected day.";
  }

  if (requestEnd <= schedule.scheduledStart || requestStart >= schedule.scheduledEnd) {
    return "Leave request does not overlap the assigned shift.";
  }

  return null;
}

export function overtimeMinutes(startAt: Date, endAt: Date) {
  return Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60_000));
}

export function overtimeThresholdWarning(input: {
  regularMinutes: number;
  overtimeMinutes: number;
  thresholdMinutes: number;
}) {
  const total = input.regularMinutes + input.overtimeMinutes;
  if (total > input.thresholdMinutes) {
    const thresholdHours = roundUnits(input.thresholdMinutes / 60);
    const totalHours = roundUnits(total / 60);
    return `Daily total would be ${totalHours} hours, above configured ${thresholdHours} hour threshold.`;
  }

  return null;
}

export function nextApprovalStatus(current: ApprovalStatus, action: ApprovalAction) {
  if (current !== "pending") {
    throw new Error("Only pending approvals can be decided.");
  }

  return action === "approve" ? "approved" : "rejected";
}

export function roundUnits(value: number) {
  return Math.round(value * 100) / 100;
}
