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
  const sources = await findPolicySources(session, sanitizedQuestion);

  const draft =
    sources.length === 0
      ? {
          label: "AI 建議" as const,
          answer:
            "目前沒有核准的公司政策或版本化規則可佐證這題，因此我不能有信心回答。請先補上已核准的政策摘錄或規則來源。",
          confidence: "insufficient" as const,
          sources: [],
          outputHash: "",
        }
      : {
          label: "AI 建議" as const,
          answer: `依據 HR One 已核准來源整理：${sources
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
  const hrCondition = inferHrReviewCondition(sanitizedPrompt);
  const fields = inferFormFields(sanitizedPrompt);
  const draft: AiFormDraft = {
    label: "AI 草稿",
    title,
    description: `依 HR 描述產生草稿：${shorten(sanitizedPrompt, 96)}`,
    category: inferCategory(sanitizedPrompt),
    fields,
    workflowSteps: [
      {
        id: "draft-step-manager",
        order: 1,
        label: "直屬主管審核",
        approverType: "direct_manager",
        conditionPlaceholder: null,
        condition: null,
      },
      {
        id: "draft-step-hr",
        order: 2,
        label: hrCondition ? "符合條件時加簽 HR" : "HR 複核",
        approverType: "hr_admin",
        conditionPlaceholder: null,
        condition: hrCondition,
      },
    ],
    safetyNote: "AI 只產生表單與流程草稿，HR 必須檢查欄位、簽核條件與敏感決策限制後，才可以儲存。",
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
        label: "AI 建議",
        summary: `${item.employeeName} 的「${item.name}」需要 HR 複核，因為它受到已審核的薪資規則、出勤彙總或已核准申請紀錄影響。此解釋刻意不顯示薪資金額。`,
        contributingRecords,
        nextSteps: [
          "薪資鎖定前先確認出勤完整性。",
          "核對已核准加班、請假與補打卡時間線。",
          "若紀錄互相衝突，交由 HR 人工確認後再進入月結。",
        ],
        outputHash: "",
      }
    : {
        label: "AI 建議",
        summary: "目前還沒有可解釋的薪資項目。請先建立薪資批次並完成草稿計算。",
        contributingRecords,
        nextSteps: ["建立薪資批次。", "處理月結阻擋項。", "完成草稿計算後再檢查異常。"],
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
    label: "AI 建議",
    summary: `${request.employeeName} 送出「${localizeRequestTitle(request.title)}」。${shorten(request.detail, 120)}`,
    verify: [
      request.riskSummary,
      "請確認日期、餘額、附件證據中繼資料與目前簽核關卡。",
      "最後核准或退回必須由主管自行決定。",
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
  if (/training|course|learning|訓練|課程|證照/.test(prompt.toLowerCase())) return "訓練申請單";
  if (/equipment|laptop|badge|設備|識別證/.test(prompt.toLowerCase())) return "設備申請單";
  return "員工服務申請單";
}

function localizeRequestTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  if (normalized === "annual leave") return "特休申請";
  if (normalized === "overtime request") return "加班申請";
  if (normalized === "punch correction") return "補打卡申請";
  if (normalized === "payroll adjustment") return "薪資調整申請";
  return title;
}

function inferCategory(prompt: string) {
  if (/training|course|learning|訓練|課程|證照/.test(prompt.toLowerCase())) return "訓練發展";
  if (/equipment|laptop|badge|設備|識別證/.test(prompt.toLowerCase())) return "員工服務";
  return "人資服務";
}

function inferPrimaryField(prompt: string) {
  if (/training|course|learning|訓練|課程|證照/.test(prompt.toLowerCase())) return "訓練課程";
  if (/equipment|laptop|badge|設備|識別證/.test(prompt.toLowerCase())) return "申請項目";
  return "需求說明";
}

function inferFormFields(prompt: string): AiFormDraft["fields"] {
  const lower = prompt.toLowerCase();
  const primaryType = /type|category|種類|類型/.test(lower) ? "select" : "text";
  const primaryOptions = primaryType === "select" ? ["一般", "其他"] : undefined;
  const notesVisibility = primaryType === "select"
    ? { type: "field_equals" as const, fieldId: "primary", expectedValue: "其他" }
    : null;

  return [
    {
      id: "primary",
      label: inferPrimaryField(prompt),
      type: primaryType,
      required: true,
      options: primaryOptions,
    },
    { id: "needed_by", label: "希望完成日", type: "date", required: false },
    {
      id: "notes",
      label: "補充說明",
      type: "textarea",
      required: false,
      visibilityRule: notesVisibility,
    },
  ];
}

function inferHrReviewCondition(prompt: string) {
  const lower = prompt.toLowerCase();
  if (/external|certification|vendor|outside|外部|證照|廠商/.test(lower)) {
    return {
      type: "field_equals" as const,
      fieldId: "primary",
      expectedValue: "外部證照",
    };
  }
  return null;
}

function findDefaultPayrollItem(items: PayrollItemView[] | undefined) {
  return items?.find((item) => item.kind === "overtime") ?? items?.[0] ?? null;
}

function payrollSources(item: PayrollItemView | null | undefined): AiSourceReference[] {
  if (!item) return [];
  const sources: AiSourceReference[] = [
    {
      id: `payroll-item:${item.employeeId}:${item.code}`,
      title: "薪資項目草稿",
      excerpt: `${item.employeeName} 的「${item.name}」；AI context 已排除金額。`,
    },
  ];
  if (item.kind === "overtime") {
    sources.push({
      id: "overtime-request:approved-demo-90",
      title: "已核准加班紀錄",
      excerpt: "已核准加班分鐘數依設定的薪資規則納入計算。",
    });
  }
  sources.push({
    id: "attendance-summary:demo-month",
    title: "出勤完整性彙總",
    excerpt: "薪資鎖定前會檢查出勤完整性與待簽核項目。",
  });
  return sources;
}

function shorten(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}
