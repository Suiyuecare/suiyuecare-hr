import type { RoleKey } from "@/server/auth/rbac";
import type { FormField, WorkflowStepTemplate } from "@/server/workflows/types";

export type AiPromptCategory =
  | "policy_qa"
  | "payroll_exception_explainer"
  | "form_generator"
  | "approval_summary";

export type AiSessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user: { id: string; displayName: string } | null;
  employee: { id: string; displayName: string } | null;
};

export type AiSourceReference = {
  id: string;
  title: string;
  excerpt: string;
};

export type AiPolicyAnswer = {
  label: "AI suggestion";
  answer: string;
  confidence: "sufficient" | "insufficient";
  sources: AiSourceReference[];
  outputHash: string;
};

export type AiFormDraft = {
  label: "AI draft";
  title: string;
  description: string;
  category: string;
  fields: FormField[];
  workflowSteps: WorkflowStepTemplate[];
  safetyNote: string;
  outputHash: string;
};

export type AiPayrollExplanation = {
  label: "AI suggestion";
  summary: string;
  contributingRecords: AiSourceReference[];
  nextSteps: string[];
  outputHash: string;
};

export type AiApprovalSummary = {
  label: "AI suggestion";
  summary: string;
  verify: string[];
  outputHash: string;
};
