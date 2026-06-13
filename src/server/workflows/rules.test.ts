import { describe, expect, it } from "vitest";
import {
  allocateLeaveUsage,
  nextApprovalStatus,
  overtimeThresholdWarning,
  reserveLeaveUnits,
  settleLeaveUnits,
} from "./rules";

describe("leave balance rules", () => {
  it("reserves pending leave and reduces remaining balance", () => {
    const result = reserveLeaveUnits(
      {
        grantedUnits: 14,
        usedUnits: 2,
        pendingUnits: 0,
      },
      1,
    );

    expect(result.ok).toBe(true);
    expect(result.balance).toMatchObject({
      pendingUnits: 1,
      remainingUnits: 11,
    });
  });

  it("settles approved leave into used units", () => {
    expect(
      settleLeaveUnits(
        {
          grantedUnits: 14,
          usedUnits: 2,
          pendingUnits: 1,
        },
        1,
        "approve",
      ),
    ).toMatchObject({
      usedUnits: 3,
      pendingUnits: 0,
      remainingUnits: 11,
    });
  });

  it("applies carried-over annual leave before current-year leave", () => {
    const allocation = allocateLeaveUsage(
      {
        usedUnits: 2,
        carryoverUnits: 2.5,
        carryoverUsedUnits: 1,
        currentYearUnits: 11.5,
        currentYearUsedUnits: 2,
      },
      2,
    );

    expect(allocation).toEqual({
      carryoverAppliedUnits: 1.5,
      currentYearAppliedUnits: 0.5,
      carryoverUsedUnits: 2.5,
      currentYearUsedUnits: 2.5,
    });
  });
});

describe("overtime threshold rules", () => {
  it("warns when total daily work exceeds threshold", () => {
    expect(
      overtimeThresholdWarning({
        regularMinutes: 540,
        overtimeMinutes: 210,
        thresholdMinutes: 720,
      }),
    ).toContain("above configured");
  });

  it("does not warn below threshold", () => {
    expect(
      overtimeThresholdWarning({
        regularMinutes: 540,
        overtimeMinutes: 90,
        thresholdMinutes: 720,
      }),
    ).toBeNull();
  });
});

describe("approval transitions", () => {
  it("moves pending approval to approved or rejected", () => {
    expect(nextApprovalStatus("pending", "approve")).toBe("approved");
    expect(nextApprovalStatus("pending", "reject")).toBe("rejected");
  });

  it("rejects repeated decisions", () => {
    expect(() => nextApprovalStatus("approved", "approve")).toThrow(
      "Only pending approvals can be decided.",
    );
  });
});
