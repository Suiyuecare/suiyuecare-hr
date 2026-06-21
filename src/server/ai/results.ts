import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { getAiResult as getDemoAiResult, storeAiResult as storeDemoAiResult } from "./demo-store";
import type {
  AiApprovalSummary,
  AiFormDraft,
  AiPayrollExplanation,
  AiPolicyAnswer,
  AiPromptCategory,
  AiSessionLike,
} from "./types";

export type AiCopilotResultPayload =
  | AiPolicyAnswer
  | AiFormDraft
  | AiPayrollExplanation
  | AiApprovalSummary;

export type AiCopilotResultRecord = {
  id: string;
  category: AiPromptCategory;
  createdAt: Date;
  result: AiCopilotResultPayload;
};

const resultTtlMs = 24 * 60 * 60 * 1000;

export async function storeAiResult(
  session: AiSessionLike,
  category: AiPromptCategory,
  result: AiCopilotResultPayload,
) {
  if (!process.env.DATABASE_URL) {
    return storeDemoAiResult(category, result);
  }
  assertDatabaseResultContext(session);
  const created = await getDb().aiCopilotResult.create({
    data: {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user.id,
      category,
      resultJson: result as unknown as Prisma.InputJsonValue,
      outputHash: readOutputHash(result),
      expiresAt: new Date(Date.now() + resultTtlMs),
    },
  });
  return created.id;
}

export async function getAiResult(
  session: AiSessionLike,
  id: string | null | undefined,
): Promise<AiCopilotResultRecord | null> {
  if (!id) return null;
  if (!process.env.DATABASE_URL) {
    return getDemoAiResult(id) as AiCopilotResultRecord | null;
  }
  assertDatabaseResultContext(session);
  const record = await getDb().aiCopilotResult.findFirst({
    where: {
      id,
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user.id,
      expiresAt: { gt: new Date() },
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    category: record.category as AiPromptCategory,
    createdAt: record.createdAt,
    result: record.resultJson as AiCopilotResultPayload,
  };
}

function assertDatabaseResultContext(
  session: AiSessionLike,
): asserts session is AiSessionLike & {
  tenantId: string;
  companyId: string;
  user: { id: string; displayName: string };
} {
  if (!session.tenantId || !session.companyId || !session.user?.id) {
    throw new Error("AI Copilot result storage requires tenant, company, and user context in database mode.");
  }
}

function readOutputHash(result: AiCopilotResultPayload) {
  return typeof result.outputHash === "string" && result.outputHash ? result.outputHash : null;
}
