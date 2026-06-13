export type WorkflowStepLike = {
  id: string;
  stepOrder: number;
  approverType: string;
  approverRef?: string | null;
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
}) {
  return [...input.steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .find((step) => step.stepOrder > input.currentStepOrder) ?? null;
}
