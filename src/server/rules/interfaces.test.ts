import { describe, expect, it } from "vitest";
import { defaultTaiwanLaborStandardsConfig } from "./taiwan-labor-standards";
import { createTaiwanLaborRuleEngine, type RuleContext } from "./interfaces";

const baseContext = {
  tenantId: "tenant_1",
  companyId: "company_1",
  ruleVersionId: "rule_version_1",
  effectiveAt: new Date("2026-06-12T00:00:00.000Z"),
} satisfies Omit<RuleContext, "ruleKey">;

describe("RuleRegistryEngine", () => {
  it("evaluates Taiwan minimum wage rules with configured thresholds and source references", async () => {
    const config = structuredClone(defaultTaiwanLaborStandardsConfig);
    config.minimumHourlyWage = 210;
    const engine = createTaiwanLaborRuleEngine(config);

    const result = await engine.evaluate(
      {
        ...baseContext,
        ruleKey: "tw.minimum_wage",
      },
      {
        hourlyWage: 209,
      },
    );

    expect(result).toMatchObject({
      ruleVersionId: "rule_version_1",
      ruleKey: "tw.minimum_wage",
      passed: false,
      result: {
        minimumHourlyWage: 210,
      },
    });
    expect(result.explanation).toContain("below configured TW minimum wage 210");
    expect(result.sourceIds).toContain("tw-minimum-wage-2026");
  });

  it("evaluates working-time rules against configurable daily and monthly limits", async () => {
    const engine = createTaiwanLaborRuleEngine();

    const result = await engine.evaluate(
      {
        ...baseContext,
        ruleKey: "tw.working_time",
      },
      {
        regularMinutes: 480,
        overtimeMinutes: 300,
        weeklyRegularMinutes: 2_401,
        monthlyOvertimeMinutes: 2_761,
        laborManagementAgreement: false,
      },
    );

    expect(result.passed).toBe(false);
    expect(result.explanation).toContain("Daily work including overtime exceeds configured 12 hours");
    expect(result.explanation).toContain("Regular weekly work exceeds configured 40 hours");
    expect(result.explanation).toContain("Monthly overtime exceeds configured 46 hours");
    expect(result.sourceIds).toEqual(expect.arrayContaining([
      "tw-lsa-article-30",
      "tw-lsa-article-24",
      "tw-lsa-article-36",
    ]));
  });

  it("calculates overtime and annual leave through the shared rule interface", async () => {
    const engine = createTaiwanLaborRuleEngine();

    await expect(
      engine.evaluate(
        {
          ...baseContext,
          ruleKey: "tw.regular_day_overtime_pay",
        },
        {
          hourlyWage: 180,
          overtimeMinutes: 180,
        },
      ),
    ).resolves.toMatchObject({
      passed: true,
      result: {
        total: 780,
      },
      sourceIds: ["tw-lsa-article-24"],
    });

    await expect(
      engine.evaluate(
        {
          ...baseContext,
          ruleKey: "tw.annual_leave_entitlement",
        },
        {
          serviceMonths: 36,
        },
      ),
    ).resolves.toMatchObject({
      passed: true,
      result: {
        days: 14,
      },
      sourceIds: ["tw-lsa-article-38"],
    });
  });

  it("rejects unregistered rules and invalid inputs instead of silently passing", async () => {
    const engine = createTaiwanLaborRuleEngine();

    await expect(
      engine.evaluate(
        {
          ...baseContext,
          ruleKey: "tw.working_time",
        },
        {
          regularMinutes: "480",
          overtimeMinutes: 0,
          weeklyRegularMinutes: 2_400,
        },
      ),
    ).rejects.toThrow(/regularMinutes/);

    await expect(
      engine.evaluate(
        {
          ...baseContext,
          ruleKey: "tw.unknown" as RuleContext["ruleKey"],
        },
        {},
      ),
    ).rejects.toThrow(/not registered/);
  });
});
