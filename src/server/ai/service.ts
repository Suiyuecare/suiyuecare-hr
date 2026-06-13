import { assertPermission } from "@/server/auth/rbac";
import { getDemoPayrollRun } from "@/server/payroll/demo-store";
import type { PayrollItemView } from "@/server/payroll/types";
import type { WorkflowRequest } from "@/server/workflows/types";
import { auditAiUsage } from "./audit";
import { findPolicySources } from "./policy-docs";
import { assertSafeAiUse, stripUnnecessaryPii } from "./safety";
import type {
  AiApprovalSummary,
  AiFormDraft,
  AiPayrollExplanation,
  AiPolicyAnswer,
  AiSessionLike,
  AiSourceReference,
} from "./types";

export async function answerPolicyQuestion(
  session: AiSessionLike,
  question: string,
): Promise<AiPolicyAnswer> {
  assertPermission(session.role, "ai:policy");
  const sanitizedQuestion = stripUnnecessaryPii(question);
  assertSafeAiUse({ category: "policy_qa", prompt: sanitizedQuestion });
  const sources = findPolicySources(sanitizedQuestion);

  const draft =
    sources.length === 0
      ? {
          label: "AI suggestion" as const,
          answer:
            "I cannot answer confidently because no approved policy document or configured rule matched the question.",
          confidence: "insufficient" as const,
          sources: [],
          outputHash: "",
        }
      : {
          label: "AI suggestion" as const,
          answer: `Based on approved HR One sources: ${sources
            .map((source) => source.excerpt)
            .join(" ")}`,
          confidence: "sufficient" as const,
          sources,
          outputHash: "",
        };
  const outputHash = await auditAiUsage({
    session,
    category: "policy_qa",
    prompt: sanitizedQuestion,
    referencedRecordIds: sources.map((source) => source.id),
    output: draft,
  });
  return { ...draft, outputHash };
}

export async function draftFormFromPrompt(
  session: AiSessionLike,
  prompt: string,
): Promise<AiFormDraft> {
  assertPermission(session.role, "ai:form_builder");
  const sanitizedPrompt = stripUnnecessaryPii(prompt);
  assertSafeAiUse({ category: "form_generator", prompt: sanitizedPrompt });
  const title = inferFormTitle(sanitizedPrompt);
  const draft: AiFormDraft = {
    label: "AI draft",
    title,
    description: `Drafted from HR request: ${shorten(sanitizedPrompt, 96)}`,
    category: inferCategory(sanitizedPrompt),
    fields: [
      { id: "primary", label: inferPrimaryField(sanitizedPrompt), type: "text", required: true },
      { id: "needed_by", label: "Needed by", type: "date", required: false },
      { id: "notes", label: "Notes", type: "textarea", required: false },
    ],
    workflowSteps: [
      {
        id: "draft-step-manager",
        order: 1,
        label: "Manager review",
        approverType: "direct_manager",
        conditionPlaceholder: "Conditional step placeholder",
      },
      {
        id: "draft-step-hr",
        order: 2,
        label: "HR review",
        approverType: "hr_admin",
        conditionPlaceholder: "Conditional step placeholder",
      },
    ],
    safetyNote: "AI drafted this form. HR must review and confirm before saving.",
    outputHash: "",
  };
  const outputHash = await auditAiUsage({
    session,
    category: "form_generator",
    prompt: sanitizedPrompt,
    referencedRecordIds: [],
    output: draft,
  });
  return { ...draft, outputHash };
}

export async function explainPayrollException(
  session: AiSessionLike,
  itemCode?: string,
): Promise<AiPayrollExplanation> {
  assertPermission(session.role, "ai:payroll_explain");
  const run = getDemoPayrollRun();
  const item = run?.items.find((candidate) => candidate.code === itemCode) ?? findDefaultPayrollItem(run?.items);
  const contributingRecords = payrollSources(item);
  const draft: AiPayrollExplanation = item
    ? {
        label: "AI suggestion",
        summary: `${item.employeeName}'s ${item.name} is unusual because it depends on the reviewed payroll rule configuration and related attendance or approved request records. Amounts are intentionally not shown in this explanation.`,
        contributingRecords,
        nextSteps: [
          "Verify attendance completeness before payroll lock.",
          "Check approved overtime, leave, and punch correction timelines.",
          "Escalate to HR confirmation if records conflict.",
        ],
        outputHash: "",
      }
    : {
        label: "AI suggestion",
        summary: "No calculated payroll item is available yet. Create and calculate a payroll run first.",
        contributingRecords,
        nextSteps: ["Create payroll run.", "Resolve blockers.", "Calculate draft before reviewing exceptions."],
        outputHash: "",
      };
  const outputHash = await auditAiUsage({
    session,
    category: "payroll_exception_explainer",
    referencedRecordIds: contributingRecords.map((source) => source.id),
    output: draft,
  });
  return { ...draft, outputHash };
}

export async function summarizeApprovalRequest(
  session: AiSessionLike,
  request: WorkflowRequest,
): Promise<AiApprovalSummary> {
  assertPermission(session.role, "ai:approval_summary");
  const draft: AiApprovalSummary = {
    label: "AI suggestion",
    summary: `${request.employeeName} submitted ${request.title}. ${shorten(request.detail, 120)}`,
    verify: [
      request.riskSummary,
      "Check dates, balance, attached metadata placeholders, and current approval step.",
      "Make the final approve or reject decision yourself.",
    ],
    outputHash: "",
  };
  const outputHash = await auditAiUsage({
    session,
    category: "approval_summary",
    referencedRecordIds: [request.id],
    output: draft,
  });
  return { ...draft, outputHash };
}

function inferFormTitle(prompt: string) {
  if (/training|course|learning|訓練|課程/.test(prompt.toLowerCase())) return "Training request";
  if (/equipment|laptop|badge|設備|識別證/.test(prompt.toLowerCase())) return "Equipment request";
  return "Employee request";
}

function inferCategory(prompt: string) {
  if (/training|course|learning|訓練|課程/.test(prompt.toLowerCase())) return "Learning";
  if (/equipment|laptop|badge|設備|識別證/.test(prompt.toLowerCase())) return "Employee service";
  return "HR service";
}

function inferPrimaryField(prompt: string) {
  if (/training|course|learning|訓練|課程/.test(prompt.toLowerCase())) return "Training course";
  if (/equipment|laptop|badge|設備|識別證/.test(prompt.toLowerCase())) return "Requested item";
  return "Request detail";
}

function findDefaultPayrollItem(items: PayrollItemView[] | undefined) {
  return items?.find((item) => item.kind === "overtime") ?? items?.[0] ?? null;
}

function payrollSources(item: PayrollItemView | null | undefined): AiSourceReference[] {
  if (!item) return [];
  const sources: AiSourceReference[] = [
    {
      id: `payroll-item:${item.employeeId}:${item.code}`,
      title: "Payroll item draft",
      excerpt: `${item.name} for ${item.employeeName}; monetary amount omitted from AI context.`,
    },
  ];
  if (item.kind === "overtime") {
    sources.push({
      id: "overtime-request:approved-demo-90",
      title: "Approved overtime record",
      excerpt: "Approved overtime minutes contributed through the configured payroll rule.",
    });
  }
  sources.push({
    id: "attendance-summary:demo-month",
    title: "Attendance completeness summary",
    excerpt: "Monthly close uses attendance completeness and pending approval checks before payroll lock.",
  });
  return sources;
}

function shorten(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}
