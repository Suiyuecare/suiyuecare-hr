export type WorkflowStepLike = {
  id: string;
  stepOrder: number;
  approverType: string;
  approverRef?: string | null;
  conditionJson?: unknown;
};

export type WorkflowCondition = {
  type: "field_equals";
  fieldId: string;
  expectedValue: string;
};

export function getStepLabel(step: Pick<WorkflowStepLike, "approverType">) {
  if (step.approverType === "hr_admin") return "HR review";
  if (step.approverType === "department_manager") return "Department manager review";
  if (step.approverType === "specific_user") return "Specific reviewer";
  if (step.approverType === "requester") return "Requester confirmation";
  return "Manager review";
}

export function findNextWorkflowStep(input: {
  steps: WorkflowStepLike[];
  currentStepOrder: number;
  values?: Record<string, string>;
}) {
  return [...input.steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .find((step) => step.stepOrder > input.currentStepOrder && stepConditionMatches(step.conditionJson, input.values ?? {})) ?? null;
}

export function stepConditionMatches(conditionJson: unknown, values: Record<string, string>) {
  const condition = readWorkflowCondition(conditionJson);
  if (!condition) return true;
  return normalizeValue(values[condition.fieldId]) === normalizeValue(condition.expectedValue);
}

export function readWorkflowCondition(conditionJson: unknown): WorkflowCondition | null {
  if (!conditionJson || typeof conditionJson !== "object" || Array.isArray(conditionJson)) return null;
  const record = conditionJson as Record<string, unknown>;
  if (
    record.type === "field_equals" &&
    typeof record.fieldId === "string" &&
    record.fieldId.trim() &&
    typeof record.expectedValue === "string" &&
    record.expectedValue.trim()
  ) {
    return {
      type: "field_equals",
      fieldId: record.fieldId.trim(),
      expectedValue: record.expectedValue.trim(),
    };
  }
  return null;
}

function normalizeValue(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}
