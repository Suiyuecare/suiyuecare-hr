import { beforeEach, describe, expect, it } from "vitest";
import { resetAiDemoState } from "./demo-store";
import { resetPolicyDocumentDemoState, savePolicyDocument } from "./policy-docs";
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
  summarizeApprovalRequest,
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
    resetPolicyDocumentDemoState();
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

  it("uses HR-approved company policy sources and ignores inactive drafts", async () => {
    await savePolicyDocument(hrSession, {
      title: "Remote work policy",
      category: "Workplace",
      status: "approved",
      version: "v2",
      sourceRef: "handbook://remote/v2",
      excerpt: "Remote work requests must include work dates, manager acknowledgement, and emergency contact availability.",
      keywords: "remote, work, hybrid, 遠端",
    });
    await savePolicyDocument(hrSession, {
      title: "Inactive cafeteria policy",
      category: "Workplace",
      status: "inactive",
      excerpt: "This inactive policy should not be cited by AI policy answers.",
      keywords: "cafeteria",
    });

    const remote = await answerPolicyQuestion(hrSession, "How does remote work approval happen?");
    const cafeteria = await answerPolicyQuestion(hrSession, "cafeteria");

    expect(remote.sources.map((source) => source.title)).toContain("Remote work policy · v2");
    expect(cafeteria.confidence).toBe("insufficient");
  });

  it("blocks sensitive final decision prompts", async () => {
    await expect(
      draftFormFromPrompt(hrSession, "Decide which employee should be fired after performance review."),
    ).rejects.toThrow(/human-only workflow/);
  });

  it("drafts confirmable form workflow conditions without placeholders", async () => {
    const draft = await draftFormFromPrompt(
      hrSession,
      "Create an external certification training request form with conditional HR review.",
    );

    expect(JSON.stringify(draft)).not.toContain("placeholder");
    expect(draft.workflowSteps.find((step) => step.approverType === "hr_admin")).toMatchObject({
      condition: {
        type: "field_equals",
        fieldId: "primary",
        expectedValue: "External certification",
      },
    });
    expect(draft.workflowSteps[0].condition).toBeNull();
  });

  it("summarizes approvals using attachment evidence metadata language", async () => {
    const summary = await summarizeApprovalRequest(hrSession, {
      id: "request-1",
      type: "leave",
      employeeId: "employee-1",
      employeeName: "張小安",
      managerId: "manager-1",
      status: "pending",
      title: "Annual leave",
      detail: "2026-06-14 09:00 - 2026-06-14 18:00",
      riskSummary: "1 attachment reference · pending scan",
      createdAt: new Date(),
      timeline: [],
    });

    expect(summary.label).toBe("AI 建議");
    expect(summary.summary).toContain("特休申請");
    expect(summary.verify.join(" ")).toContain("附件證據中繼資料");
    expect(summary.verify.join(" ")).not.toContain("placeholder");
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
