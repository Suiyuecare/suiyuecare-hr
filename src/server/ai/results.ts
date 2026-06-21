import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
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

export type AiCopilotResultCleanupResult = {
  expiredCount: number;
  skippedCount: number;
  resultIds: string[];
};

const resultTtlMs = 24 * 60 * 60 * 1000;
const defaultCleanupLimit = 100;
const maxCleanupLimit = 500;

export async function storeAiResult(
  session: AiSessionLike,
  category: AiPromptCategory,
  result: AiCopilotResultPayload,
) {
  if (!process.env.DATABASE_URL) {
    return storeDemoAiResult(category, result);
  }
  assertDatabaseResultContext(session);
  const outputHash = readOutputHash(result);
  const expiresAt = new Date(Date.now() + resultTtlMs);
  const created = await getDb().$transaction(async (tx) => {
    const record = await tx.aiCopilotResult.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        actorUserId: session.user.id,
        category,
        resultJson: result as unknown as Prisma.InputJsonValue,
        outputHash,
        expiresAt,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user.id,
      actorEmployeeId: session.employee?.id ?? null,
      action: "create",
      entityType: "ai_copilot_result",
      entityId: record.id,
      after: {
        category,
        outputHash,
        expiresAt: expiresAt.toISOString(),
      },
      metadata: resultAuditMetadata(category, outputHash, expiresAt, "temporary_result_store"),
    });
    return record;
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

export async function cleanupExpiredAiResults(
  session: AiSessionLike,
  input: { limit?: number | string | null; now?: Date | null } = {},
): Promise<AiCopilotResultCleanupResult> {
  if (!process.env.DATABASE_URL) {
    return { expiredCount: 0, skippedCount: 0, resultIds: [] };
  }

  assertDatabaseResultContext(session);
  const now = input.now ?? new Date();
  const limit = normalizeCleanupLimit(input.limit);
  const db = getDb();
  const records = await db.aiCopilotResult.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      actorUserId: true,
      category: true,
      outputHash: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });

  if (records.length === 0) {
    return { expiredCount: 0, skippedCount: 0, resultIds: [] };
  }

  const resultIds: string[] = [];
  let skippedCount = 0;
  await db.$transaction(async (tx) => {
    for (const record of records) {
      const deleted = await tx.aiCopilotResult.deleteMany({
        where: {
          id: record.id,
          tenantId: session.tenantId,
          companyId: session.companyId,
          expiresAt: { lte: now },
        },
      });
      if (deleted.count === 0) {
        skippedCount += 1;
        continue;
      }

      await writeAuditLog(tx, {
        tenantId: session.tenantId,
        companyId: session.companyId,
        actorUserId: session.user.id,
        actorEmployeeId: session.employee?.id ?? null,
        action: "delete",
        entityType: "ai_copilot_result",
        entityId: record.id,
        before: {
          category: record.category,
          outputHash: record.outputHash,
          createdAt: record.createdAt.toISOString(),
          expiresAt: record.expiresAt.toISOString(),
          actorUserId: record.actorUserId,
        },
        after: {
          deleted: true,
          deletedAt: now.toISOString(),
        },
        metadata: resultAuditMetadata(
          record.category as AiPromptCategory,
          record.outputHash,
          record.expiresAt,
          "expired_ai_result_cleanup",
        ),
      });
      resultIds.push(record.id);
    }
  });

  return {
    expiredCount: resultIds.length,
    skippedCount,
    resultIds,
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

function normalizeCleanupLimit(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return defaultCleanupLimit;
  return Math.max(1, Math.min(maxCleanupLimit, Math.trunc(parsed)));
}

function resultAuditMetadata(
  category: AiPromptCategory,
  outputHash: string | null,
  expiresAt: Date,
  maintenanceAction: "temporary_result_store" | "expired_ai_result_cleanup",
) {
  return {
    aiCategory: category,
    outputHash,
    expiresAt: expiresAt.toISOString(),
    maintenanceAction,
    ttlHours: resultTtlMs / (60 * 60 * 1000),
    resultJsonStoredInAudit: false,
    rawResultStoredInAudit: false,
  };
}
