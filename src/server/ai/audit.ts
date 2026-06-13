import { Prisma, type PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { redactSensitivePayload, stableHash } from "@/server/audit/redaction";
import { logDemoAiUsage } from "./demo-store";
import type { AiPromptCategory, AiSessionLike } from "./types";

type AiAuditInput = {
  session: AiSessionLike;
  category: AiPromptCategory;
  prompt?: string;
  referencedRecordIds: string[];
  output: unknown;
};

type TxClient = Prisma.TransactionClient | PrismaClient;

export async function auditAiUsage(input: AiAuditInput) {
  const outputHash = stableHash(redactSensitivePayload(input.output));
  const promptHash = input.prompt
    ? stableHash(redactSensitivePayload({ prompt: input.prompt }))
    : undefined;

  if (!canUseDatabase(input.session)) {
    logDemoAiUsage({
      category: input.category,
      actorUserId: input.session.user?.id ?? null,
      referencedRecordIds: input.referencedRecordIds,
      outputHash,
      promptHash,
    });
    return outputHash;
  }

  try {
    await writeAiUsageLog(getDb(), input, outputHash, promptHash);
  } catch {
    logDemoAiUsage({
      category: input.category,
      actorUserId: input.session.user?.id ?? null,
      referencedRecordIds: input.referencedRecordIds,
      outputHash,
      promptHash,
    });
  }
  return outputHash;
}

async function writeAiUsageLog(
  db: TxClient,
  input: AiAuditInput,
  outputHash: string,
  promptHash?: string,
) {
  await db.aiUsageLog.create({
    data: {
      tenantId: input.session.tenantId!,
      companyId: input.session.companyId!,
      actorUserId: input.session.user?.id ?? null,
      category: input.category,
      promptHash: promptHash ?? null,
      referencedRecordIdsJson: input.referencedRecordIds as Prisma.InputJsonValue,
      outputHash,
      rawPromptStored: false,
    },
  });
}

function canUseDatabase(session: AiSessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
