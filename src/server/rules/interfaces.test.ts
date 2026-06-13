import { describe, expect, it } from "vitest";
import { PlaceholderRuleEngine } from "./interfaces";

describe("PlaceholderRuleEngine", () => {
  it("returns a deterministic placeholder response with the rule version id", async () => {
    const engine = new PlaceholderRuleEngine();

    const result = await engine.evaluate(
      {
        tenantId: "tenant_1",
        companyId: "company_1",
        ruleVersionId: "rule_version_1",
        effectiveAt: new Date("2026-06-12T00:00:00.000Z"),
      },
      {
        overtimeMinutes: 0,
      },
    );

    expect(result.ruleVersionId).toBe("rule_version_1");
    expect(result.passed).toBe(true);
    expect(result.explanation).toContain("cannot make employment or payroll decisions");
  });
});

