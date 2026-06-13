import { beforeEach, describe, expect, it } from "vitest";
import { resetAiDemoState } from "./demo-store";
import {
  calculateDemoPayrollRun,
  createDemoPayrollRun,
  resetPayrollDemoState,
  resolveDemoPayrollBlockers,
} from "@/server/payroll/demo-store";
import {
  answerPolicyQuestion,
  draftFormFromPrompt,
  explainPayrollException,
} from "./service";
import type { AiSessionLike } from "./types";

const hrSession: AiSessionLike = {
  role: "hr_admin",
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const employeeSession: AiSessionLike = {
  ...hrSession,
  role: "employee",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("AI Copilot safety", () => {
  beforeEach(() => {
    resetAiDemoState();
    resetPayrollDemoState();
  });

  it("answers policy questions only when approved sources match", async () => {
    const answer = await answerPolicyQuestion(hrSession, "How is annual leave balance handled?");
    expect(answer.confidence).toBe("sufficient");
    expect(answer.sources[0].id).toBe("policy-leave-annual-v1");
  });

  it("returns insufficient evidence when no source matches", async () => {
    const answer = await answerPolicyQuestion(hrSession, "What is the cafeteria menu tomorrow?");
    expect(answer.confidence).toBe("insufficient");
    expect(answer.sources).toHaveLength(0);
  });

  it("blocks sensitive final decision prompts", async () => {
    await expect(
      draftFormFromPrompt(hrSession, "Decide which employee should be fired after performance review."),
    ).rejects.toThrow(/human-only workflow/);
  });

  it("prevents employee role from explaining payroll exceptions", async () => {
    await expect(explainPayrollException(employeeSession, "overtime")).rejects.toThrow(
      /cannot ai:payroll_explain/,
    );
  });

  it("does not expose payroll amounts in exception explanations", async () => {
    createDemoPayrollRun();
    resolveDemoPayrollBlockers();
    calculateDemoPayrollRun();
    const explanation = await explainPayrollException(hrSession, "overtime");
    expect(explanation.summary).toContain("Amounts are intentionally not shown");
    expect(explanation.summary).not.toMatch(/\$\d|NT|TWD|\d{4,}/);
  });
});
