import { describe, expect, it } from "vitest";
import { findNextWorkflowStep, getStepLabel } from "./workflow-engine";

describe("workflow engine helpers", () => {
  it("finds the next workflow step by step order", () => {
    const steps = [
      { id: "hr", stepOrder: 2, approverType: "hr_admin" },
      { id: "manager", stepOrder: 1, approverType: "direct_manager" },
    ];

    expect(findNextWorkflowStep({ steps, currentStepOrder: 1 })).toMatchObject({
      id: "hr",
      stepOrder: 2,
    });
    expect(findNextWorkflowStep({ steps, currentStepOrder: 2 })).toBeNull();
  });

  it("labels common approver types in plain language", () => {
    expect(getStepLabel({ approverType: "direct_manager" })).toBe("Manager review");
    expect(getStepLabel({ approverType: "hr_admin" })).toBe("HR review");
    expect(getStepLabel({ approverType: "department_manager" })).toBe("Department manager review");
  });
});
