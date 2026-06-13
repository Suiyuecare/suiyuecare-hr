import type {
  AiApprovalSummary,
  AiFormDraft,
  AiPayrollExplanation,
  AiPolicyAnswer,
  AiPromptCategory,
} from "./types";

type AiResult = {
  id: string;
  category: AiPromptCategory;
  createdAt: Date;
  result: AiPolicyAnswer | AiFormDraft | AiPayrollExplanation | AiApprovalSummary;
};

type AiUsageLog = {
  id: string;
  category: AiPromptCategory;
  actorUserId: string | null;
  referencedRecordIds: string[];
  outputHash: string;
  promptHash?: string;
  rawPromptStored: false;
  createdAt: Date;
};

type AiDemoState = {
  results: AiResult[];
  usageLogs: AiUsageLog[];
};

const globalForAi = globalThis as unknown as {
  hrOneAiDemoState?: AiDemoState;
};

export function getAiDemoState() {
  if (!globalForAi.hrOneAiDemoState) {
    globalForAi.hrOneAiDemoState = {
      results: [],
      usageLogs: [],
    };
  }
  return globalForAi.hrOneAiDemoState;
}

export function resetAiDemoState() {
  globalForAi.hrOneAiDemoState = {
    results: [],
    usageLogs: [],
  };
}

export function storeAiResult(
  category: AiPromptCategory,
  result: AiResult["result"],
) {
  const entry = {
    id: crypto.randomUUID(),
    category,
    result,
    createdAt: new Date(),
  };
  getAiDemoState().results.unshift(entry);
  return entry.id;
}

export function getAiResult(id: string | null | undefined) {
  if (!id) return null;
  return getAiDemoState().results.find((result) => result.id === id) ?? null;
}

export function logDemoAiUsage(input: Omit<AiUsageLog, "id" | "createdAt" | "rawPromptStored">) {
  getAiDemoState().usageLogs.unshift({
    ...input,
    id: crypto.randomUUID(),
    rawPromptStored: false,
    createdAt: new Date(),
  });
}
