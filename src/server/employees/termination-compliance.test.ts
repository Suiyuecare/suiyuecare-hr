import { describe, expect, it } from "vitest";
import { calculateTerminationCompliance } from "@/server/employees/termination-compliance";
import { defaultTaiwanLaborStandardsConfig } from "@/server/rules/taiwan-labor-standards";

describe("Taiwan termination compliance", () => {
  it("calculates Labor Pension Act severance and advance notice for layoff review", () => {
    const result = calculateTerminationCompliance({
      hireDate: new Date("2024-01-01T00:00:00.000Z"),
      effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
      reasonCategory: "layoff",
      pensionScheme: "labor_pension_new",
      averageMonthlyWage: 60_000,
    });

    expect(result.appliesStatutorySeverance).toBe(true);
    expect(result.requiredAdvanceNoticeDays).toBe(20);
    expect(result.severancePayMonths).toBeCloseTo(1.0014, 4);
    expect(result.severancePayEstimate).toBe(60_082);
    expect(result.requiresHumanReview).toBe(true);
    expect(result.sources.map((source) => source.id)).toEqual([
      "tw-lsa-article-16-17",
      "tw-labor-pension-act-article-12",
    ]);
  });

  it("uses configurable severance caps and does not require severance for resignation", () => {
    const config = structuredClone(defaultTaiwanLaborStandardsConfig);
    config.terminationCompliance.laborPensionSeveranceMaxAverageWageMonths = 2;

    const layoff = calculateTerminationCompliance({
      hireDate: new Date("2010-01-01T00:00:00.000Z"),
      effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
      reasonCategory: "layoff",
      pensionScheme: "labor_pension_new",
      averageMonthlyWage: 70_000,
      config,
    });
    const resignation = calculateTerminationCompliance({
      hireDate: new Date("2024-01-01T00:00:00.000Z"),
      effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
      reasonCategory: "resignation",
      pensionScheme: "labor_pension_new",
      averageMonthlyWage: 70_000,
      config,
    });

    expect(layoff.severancePayMonths).toBe(2);
    expect(layoff.severancePayEstimate).toBe(140_000);
    expect(resignation.appliesStatutorySeverance).toBe(false);
    expect(resignation.requiredAdvanceNoticeDays).toBe(0);
    expect(resignation.severancePayEstimate).toBeNull();
  });
});
