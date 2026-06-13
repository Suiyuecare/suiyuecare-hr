export type RuleContext = {
  tenantId: string;
  companyId: string;
  ruleVersionId: string;
  effectiveAt: Date;
};

export type RuleEvaluationResult = {
  ruleVersionId: string;
  passed: boolean;
  result: Record<string, unknown>;
  explanation: string;
};

export interface RuleEngine {
  evaluate(
    context: RuleContext,
    input: Record<string, unknown>,
  ): Promise<RuleEvaluationResult>;
}

export class PlaceholderRuleEngine implements RuleEngine {
  async evaluate(
    context: RuleContext,
    input: Record<string, unknown>,
  ): Promise<RuleEvaluationResult> {
    return {
      ruleVersionId: context.ruleVersionId,
      passed: true,
      result: {
        status: "placeholder",
        inputKeys: Object.keys(input),
      },
      explanation:
        "Rule engine placeholder only. AI may explain results later, but cannot make employment or payroll decisions.",
    };
  }
}

