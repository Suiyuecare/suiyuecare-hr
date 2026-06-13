import type { AiSourceReference } from "./types";

type PolicyDoc = AiSourceReference & {
  keywords: string[];
};

export const approvedPolicyDocs: PolicyDoc[] = [
  {
    id: "policy-leave-annual-v1",
    title: "Annual Leave Policy v1",
    excerpt:
      "Employees submit leave requests with dates, units, and reason. Balance is reserved when submitted and finalized only after manager approval.",
    keywords: ["leave", "annual", "vacation", "balance", "請假", "特休", "休假"],
  },
  {
    id: "rule-overtime-demo-2026-06",
    title: "Taiwan Overtime Rule Placeholder 2026.06",
    excerpt:
      "Overtime requests include start time, end time, and reason. HR One warns when total daily work time exceeds the configured threshold.",
    keywords: ["overtime", "threshold", "加班", "工時"],
  },
  {
    id: "policy-payroll-close-v1",
    title: "Payroll Close Policy v1",
    excerpt:
      "Payroll must pass attendance completeness, pending approval, calculation draft, exception review, HR confirmation, lock, and payslip release steps.",
    keywords: ["payroll", "close", "payslip", "salary", "薪資", "月結", "薪資單"],
  },
  {
    id: "policy-ai-safety-v1",
    title: "AI Safety Policy v1",
    excerpt:
      "AI may summarize, explain, draft, and recommend verification steps. AI must not make final hiring, firing, compensation, performance, or disciplinary decisions.",
    keywords: ["ai", "copilot", "decision", "safety", "人工智慧", "決策"],
  },
];

export function findPolicySources(question: string) {
  const normalized = question.toLowerCase();
  return approvedPolicyDocs.filter((doc) =>
    doc.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  );
}
