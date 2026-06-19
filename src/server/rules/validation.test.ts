import { describe, expect, it } from "vitest";
import { defaultTaiwanLaborStandardsConfig } from "./taiwan-labor-standards";
import {
  evaluateLegalSourceFreshness,
  validateTaiwanLaborStandardsRuleSet,
} from "./validation";

describe("Taiwan labor rule validation", () => {
  it("validates the active Taiwan labor standards fixture set", () => {
    const summary = validateTaiwanLaborStandardsRuleSet(
      defaultTaiwanLaborStandardsConfig,
      "2026-06-13T00:00:00.000Z",
    );

    expect(summary).toMatchObject({
      passed: true,
      failedCount: 0,
      fixtureCount: 9,
      fixtureSetVersion: "tw-labor-fixtures-2026.06-v3",
    });
    expect(summary.fixtures.map((fixture) => fixture.id)).toEqual([
      "tw_minimum_wage_boundary",
      "tw_regular_day_overtime_tiers",
      "tw_rest_day_holiday_work",
      "tw_working_time_limits",
      "tw_rest_cycle",
      "tw_annual_leave_tiers",
      "tw_termination_notice_severance",
      "tw_nhi_supplementary_bonus_premium",
      "tw_statutory_filing_mappings",
    ]);
  });

  it("fails when a configured rule breaks a required Taiwan fixture", () => {
    const invalid = structuredClone(defaultTaiwanLaborStandardsConfig);
    invalid.annualLeaveTiers = invalid.annualLeaveTiers.filter((tier) => tier.serviceMonthsFrom !== 6);

    const summary = validateTaiwanLaborStandardsRuleSet(invalid);

    expect(summary.passed).toBe(false);
    expect(summary.fixtures.find((fixture) => fixture.id === "tw_annual_leave_tiers")).toMatchObject({
      passed: false,
    });
  });

  it("tracks legal source freshness against the launch review window", () => {
    const fresh = evaluateLegalSourceFreshness(defaultTaiwanLaborStandardsConfig.sources, {
      now: new Date("2026-06-19T00:00:00.000Z"),
      maxAgeDays: 180,
    });

    expect(fresh).toMatchObject({
      passed: true,
      totalSourceCount: defaultTaiwanLaborStandardsConfig.sources.length,
      staleSourceCount: 0,
      invalidSourceCount: 0,
      oldestCheckedAt: "2026-06-12",
    });

    const stale = evaluateLegalSourceFreshness(
      [
        { id: "old-source", title: "Old source", url: "https://laws.example", checkedAt: "2025-01-01" },
        { id: "bad-source", title: "Bad source", url: "https://laws.example", checkedAt: "not-a-date" },
      ],
      { now: new Date("2026-06-13T00:00:00.000Z"), maxAgeDays: 180 },
    );

    expect(stale).toMatchObject({
      passed: false,
      freshSourceCount: 0,
      staleSourceCount: 1,
      invalidSourceCount: 1,
      staleSourceIds: ["old-source"],
      invalidSourceIds: ["bad-source"],
    });
  });
});
